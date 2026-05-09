const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestBaileysVersion, 
    DisconnectReason 
} = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const pino = require('pino');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const port = process.env.PORT || 10000;

// --- إعدادات البوت ---
const tgToken = '8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I';
const developerId = 7231690686;
const whatsappChannel = '0029Vb73l855K3zVq2QgsH1M'; // معرف القناة من الرابط

const bot = new TelegramBot(tgToken, { polling: true });
const activeSocks = new Map(); // لتخزين جلسات الواتساب النشطة
const userEmojis = new Map(); // لتخزين إيموجي كل مستخدم

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- واجهة الويب (بوت الملك فارس) ---
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
                input { width: 100%; padding: 12px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; text-align: center; font-size: 16px; }
                button { width: 100%; padding: 12px; background-color: #25D366; color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; transition: 0.3s; }
                button:hover { background-color: #128C7E; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>👑 بوت الملك فارس</h1>
                <p>أدخل رقمك مع مفتاح الدولة (بدون +)</p>
                <form action="/get-code" method="POST">
                    <input type="text" name="number" placeholder="مثال: 967773987296" required>
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

    // نستخدم "web-session" كتعريف لجلسة الويب العامة
    const code = await startWhatsAppSession('web-user', num);
    
    if (code) {
        res.send(`
            <div style="text-align:center; margin-top:50px; font-family:Arial; direction:rtl;">
                <h2 style="color:#075E54;">تم توليد الكود بنجاح!</h2>
                <div style="background:#f0f0f0; padding:20px; border-radius:10px; display:inline-block; margin:20px 0;">
                    <h1 style="color:#e74c3c; font-size:45px; letter-spacing:5px; margin:0;">${code}</h1>
                </div>
                <p>قم بربط الكود في واتساب الآن.</p>
                <a href="/" style="text-decoration:none; color:#25D366;">العودة</a>
            </div>
        `);
    } else {
        res.send("حدث خطأ، حاول مجدداً.");
    }
});

// --- أوامر بوت التلجرام ---

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🚀 ربط رقم واتساب", callback_data: 'pair' }],
                [{ text: "💤 تغيير إيموجي التفاعل", callback_data: 'edit_emoji' }],
                [{ text: "📊 الجلسات المسجلة", callback_data: 'status' }],
                [{ text: "🗑️ حذف الجلسات", callback_data: 'delete' }]
            ]
        }
    };
    bot.sendMessage(chatId, "مرحباً بك في بوت الملك فارس 👑\nاختر من القائمة أدناه:", options);
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'pair') {
        bot.sendMessage(chatId, "أرسل رقمك الآن مع مفتاح الدولة (مثال: 967773987296)");
    } else if (data === 'edit_emoji') {
        bot.sendMessage(chatId, "أرسل الإيموجي الجديد الذي تريد استخدامه:");
    } else if (data === 'status') {
        const sessionPath = `./auth_info_${chatId}`;
        if (fs.existsSync(sessionPath)) {
            bot.sendMessage(chatId, "✅ لديك جلسة نشطة مسجلة.");
        } else {
            bot.sendMessage(chatId, "❌ لا توجد جلسات مسجلة.");
        }
    } else if (data === 'delete') {
        await deleteSession(chatId);
        bot.sendMessage(chatId, "✅ تم حذف جميع الجلسات وتسجيل الخروج.");
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith('/')) return;

    // إذا أرسل المستخدم إيموجي
    if (text.length <= 2 && !/[0-9]/.test(text)) {
        userEmojis.set(chatId, text);
        return bot.sendMessage(chatId, `✅ تم تغيير إيموجي التفاعل إلى: ${text}`);
    }

    // إذا أرسل المستخدم رقم هاتف
    if (/[0-9]{10,}/.test(text)) {
        const phone = text.replace(/[^0-9]/g, '');
        bot.sendMessage(chatId, "⏳ جاري استخراج كود الربط...");
        const code = await startWhatsAppSession(chatId, phone);
        if (code) {
            bot.sendMessage(chatId, `كود الربط الخاص بك هو: \n\n \`${code}\` \n\nقم بنسخه وربطه في واتساب الآن.`, { parse_mode: 'Markdown' });
            
            // إرسال إشعار للمطور
            bot.sendMessage(developerId, `📢 مستخدم جديد طلب كود ربط:\nالرقم: ${phone}\nالمستخدم: @${msg.from.username || 'بدون يوزر'}`);
        }
    }
});

// --- وظائف الواتساب الأساسية ---

async function startWhatsAppSession(userId, phoneNumber) {
    const sessionPath = `./auth_info_${userId}`;
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" })
    });

    activeSocks.set(userId, sock);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
            bot.sendMessage(userId, "✅ تم الربط بنجاح! البوت الآن يعمل على حسابك.");
            // الانضمام للقناة
            try {
                await sock.newsletterFollow(whatsappChannel);
            } catch (e) { console.log("خطأ في الانضمام للقناة"); }
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWhatsAppSession(userId, phoneNumber);
        }
    });

    // التفاعل مع الحالات
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (msg.key.remoteJid === 'status@broadcast') {
            const emoji = userEmojis.get(userId) || "💤";
            await delay(Math.floor(Math.random() * 7000) + 8000);
            await sock.readMessages([msg.key]);
            await sock.sendMessage(msg.key.remoteJid, { react: { key: msg.key, text: emoji } }, { statusJidList: [msg.key.participant] });
        }
    });

    try {
        const code = await sock.requestPairingCode(phoneNumber);
        
        // مهلة 60 ثانية
        setTimeout(async () => {
            if (!sock.authState.creds.registered) {
                bot.sendMessage(userId, "⚠️ انتهت مهلة الربط (60 ثانية). يرجى المحاولة مرة أخرى.");
                await deleteSession(userId);
            }
        }, 60000);

        return code;
    } catch (err) {
        console.error(err);
        return null;
    }
}

async function deleteSession(userId) {
    const sessionPath = `./auth_info_${userId}`;
    if (activeSocks.has(userId)) {
        activeSocks.get(userId).logout();
        activeSocks.delete(userId);
    }
    if (fs.existsSync(sessionPath)) {
        await fs.remove(sessionPath);
    }
}

app.listen(port, () => console.log(`السيرفر يعمل على المنفذ ${port}`));
