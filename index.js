const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const express = require('express');
const pino = require('pino');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock;
// مخزن الإعدادات
let settings = {
    alwaysOnline: true,
    antiLink: false,
    aiChat: false,
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
        input[type="text"] { background: #020617; border: 1px solid #1e293b; color: white; padding: 8px; border-radius: 5px; width: 100px; text-align: center; }
        .status { color: var(--accent); font-weight: bold; }
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
        
        <button class="btn" onclick="location.reload()">تحديث الإعدادات 🔄</button>
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

app.listen(port, () => console.log(`Dashboard is live!`));

// --- محرك البوت الذكي ---
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    sock = makeWASocket({ auth: state, printQRInTerminal: true, logger: pino({ level: "silent" }) });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (u) => { if (u.connection === 'open') sock.sendPresenceUpdate('available'); if (u.connection === 'close') startBot(); });

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

        // 2. مسح الروابط (Anti-Link) في الخاص
        if (settings.antiLink && text.includes("http")) {
            await sock.sendMessage(from, { text: "⚠️ تم كشف رابط! سيتم حذف الدردشة الآن." });
            await sock.chatModify({ delete: true, lastMessages: [{ key: msg.key, messageTimestamp: msg.messageTimestamp }] }, from);
            return;
        }

        // 3. الردود التلقائية (حتى 100 رد)
        settings.replies.forEach(async r => {
            if (text.toLowerCase() === r.k.toLowerCase()) await sock.sendMessage(from, { text: r.v });
        });

        // 4. الذكاء الاصطناعي (AI)
        if (settings.aiChat) {
            await sock.sendMessage(from, { text: "مرحباً! أنا ذكاء اصطناعي مبرمج بواسطة الملك فارس. كيف أخدمك؟" });
        }
    });
}
startBot();
