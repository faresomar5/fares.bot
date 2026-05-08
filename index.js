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

// تهيئة الذكاء الاصطناعي بمفتاحك
const genAI = new GoogleGenerativeAI("AIzaSyBklT9MOcHID87Fnb86Xz0F551v9Vw_P-k");

let sock;
let isStarted = false;

// --- واجهة التحكم ---
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GOLDEN QUEEN | FIXED</title>
    <style>
        :root { --bg: #020617; --gold: #d4a017; --text: #f8fafc; }
        body { background: var(--bg); color: var(--text); font-family: system-ui; text-align: center; padding: 20px; margin:0; }
        .card { background: #0f172a; border: 2px solid var(--gold); border-radius: 25px; padding: 30px; max-width: 500px; margin: 40px auto; box-shadow: 0 0 30px rgba(212,160,23,0.3); }
        .btn { background: var(--gold); color: black; border: none; padding: 15px; border-radius: 12px; font-weight: bold; cursor: pointer; width: 100%; font-size: 18px; margin-top:10px; }
        input { background: #020617; border: 1px solid #1e293b; color: white; padding: 15px; border-radius: 12px; width: 100%; margin-bottom: 20px; text-align: center; font-size: 16px; box-sizing: border-box; }
        h1 { color: var(--gold); }
    </style>
</head>
<body>
    <div class="card">
        <h1>👑 نظام الفارس المطور</h1>
        <form action="/pair" method="POST">
            <p>أدخل الرقم الدولي للربط (بدون +)</p>
            <input type="number" name="number" placeholder="967..." required>
            <button type="submit" class="btn">ربط الحساب الآن 🚀</button>
        </form>
    </div>
</body>
</html>
    `);
});

// --- نظام الربط المطور لتخطي تعليق تسجيل الدخول ---
app.post('/pair', async (req, res) => {
    let num = req.body.number.replace(/[^0-9]/g, '');
    if (!num) return res.send("يرجى إدخال الرقم بشكل صحيح.");
    
    try {
        // حذف الجلسة بالكامل قبل البدء لضمان عدم التعليق في "جارٍ تسجيل الدخول"
        if (fs.existsSync('./auth_info')) {
            await fs.remove('./auth_info');
            console.log("🗑️ تم حذف الجلسة القديمة لضمان ربط جديد.");
        }
        
        await startBot();
        
        // مهلة استقرار كافية لضمان فتح السوكيت بنجاح
        await new Promise(resolve => setTimeout(resolve, 15000));

        if (sock) {
            const code = await sock.requestPairingCode(num);
            res.send(`
            <body style="background:#020617; color:white; text-align:center; padding-top:100px; font-family:sans-serif;">
                <h2 style="color:#94a3b8;">كود الربط الخاص بك:</h2>
                <h1 style="color:#d4a017; font-size:80px; letter-spacing:12px;">${code}</h1>
                <p>ضعه في جوالك الآن وانتظر دقيقة حتى يكتمل الاتصال في الخلفية.</p>
                <br><a href="/" style="color:#d4a017; text-decoration:none; border:1px solid; padding:10px; border-radius:8px;">العودة</a>
            </body>`);
        }
    } catch (e) {
        console.error(e);
        res.send("حدث خطأ، حاول مسح كاش السيرفر وإعادة المحاولة.");
    }
});

app.listen(port);

// --- محرك البوت الخلفي المستمر ---
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({ 
        version,
        auth: state, 
        printQRInTerminal: false, 
        logger: pino({ level: "silent" }),
        // متصفح حديث لتخطي حماية واتساب الجديدة
        browser: ["Ubuntu", "Chrome", "114.0.5735.198"], 
        connectTimeoutMs: 120000, // مهلة 120 ثانية لتجاوز تعليق التحميل
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 5000,
        markOnlineOnConnect: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => { 
        const { connection, lastDisconnect } = u;
        if (connection === 'open') {
            console.log("✅ البوت متصل وشغال 24/7!");
            await sock.sendPresenceUpdate('available'); 
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectionReason.loggedOut) {
                console.log("🔄 استعادة الاتصال...");
                startBot();
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]; 
        if (!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        // تفاعل الحالات
        if (from === 'status@broadcast') {
            await sock.readMessages([msg.key]);
            await sock.sendMessage(from, { react: { text: "👑", key: msg.key } }, { statusJidList: [msg.key.participant] });
            return;
        }

        // الذكاء الاصطناعي
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-pro" });
            const result = await model.generateContent(text);
            await sock.sendMessage(from, { text: result.response.text() });
        } catch (err) { console.error("AI Error"); }
    });
}

// التشغيل التلقائي عند بدء السيرفر
if (!isStarted) {
    startBot();
    isStarted = true;
}
