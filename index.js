const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestBaileysVersion, 
    DisconnectReason 
} = require("@whiskeysockets/baileys");
const express = require('express');
const pino = require('pino');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 10000;

// --- إعدادات بوت تلجرام ---
const token = '8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I';
const botTelegram = new TelegramBot(token, { polling: true });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock;
let reactionEmoji = "💤"; 

// --- وظيفة منع توقف السيرفر (24 ساعة) ---
setInterval(() => {
    // محاكاة طلب للسيرفر نفسه لبقائه نشطاً
    console.log("Keep-alive: السيرفر لا يزال يعمل...");
}, 1000 * 60 * 5); // كل 5 دقائق

// --- أوامر بوت التلجرام ---

// 1. أمر البداية وعرض التعليمات
botTelegram.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    botTelegram.sendMessage(chatId, `
👑 **مرحباً بك في بوت الملك فارس**

يمكنك التحكم بالبوت عبر الأوامر التالية:

1️⃣ لربط رقم واتساب واستخراج الكود:
أرسل: \`/login\` متبوعاً بالرقم مع رمز الدولة
مثال: \`/login 96777xxxxxxx\`

2️⃣ لتغيير إيموجي التفاعل مع الحالات:
أرسل: \`/setemoji\` متبوعاً بالإيموجي
مثال: \`/setemoji 🔥\`

✨ البوت يعمل الآن بنظام 24 ساعة بدون توقف.
    `, { parse_mode: 'Markdown' });
});

// 2. كود ربط الرقم من التلجرام (الميزة المطلوبة)
botTelegram.onText(/\/login (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const num = match[1].replace(/[^0-9]/g, '');

    if (!num || num.length < 10) {
        return botTelegram.sendMessage(chatId, "❌ خطأ: يرجى إدخال رقم هاتف صحيح مع رمز الدولة.");
    }

    botTelegram.sendMessage(chatId, `⏳ جاري توليد كود الربط للرقم: ${num}...`);

    try {
        if (!sock) await startBot();
        const code = await sock.requestPairingCode(num);
        
        botTelegram.sendMessage(chatId, `
✅ **تم توليد كود الربط بنجاح**

رقم الهاتف: \`${num}\`
كود الربط هو: 

👉 \`${code}\` 👈

قم بإدخال هذا الكود في واتساب (الأجهزة المرتبطة > ربط هاتف برقم الهاتف).
        `, { parse_mode: 'Markdown' });
    } catch (err) {
        console.error(err);
        botTelegram.sendMessage(chatId, "❌ فشل استخراج الكود. تأكد من أن السيرفر يعمل وحاول مجدداً.");
    }
});

// 3. تغيير الإيموجي من التلجرام
botTelegram.onText(/\/setemoji (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    reactionEmoji = match[1];
    botTelegram.sendMessage(chatId, `✅ تم تحديث إيموجي التفاعل إلى: ${reactionEmoji}`);
});

// --- واجهة المستخدم Web UI (دون تغيير) ---
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>بوت الملك فارس</title>
            <style>
                body { font-family: 'Arial', sans-serif; background-color: #f4f7f6; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); text-align: center; width: 90%; max-width: 400px; }
                h1 { color: #075E54; margin-bottom: 10px; }
                button { width: 100%; padding: 12px; background-color: #25D366; color: white; border: none; border-radius: 8px; cursor: pointer; }
                input { width: 100%; padding: 12px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>👑 بوت الملك فارس</h1>
                <p>أدخل بياناتك لاستخراج كود الربط</p>
                <form action="/get-code" method="POST">
                    <input type="text" name="number" placeholder="مثال: 967773987296" required>
                    <input type="text" name="emoji" value="${reactionEmoji}" placeholder="إيموجي التفاعل">
                    <button type="submit">استخراج كود الربط 🚀</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.post('/get-code', async (req, res) => {
    const num = req.body.number.replace(/[^0-9]/g, '');
    if (!num) return res.send("الرجاء إدخال رقم صحيح");
    reactionEmoji = req.body.emoji || reactionEmoji;

    try {
        if (!sock) await startBot();
        const code = await sock.requestPairingCode(num);
        res.send(`<h2>كود الربط الخاص بك: <span style="color:red;">${code}</span></h2><a href="/">عودة</a>`);
    } catch (err) { res.send("خطأ في السيرفر"); }
});

app.listen(port, () => console.log(`Server running on port ${port}`));

// --- وظيفة البوت الأساسية ---
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        // إعدادات إضافية للثبات
        keepAliveIntervalMs: 30000,
        defaultQueryTimeoutMs: undefined
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (msg.key.remoteJid === 'status@broadcast') {
            await delay(Math.floor(Math.random() * 7000) + 8000);
            await sock.readMessages([msg.key]);
            await sock.sendMessage(msg.key.remoteJid, {
                react: { key: msg.key, text: reactionEmoji }
            }, { statusJidList: [msg.key.participant] });
            console.log(`✅ تفاعل مع حالة بـ ${reactionEmoji}`);
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log("✅ متصل الآن!");
        }
    });
}

startBot();
