const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestBaileysVersion, 
    DisconnectReason 
} = require("@whiskeysockets/baileys");
const express = require('express');
const pino = require('pino');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock;
let reactionEmoji = "💤"; // الإيموجي الافتراضي

// --- واجهة المستخدم (بوت الملك فارس) ---
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
                p { color: #666; font-size: 14px; margin-bottom: 20px; }
                input { width: 100%; padding: 12px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; text-align: center; font-size: 16px; }
                button { width: 100%; padding: 12px; background-color: #25D366; color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; transition: 0.3s; }
                button:hover { background-color: #128C7E; }
                label { display: block; text-align: right; margin-bottom: 5px; font-size: 13px; color: #888; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>👑 بوت الملك فارس</h1>
                <p>أدخل بياناتك لاستخراج كود الربط</p>
                <form action="/get-code" method="POST">
                    <label>رقم الهاتف:</label>
                    <input type="text" name="number" placeholder="مثال: 967773987296" required>
                    <label>إيموجي التفاعل مع الحالات:</label>
                    <input type="text" name="emoji" value="💤" placeholder="ضع الإيموجي هنا">
                    <button type="submit">استخراج كود الربط 🚀</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.post('/get-code', async (req, res) => {
    const num = req.body.number.replace(/[^0-9]/g, '');
    const emoji = req.body.emoji || "💤";
    
    if (!num) return res.send("الرجاء إدخال رقم صحيح");
    
    // تحديث الإيموجي المختار
    reactionEmoji = emoji;

    try {
        if (!sock) await startBot();
        const code = await sock.requestPairingCode(num);
        
        res.send(`
            <div style="text-align:center; margin-top:50px; font-family:Arial; direction:rtl;">
                <h2 style="color:#075E54;">تم توليد الكود بنجاح!</h2>
                <p>الإيموجي المستخدم للتفاعل: ${reactionEmoji}</p>
                <p>أدخل الكود التالي في واتساب الخاص بك:</p>
                <div style="background:#f0f0f0; padding:20px; border-radius:10px; display:inline-block; margin:20px 0;">
                    <h1 style="color:#e74c3c; font-size:45px; letter-spacing:5px; margin:0;">${code}</h1>
                </div>
                <br>
                <a href="/" style="text-decoration:none; color:#25D366;">العودة لتغيير الإعدادات</a>
            </div>
        `);
    } catch (err) {
        console.error(err);
        res.send("فشل الاتصال بالسيرفر، يرجى تحديث الصفحة والمحاولة مرة أخرى.");
    }
});

app.listen(port, () => console.log(`السيرفر يعمل على المنفذ ${port}`));

// --- وظيفة البوت الأساسية ---
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (msg.key.remoteJid === 'status@broadcast') {
            // نظام حماية: تأخير عشوائي بين 8 و 15 ثانية
            await delay(Math.floor(Math.random() * 7000) + 8000);
            
            // قراءة الحالة
            await sock.readMessages([msg.key]);
            
            // --- إضافة التفاعل بالإيموجي ---
            await sock.sendMessage(msg.key.remoteJid, {
                react: {
                    key: msg.key,
                    text: reactionEmoji
                }
            }, { statusJidList: [msg.key.participant] });

            console.log(`✅ شاهدت حالة جديدة وتفاعلت بـ ${reactionEmoji}`);
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
