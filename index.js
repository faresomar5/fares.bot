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
const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- إعدادات الذكاء الاصطناعي (Gemini) ---
const genAI = new GoogleGenerativeAI("AIzaSyBklT9MOcHID87Fnb86Xz0F551v9Vw_P-k");

let sock;
let settings = {
    alwaysOnline: true,
    antiLink: true, // تفعيل منع الروابط افتراضياً
    aiEnabled: true, // تفعيل الذكاء الاصطناعي افتراضياً
    statusReact: true,
    statusEmoji: "👑",
    replies: [] // مخزن لـ 100 رد تلقائي
};

// --- واجهة التحكم الذهبية (Golden Queen) ---
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>👑 لوحة تحكم الملك فارس</title>
    <style>
        :root { --bg: #020617; --panel: #0f172a; --gold: #d4a017; --text: #f8fafc; --accent: #22c55e; }
        body { background: var(--bg); color: var(--text); font-family: sans-serif; padding: 20px; margin: 0; }
        .card { background: var(--panel); border: 1px solid #1e293b; border-radius: 20px; padding: 20px; margin: 10px auto; max-width: 500px; box-shadow: 0 10px 20px rgba(0,0,0,0.5); }
        h1 { color: var(--gold); text-align: center; }
        .item { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #1e293b; }
        .btn { background: var(--gold); color: #000; border: none; padding: 12px; border-radius: 10px; font-weight: bold; cursor: pointer; width: 100%; margin-top: 15px; }
        input { background: #020617; border: 1px solid #1e293b; color: white; padding: 8px; border-radius: 5px; text-align: center; }
    </style>
</head>
<body>
    <h1>👑 GOLDEN QUEEN PANEL</h1>
    <div class="card">
        <div class="item"><span>إبقاء الرقم متصل دايماً</span> <span style="color:var(--accent)">نشط ✅</span></div>
        <div class="item"><span>الذكاء الاصطناعي (Gemini)</span> <input type="checkbox" checked disabled></div>
        <div class="item"><span>منع الروابط (Anti-Link)</span> <input type="checkbox" checked disabled></div>
        <div class="item"><span>إيموجي تفاعل الحالة</span> <input type="text" value="${settings.statusEmoji}" style="width:50px;"></div>
    </div>
    <div class="card">
        <span style="color:var(--gold)">إضافة رد تلقائي (1-100)</span>
        <div style="display:flex; gap:5px; margin-top:10px;">
            <input type="text" id="k" placeholder="الكلمة" style="flex:1">
            <input type="text" id="v" placeholder="الرد" style="flex:1">
            <button onclick="alert('تم الحفظ')" style="background:var(--accent); border:none; padding:10px; border-radius:5px;">+</button>
        </div>
    </div>
    <form action="/pair" method="POST" class="card">
        <span style="color:var(--gold)">ربط رقم جديد</span>
        <input type="text" name="number" placeholder="967..." style="width:100%; margin:10px 0;">
        <button type="submit" class="btn">استخراج كود الربط 🚀</button>
    </form>
</body>
</html>
    `);
});

app.post('/pair', async (req, res) => {
    const num = req.body.number.replace(/[^0-9]/g, '');
    if (!sock) await startBot();
    const code = await sock.requestPairingCode(num);
    res.send(`<body style="background:#020617; color:white; text-align:center; padding-top:50px; font-family:sans-serif;"><h1>كود الربط الخاص بك:</h1><h1 style="color:#d4a017; font-size:50px; letter-spacing:5px;">${code}</h1><a href="/" style="color:#22c55e;">العودة للوحة التحكم</a></body>`);
});

app.listen(port, () => console.log(`لوحة التحكم تعمل على المنفذ ${port}`));

// --- المحرك الأساسي للبوت ---
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

    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'open') {
            // 1. إبقاء الرقم متصل دائماً
            sock.sendPresenceUpdate('available'); 
            console.log("✅ البوت متصل ووضع Online نشط");
        }
        if (connection === 'close') startBot();
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        // 2. تفاعل الحالات وحفظها
        if (from === 'status@broadcast') {
            await delay(5000); // تأخير للمشاهدة
            await sock.readMessages([msg.key]);
            if (settings.statusReact) {
                await sock.sendMessage(from, { react: { text: settings.statusEmoji, key: msg.key } }, { statusJidList: [msg.key.participant] });
            }
            return;
        }

        // 4. منع الروابط (Anti-Link) - حذف الدردشة تلقائياً
        if (settings.antiLink && text.includes("http")) {
            await sock.sendMessage(from, { text: "⚠️ عذراً، الروابط ممنوعة. سيتم مسح هذه المحادثة." });
            await sock.chatModify({ delete: true, lastMessages: [{ key: msg.key, messageTimestamp: msg.messageTimestamp }] }, from);
            return;
        }

        // 3. الردود التلقائية (حتى 100 رد)
        settings.replies.forEach(async (r) => {
            if (text.toLowerCase() === r.k.toLowerCase()) {
                await sock.sendMessage(from, { text: r.v });
                return;
            }
        });

        // 6. الذكاء الاصطناعي الحقيقي (Gemini AI)
        if (settings.aiEnabled) {
            try {
                const model = genAI.getGenerativeModel({ model: "gemini-pro" });
                const result = await model.generateContent(text);
                const aiReply = result.response.text();
                await sock.sendMessage(from, { text: aiReply });
            } catch (err) {
                console.error("خطأ في الذكاء الاصطناعي:", err);
            }
        }
    });
}

startBot();
