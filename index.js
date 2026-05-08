const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestBaileysVersion, 
    DisconnectReason 
} = require("@whiskeysockets/baileys");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require('express');
const pino = require('pino');
const fs = require('fs-extra');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- إعدادات الذكاء الاصطناعي (API KEY) ---
const genAI = new GoogleGenerativeAI("AIzaSyBklT9MOcHID87Fnb86Xz0F551v9Vw_P-k");

let sock;
let isStarted = false;

// --- واجهة المستخدم (بوت الملك فارس) ---
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>بوت الملك فارس | برو</title>
            <style>
                body { font-family: 'Arial', sans-serif; background-color: #020617; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; color: white; }
                .card { background: #0f172a; padding: 30px; border-radius: 20px; border: 2px solid #d4a017; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center; width: 90%; max-width: 400px; }
                h1 { color: #d4a017; margin-bottom: 10px; }
                p { color: #94a3b8; font-size: 14px; margin-bottom: 20px; }
                input { width: 100%; padding: 12px; margin-bottom: 20px; border: 1px solid #1e293b; background: #020617; color: white; border-radius: 8px; box-sizing: border-box; text-align: center; font-size: 16px; }
                button { width: 100%; padding: 12px; background-color: #d4a017; color: black; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; transition: 0.3s; }
                button:hover { background-color: #b88a14; transform: scale(1.02); }
                .status { font-size: 12px; color: #22c55e; margin-top: 15px; }
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
                <div class="status">النظام يعمل في الخلفية 24/7 ✅</div>
            </div>
        </body>
        </html>
    `);
});

// --- نظام استخراج الكود ومعالجة تعليق الدخول ---
app.post('/get-code', async (req, res) => {
    const num = req.body.number.replace(/[^0-9]/g, '');
    if (!num) return res.send("الرجاء إدخال رقم صحيح");

    try {
        // حذف الجلسة القديمة لضمان عدم التعليق في "جارٍ تسجيل الدخول"
        if (fs.existsSync('./auth_info')) {
            await fs.remove('./auth_info');
            console.log("🗑️ تم تنظيف الجلسة لبدء ربط جديد.");
        }

        await startBot();
        
        // انتظار 10 ثوانٍ لضمان استقرار السيرفر قبل طلب الكود
        await new Promise(resolve => setTimeout(resolve, 10000));

        if (sock) {
            const code = await sock.requestPairingCode(num);
            res.send(`
                <div style="text-align:center; margin-top:50px; font-family:Arial; direction:rtl; background:#020617; color:white; height:100vh; padding-top:50px;">
                    <h2 style="color:#d4a017;">تم توليد الكود بنجاح!</h2>
                    <p>أدخل الكود التالي في واتساب الخاص بك:</p>
                    <div style="background:#0f172a; padding:20px; border:2px solid #d4a017; border-radius:15px; display:inline-block; margin:20px 0;">
                        <h1 style="color:#d4a017; font-size:50px; letter-spacing:8px; margin:0;">${code}</h1>
                    </div>
                    <p style="color:#94a3b8;">بمجرد إدخال الكود، اترك الجوال يكمل "تسجيل الدخول" في الخلفية.</p>
                    <br>
                    <a href="/" style="text-decoration:none; color:#d4a017; font-weight:bold;">← العودة للرئيسية</a>
                </div>
            `);
        }
    } catch (err) {
        console.error(err);
        res.send("فشل استخراج الكود، حاول مسح الكاش في Render وإعادة المحاولة.");
    }
});

app.listen(port, () => console.log(`السيرفر يعمل على المنفذ ${port}`));

// --- وظيفة البوت الأساسية (التشغيل الدائم) ---
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        // تحديث المتصفح لتفادي تعليق تسجيل الدخول
        browser: ["Ubuntu", "Chrome", "114.0.5735.198"],
        connectTimeoutMs: 120000, // مهلة 120 ثانية لتجاوز بطء واتساب
        keepAliveIntervalMs: 30000
    });

    sock.ev.on('creds.update', saveCreds);

    // --- التفاعل التلقائي والذكاء الاصطناعي ---
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        // 1. نظام مشاهدة الحالات والتفاعل (Status React)
        if (from === 'status@broadcast') {
            await delay(Math.floor(Math.random() * 5000) + 5000);
            await sock.readMessages([msg.key]);
            await sock.sendMessage(from, { react: { text: "👑", key: msg.key } }, { statusJidList: [msg.key.participant] });
            console.log(`✅ تمت مشاهدة حالة والتفاعل معها بنجاح`);
            return;
        }

        // 2. رد الذكاء الاصطناعي (Gemini AI)
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-pro" });
            const result = await model.generateContent(text);
            const responseText = result.response.text();
            await sock.sendMessage(from, { text: responseText });
        } catch (err) {
            console.error("AI Error:", err);
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectionReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log("✅ البوت نشط الآن ويعمل في الخلفية!");
            sock.sendPresenceUpdate('available'); // إبقاء الرقم "متصل الآن"
        }
    });
}

// تشغيل تلقائي للبوت عند بدء السيرفر لضمان العمل في الخلفية
if (!isStarted) {
    startBot();
    isStarted = true;
}
