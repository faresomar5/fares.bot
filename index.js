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
const path = require('path');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تهيئة الذكاء الاصطناعي بمفتاحك الخاص
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

// --- واجهة المستخدم (لوحة التحكم) ---
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GOLDEN QUEEN | CONTROL</title>
    <style>
        :root { --bg: #020617; --panel: #0f172a; --gold: #d4a017; --text: #f8fafc; --accent: #22c55e; }
        body { background: var(--bg); color: var(--text); font-family: system-ui; padding: 20px; margin: 0; }
        .container { max-width: 600px; margin: auto; }
        .card { background: var(--panel); border: 1px solid #1e293b; border-radius: 20px; padding: 20px; margin-bottom: 20px; box-shadow: 0 10px 15px rgba(0,0,0,0.3); }
        h1 { color: var(--gold); text-align: center; font-size: 24px; }
        .item { display: flex; justify-content: space-between; align-items: center; padding: 15px 0; border-bottom: 1px solid #1e293b; }
        .btn { background: var(--gold); color: black; border: none; padding: 10px 20px; border-radius: 10px; font-weight: bold; cursor: pointer; width: 100%; margin-top: 10px; }
        input[type="text"], input[type="number"] { background: #020617; border: 1px solid #1e293b; color: white; padding: 8px; border-radius: 5px; width: 100px; text-align: center; }
        .status { color: var(--accent); font-weight: bold; }
        .pair-section { border-top: 2px solid var(--gold); padding-top: 20px; margin-top: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>👑 لوحة تحكم الملك فارس</h1>
        <div class="card">
            <div class="item"><span>الحالة الآن:</span> <span class="status">متصل بالسيرفر ✅</span></div>
            <div class="item"><span>مكافحة الروابط (Anti-Link)</span> <input type="checkbox" id="antiLink" ${settings.antiLink ? 'checked' : ''} onchange="update('antiLink')"></div>
            <div class="item"><span>الذكاء الاصطناعي (AI)</span> <input type="checkbox" id="ai" ${settings.aiChat ? 'checked' : ''} onchange="update('aiChat')"></div>
        </div>
        <div class="card">
            <div class="item"><span>إيموجي التفاعل</span> <input type="text" id="emoji" value="${settings.statusEmoji}" onchange="updateEmoji()"></div>
        </div>
        <div class="card pair-section">
            <span style="color:var(--gold)">ربط رقم الواتساب بالكود</span>
            <form action="/pair" method="POST" style="margin-top:10px;">
                <input type="number" name="number" placeholder="967..." style="width:100%; margin-bottom:10px; box-sizing: border-box;" required>
                <button type="submit" class="btn">استخراج كود الربط الآن 🚀</button>
            </form>
        </div>
        <button class="btn" onclick="location.reload()" style="background:#475569; color:white;">تحديث الصفحة 🔄</button>
    </div>
    <script>
        function update(key) { fetch('/api/update', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({key}) }); }
        function updateEmoji() { const val = document.getElementById('emoji').value; fetch('/api/emoji', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({val}) }); }
    </script>
</body>
</html>
    `);
});

// --- أوامر الـ API ---
app.post('/api/update', (req, res) => { settings[req.body.key] = !settings[req.body.key]; res.json({success: true}); });
app.post('/api/emoji', (req, res) => { settings.statusEmoji = req.body.val; res.json({success: true}); });

// --- نظام الربط المطور ---
app.post('/pair', async (req, res) => {
    let num = req.body.number.replace(/[^0-9]/g, '');
    if (!num) return res.send("الرجاء إدخال الرقم بشكل صحيح");
    
    try {
        if (fs.existsSync('./auth_info')) fs.emptyDirSync('./auth_info'); // تنظيف الجلسة لضمان تسجيل جديد
        await startBot();
        
        await new Promise(resolve => setTimeout(resolve, 8000)); // انتظار استقرار السيرفر

        if (sock) {
            const code = await sock.requestPairingCode(num);
            res.send(`
            <body style="background:#020617; color:white; text-align:center; padding-top:100px; font-family:sans-serif;">
                <h2 style="color:#94a3b8;">كود الربط للرقم ${num}:</h2>
                <h1 style="color:#d4a017; font-size:60px; letter-spacing:10px;">${code}</h1>
                <p>أدخل الكود الآن وانتظر حتى يكتمل الربط في جوالك.</p>
                <br><a href="/" style="color:#d4a017; text-decoration:none;">← العودة للوحة التحكم</a>
            </body>`);
        }
    } catch (e) { res.send("فشل الاتصال، حاول مجدداً."); }
});

app.listen(port);

// --- محرك البوت مع تعديلات المصادقة ---
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({ 
        version,
        auth: state, 
        printQRInTerminal: false, 
        logger: pino({ level: "silent" }),
        // تحديث نسخة المتصفح لتجنب تعليق تسجيل الدخول
        browser: ["Ubuntu", "Chrome", "110.0.5481.177"], 
        connectTimeoutMs: 60000, // زيادة وقت الانتظار
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (u) => { 
        if (u.connection === 'open') console.log("✅ البوت متصل وشغال!");
        if (u.connection === 'close') startBot();
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]; if (!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        if (from === 'status@broadcast') {
            await delay(7000); await sock.readMessages([msg.key]);
            await sock.sendMessage(from, { react: { text: settings.statusEmoji, key: msg.key } }, { statusJidList: [msg.key.participant] });
            return;
        }

        if (settings.aiChat) {
            try {
                const model = genAI.getGenerativeModel({ model: "gemini-pro" });
                const result = await model.generateContent(text);
                await sock.sendMessage(from, { text: result.response.text() });
            } catch (err) { console.error("AI Error"); }
        }
    });
}
startBot();
