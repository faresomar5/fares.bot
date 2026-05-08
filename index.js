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

// إعداد الذكاء الاصطناعي بمفتاحك الخاص
const genAI = new GoogleGenerativeAI("AIzaSyBklT9MOcHID87Fnb86Xz0F551v9Vw_P-k");

let sock;
// مخزن الإعدادات
let settings = {
    alwaysOnline: true,
    antiLink: false,
    aiChat: true, // تفعيل الذكاء الاصطناعي
    statusReact: true,
    statusEmoji: "👑",
    replies: []
};

// --- واجهة المستخدم (الظاهرة في المتصفح) ---
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
            <div class="item"><span>إبقاء الرقم متصل</span> <input type="checkbox" checked disabled></div>
            <div class="item"><span>مكافحة الروابط (Anti-Link)</span> <input type="checkbox" id="antiLink" ${settings.antiLink ? 'checked' : ''} onchange="update('antiLink')"></div>
            <div class="item"><span>الذكاء الاصطناعي (AI)</span> <input type="checkbox" id="ai" ${settings.aiChat ? 'checked' : ''} onchange="update('aiChat')"></div>
        </div>

        <div class="card">
            <div class="item"><span>تفاعل الحالات</span> <input type="checkbox" checked disabled></div>
            <div class="item"><span>إيموجي التفاعل</span> <input type="text" id="emoji" value="${settings.statusEmoji}" onchange="updateEmoji()"></div>
        </div>

        <div class="card">
            <span style="color:var(--gold)">إضافة رد تلقائي (1-100)</span>
            <div style="display:flex; gap:5px; margin-top:10px;">
                <input type="text" id="key" placeholder="الكلمة" style="flex:1">
                <input type="text" id="val" placeholder="الرد" style="flex:1">
                <button onclick="addReply()" style="background:var(--accent); border:none; border-radius:5px; padding:0 10px;">+</button>
            </div>
            <div id="list" style="margin-top:10px; font-size:12px; color:#94a3b8;"></div>
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
        function addReply() { 
            const k = document.getElementById('key').value; const v = document.getElementById('val').value;
            fetch('/api/reply', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({k, v}) });
            document.getElementById('list').innerHTML += '✅ تمت إضافة: ' + k + '<br>';
        }
    </script>
</body>
</html>
    `);
});

// --- أوامر الـ API للتحكم من المتصفح ---
app.post('/api/update', (req, res) => { settings[req.body.key] = !settings[req.body.key]; res.json({success: true}); });
app.post('/api/emoji', (req, res) => { settings.statusEmoji = req.body.val; res.json({success: true}); });
app.post('/api/reply', (req, res) => { settings.replies.push({k: req.body.k, v: req.body.v}); res.json({success: true}); });

// --- واجهة استلام كود الربط ---
app.post('/pair', async (req, res) => {
    let num = req.body.number.replace(/[^0-9]/g, '');
    if (!num) return res.send("الرجاء إدخال الرقم بشكل صحيح مع مفتاح الدولة");
    
    // إعادة تشغيل البوت للرقم الجديد
    if (fs.existsSync('./auth_info')) fs.removeSync('./auth_info');
    await startBot();
    
    try {
        const code = await sock.requestPairingCode(num);
        res.send(`
        <body style="background:#020617; color:white; text-align:center; padding-top:100px; font-family:sans-serif;">
            <h2 style="color:#94a3b8;">كود الربط الخاص بالرقم ${num} هو:</h2>
            <h1 style="color:#d4a017; font-size:60px; letter-spacing:10px;">${code}</h1>
            <p>قم بوضع الكود في إشعارات الواتساب بجوالك الآن.</p>
            <br><a href="/" style="color:#d4a017; text-decoration:none;">← العودة للوحة التحكم</a>
        </body>`);
    } catch (e) {
        res.send("حدث خطأ في طلب الكود، يرجى المحاولة لاحقاً.");
    }
});

app.listen(port, () => console.log(`Dashboard and Pairing System is live!`));

// --- محرك البوت الذكي ---
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({ 
        version,
        auth: state, 
        printQRInTerminal: false, 
        logger: pino({ level: "silent" }),
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (u) => { 
        if (u.connection === 'open') {
            sock.sendPresenceUpdate('available');
            console.log("✅ البوت متصل الآن!");
        }
        if (u.connection === 'close') startBot(); 
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]; if (!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        // 1. تفاعل وحفظ الحالة
        if (from === 'status@broadcast') {
            await delay(7000); await sock.readMessages([msg.key]);
            await sock.sendMessage(from, { react: { text: settings.statusEmoji, key: msg.key } }, { statusJidList: [msg.key.participant] });
            return;
        }

        // 2. مسح الروابط (Anti-Link)
        if (settings.antiLink && text.includes("http")) {
            await sock.sendMessage(from, { text: "⚠️ تم كشف رابط! سيتم حذف الدردشة الآن." });
            await sock.chatModify({ delete: true, lastMessages: [{ key: msg.key, messageTimestamp: msg.messageTimestamp }] }, from);
            return;
        }

        // 3. الردود التلقائية
        settings.replies.forEach(async r => {
            if (text.toLowerCase() === r.k.toLowerCase()) await sock.sendMessage(from, { text: r.v });
        });

        // 4. الذكاء الاصطناعي (Gemini AI)
        if (settings.aiChat) {
            try {
                const model = genAI.getGenerativeModel({ model: "gemini-pro" });
                const result = await model.generateContent(text);
                const aiReply = result.response.text();
                await sock.sendMessage(from, { text: aiReply });
            } catch (err) {
                console.error("AI Error");
            }
        }
    });
}
startBot();
