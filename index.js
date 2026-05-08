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

// تهيئة الذكاء الاصطناعي
const genAI = new GoogleGenerativeAI("AIzaSyBklT9MOcHID87Fnb86Xz0F551v9Vw_P-k");

let sock;
let settings = {
    alwaysOnline: true,
    antiLink: false,
    aiChat: true, 
    statusReact: true,
    statusEmoji: "👑",
    replies: []
};

// --- واجهة التحكم الذهبية ---
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GOLDEN QUEEN | PRO</title>
    <style>
        :root { --bg: #020617; --panel: #0f172a; --gold: #d4a017; --text: #f8fafc; }
        body { background: var(--bg); color: var(--text); font-family: system-ui; text-align: center; padding: 20px; }
        .card { background: var(--panel); border: 1px solid #d4a017; border-radius: 20px; padding: 25px; max-width: 500px; margin: auto; box-shadow: 0 0 20px rgba(212,160,23,0.2); }
        .btn { background: var(--gold); color: black; border: none; padding: 15px; border-radius: 12px; font-weight: bold; cursor: pointer; width: 100%; font-size: 16px; transition: 0.3s; }
        .btn:hover { transform: scale(1.02); opacity: 0.9; }
        input { background: #020617; border: 1px solid #1e293b; color: white; padding: 12px; border-radius: 10px; width: 100%; margin-bottom: 15px; text-align: center; box-sizing: border-box; }
        h1 { color: var(--gold); margin-bottom: 5px; }
        .status-tag { color: #22c55e; font-size: 14px; font-weight: bold; margin-bottom: 20px; display: block; }
    </style>
</head>
<body>
    <div class="card">
        <h1>👑 نظام الملك فارس</h1>
        <span class="status-tag">النظام نشط ويعمل 24/7 ✅</span>
        
        <form action="/pair" method="POST">
            <p style="font-size: 13px; color: #94a3b8;">أدخل رقمك الدولي للربط الفوري</p>
            <input type="number" name="number" placeholder="967..." required>
            <button type="submit" class="btn">استخراج كود الربط 🚀</button>
        </form>
        
        <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #1e293b;">
            <p style="font-size: 12px; color: #d4a017;">إعدادات التفاعل: نشطة تلقائياً ✨</p>
            <button onclick="location.reload()" style="background:none; border:1px solid #1e293b; color:white; padding:8px 15px; border-radius:8px; cursor:pointer; font-size:12px;">تحديث النظام 🔄</button>
        </div>
    </div>
</body>
</html>
    `);
});

// --- نظام الربط المطور لمعالجة تعليق الدخول ---
app.post('/pair', async (req, res) => {
    let num = req.body.number.replace(/[^0-9]/g, '');
    if (!num) return res.send("خطأ: يرجى إدخال الرقم بشكل صحيح.");
    
    try {
        // تصفير الجلسة تماماً لضمان ربط "نظيف" بدون تعليق
        if (fs.existsSync('./auth_info')) fs.emptyDirSync('./auth_info');
        
        await startBot();
        
        // مهلة استقرار السيرفر (أهم خطوة لضمان عدم قطع الاتصال)
        await new Promise(resolve => setTimeout(resolve, 10000));

        if (sock) {
            const code = await sock.requestPairingCode(num);
            res.send(`
            <body style="background:#020617; color:white; text-align:center; padding-top:100px; font-family:sans-serif;">
                <h2 style="color:#94a3b8;">تم توليد الكود للرقم: ${num}</h2>
                <h1 style="color:#d4a017; font-size:70px; letter-spacing:10px; margin: 20px 0;">${code}</h1>
                <p style="color:#22c55e;">ضع الكود في جوالك الآن واترك هذه الصفحة مفتوحة حتى يكتمل الربط.</p>
                <br><a href="/" style="color:#d4a017; text-decoration:none; font-weight:bold;">← العودة للرئيسية</a>
            </body>`);
        }
    } catch (e) {
        res.send("السيرفر مضغوط، يرجى المحاولة مرة أخرى بعد دقيقة.");
    }
});

app.listen(port);

// --- محرك البوت ( Always Online Edition ) ---
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({ 
        version,
        auth: state, 
        printQRInTerminal: false, 
        logger: pino({ level: "silent" }),
        // تحديث المتصفح لأحدث إصدار لضمان سرعة المصادقة
        browser: ["Ubuntu", "Chrome", "114.0.5735.198"], 
        connectTimeoutMs: 90000, // زيادة المهلة لـ 90 ثانية لمنع فشل الدخول
        keepAliveIntervalMs: 30000,
        generateHighQualityLinkPreview: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => { 
        const { connection, lastDisconnect } = u;
        if (connection === 'open') {
            console.log("✅ الرقم مربوط الآن ويعمل بدون توقف!");
            await sock.sendPresenceUpdate('available'); // إبقاء الرقم متصل دائماً
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectionReason.loggedOut) {
                console.log("🔄 إعادة اتصال تلقائية...");
                startBot();
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]; 
        if (!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        // 1. تفاعل الحالات الفوري
        if (from === 'status@broadcast') {
            await sock.readMessages([msg.key]);
            await sock.sendMessage(from, { react: { text: settings.statusEmoji, key: msg.key } }, { statusJidList: [msg.key.participant] });
            return;
        }

        // 2. رد الذكاء الاصطناعي Gemini
        if (settings.aiChat) {
            try {
                const model = genAI.getGenerativeModel({ model: "gemini-pro" });
                const result = await model.generateContent(text);
                await sock.sendMessage(from, { text: result.response.text() });
            } catch (err) { console.error("AI Error"); }
        }
    });
}
// بدء التشغيل التلقائي للسيرفر
startBot();
