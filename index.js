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
let isStarted = false; // لمراقبة تشغيل البوت في الخلفية

// --- واجهة التحكم الذهبية ---
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GOLDEN QUEEN | ULTRA</title>
    <style>
        :root { --bg: #020617; --panel: #0f172a; --gold: #d4a017; --text: #f8fafc; }
        body { background: var(--bg); color: var(--text); font-family: system-ui; text-align: center; padding: 20px; margin:0; }
        .card { background: var(--panel); border: 2px solid var(--gold); border-radius: 25px; padding: 30px; max-width: 500px; margin: 40px auto; box-shadow: 0 0 30px rgba(212,160,23,0.3); }
        .btn { background: var(--gold); color: black; border: none; padding: 15px; border-radius: 12px; font-weight: bold; cursor: pointer; width: 100%; font-size: 18px; margin-top:10px; }
        input { background: #020617; border: 1px solid #1e293b; color: white; padding: 15px; border-radius: 12px; width: 100%; margin-bottom: 20px; text-align: center; font-size: 16px; box-sizing: border-box; }
        h1 { color: var(--gold); margin-bottom: 10px; text-shadow: 0 0 10px rgba(212,160,23,0.5); }
        .status-badge { background: #14532d; color: #4ade80; padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="card">
        <h1>👑 مملكة الفارس</h1>
        <div style="margin-bottom:20px;"><span class="status-badge">نظام العمل في الخلفية نشط 🟢</span></div>
        
        <form action="/pair" method="POST">
            <p style="color: #94a3b8; font-size: 14px;">أدخل الرقم لربط الجلسة الدائمة</p>
            <input type="number" name="number" placeholder="967..." required title="يرجى إدخال الرقم الدولي">
            <button type="submit" class="btn">احصل على كود الربط الآن 🔥</button>
        </form>
        
        <p style="margin-top: 25px; font-size: 11px; color: #475569;">بمجرد الربط، سيعمل البوت في الخلفية ولن يتوقف أبداً حتى لو أغلقت هذه الصفحة.</p>
    </div>
</body>
</html>
    `);
});

// --- نظام الربط المطور لمعالجة تعليق الدخول ---
app.post('/pair', async (req, res) => {
    let num = req.body.number.replace(/[^0-9]/g, '');
    if (!num) return res.send("خطأ: يرجى كتابة الرقم بشكل صحيح.");
    
    try {
        // حذف الجلسات القديمة لضمان ربط نظيف وتجاوز تعليق "تسجيل الدخول"
        if (fs.existsSync('./auth_info')) fs.emptyDirSync('./auth_info');
        
        // إعادة تشغيل المحرك
        await startBot();
        
        // مهلة 12 ثانية لضمان استقرار الاتصال قبل طلب الكود
        await new Promise(resolve => setTimeout(resolve, 12000));

        if (sock) {
            const code = await sock.requestPairingCode(num);
            res.send(`
            <body style="background:#020617; color:white; text-align:center; padding-top:100px; font-family:sans-serif;">
                <h2 style="color:#94a3b8;">كود الربط الخاص بك هو:</h2>
                <h1 style="color:#d4a017; font-size:80px; letter-spacing:12px; margin: 30px 0;">${code}</h1>
                <p style="color:#4ade80; font-size:20px;">ضعه في واتساب جوالك الآن.</p>
                <p style="color:#94a3b8;">انتظر دقيقة كاملة بعد إدخال الكود حتى يكتمل الاتصال في الخلفية.</p>
                <br><a href="/" style="color:#d4a017; text-decoration:none; border: 1px solid; padding: 10px 20px; border-radius: 10px;">العودة للوحة التحكم</a>
            </body>`);
        }
    } catch (e) {
        res.send("حدث خطأ في توليد الكود، يرجى المحاولة بعد دقيقة.");
    }
});

// تشغيل السيرفر
app.listen(port, () => {
    console.log(`السيرفر يعمل على المنفذ ${port}`);
});

// --- محرك البوت (العمل الخلفي المستمر) ---
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({ 
        version,
        auth: state, 
        printQRInTerminal: false, 
        logger: pino({ level: "silent" }),
        // تحديث المتصفح لأحدث إصدار مستقر
        browser: ["Ubuntu", "Chrome", "114.0.5735.198"], 
        connectTimeoutMs: 120000, // زيادة وقت الانتظار لـ 120 ثانية لحل تعليق الدخول
        keepAliveIntervalMs: 25000,
        retryRequestDelayMs: 5000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => { 
        const { connection, lastDisconnect } = u;
        if (connection === 'open') {
            console.log("✅ البوت متصل الآن ويعمل في الخلفية بنجاح!");
            await sock.sendPresenceUpdate('available'); // إبقاء الرقم متصل 24/7
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            // إعادة الاتصال التلقائي في جميع الحالات ما لم يقم المستخدم بتسجيل الخروج يدوياً
            if (reason !== DisconnectionReason.loggedOut) {
                console.log("🔄 محاولة استعادة الاتصال في الخلفية...");
                startBot();
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]; 
        if (!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        // التفاعل مع الحالات فورياً
        if (from === 'status@broadcast') {
            await sock.readMessages([msg.key]);
            await sock.sendMessage(from, { react: { text: "👑", key: msg.key } }, { statusJidList: [msg.key.participant] });
            return;
        }

        // رد الذكاء الاصطناعي المستمر
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-pro" });
            const result = await model.generateContent(text);
            await sock.sendMessage(from, { text: result.response.text() });
        } catch (err) { console.error("AI Busy"); }
    });
}

// البدء التلقائي للبوت فور تشغيل السيرفر (التشغيل في الخلفية)
if (!isStarted) {
    startBot();
    isStarted = true;
}
