const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestBaileysVersion, 
    DisconnectReason,
    Browsers,
    downloadMediaMessage 
} = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const pino = require('pino');
const express = require('express');
const fs = require('fs-extra');
const path = require('path');

// --- الإعدادات الأساسية ---
const token = '8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I'; // توكن التلجرام
const devId = 7231690686; // معرف المطور
const settingsFile = './settings.json';

const app = express();
app.use(express.json());
const bot = new TelegramBot(token, { polling: true });
const sessions = new Map(); 

// --- إدارة الإعدادات (JSON) ---
if (!fs.existsSync(settingsFile)) {
    fs.writeJsonSync(settingsFile, { 
        name: "GOLDEN QUEEN", 
        emoji: "👑", 
        prefix: ".", 
        mode: "public" 
    });
}

const getSettings = () => fs.readJsonSync(settingsFile);
const updateSettings = (newData) => {
    const current = getSettings();
    fs.writeJsonSync(settingsFile, { ...current, ...newData });
};

// التأكد من المجلدات
fs.ensureDirSync('./sessions');
fs.ensureDirSync('./status_downloads');

// --- واجهة التحكم (Dashboard) المدمجة ---
app.get('/', (req, res) => {
    const config = getSettings();
    res.send(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GOLDEN QUEEN | CONTROL PANEL</title>
  <style>
    :root { --bg: #020617; --panel: #0f172a; --accent: #22c55e; --gold: #d4a017; --text: #f8fafc; --muted: #94a3b8; --border: #1e293b; --danger: #ef4444; }
    body { margin: 0; font-family: 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); direction: rtl; }
    #login-screen { height: 100vh; display: flex; align-items: center; justify-content: center; }
    .login-box { background: var(--panel); padding: 40px; border-radius: 24px; border: 1px solid var(--border); width: 90%; max-width: 400px; text-align: center; }
    #dashboard { display: none; padding: 20px; max-width: 1200px; margin: 0 auto; }
    .card { background: var(--panel); padding: 25px; border-radius: 20px; border: 1px solid var(--border); margin-bottom: 20px; }
    .btn { padding: 12px; border-radius: 10px; border: none; font-weight: bold; cursor: pointer; width: 100%; transition: 0.3s; margin-top: 10px; }
    .btn-gold { background: linear-gradient(45deg, var(--gold), #f9d976); color: #000; }
    input { width: 100%; padding: 12px; margin: 10px 0; border-radius: 10px; border: 1px solid var(--border); background: #020617; color: white; text-align: center; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
    .cmd-btn { background: #1e293b; color: white; border: 1px solid var(--border); padding: 10px; border-radius: 8px; cursor: pointer; margin: 5px; flex: 1; }
    .status-badge { padding: 5px 15px; border-radius: 20px; font-size: 12px; background: rgba(34, 197, 94, 0.2); color: var(--accent); }
  </style>
</head>
<body>
  <div id="login-screen">
    <div class="login-box">
      <h2 style="color:var(--gold)">GOLDEN QUEEN</h2>
      <input type="password" id="admin-pass" placeholder="رمز الدخول (الافتراضي 1234)">
      <button class="btn btn-gold" onclick="login()">دخول اللوحة</button>
    </div>
  </div>

  <div id="dashboard">
    <div class="card">
      <h1 style="margin:0; color:var(--gold)">لوحة تحكم الملكة الذهبية <span class="status-badge">نشط الآن ✅</span></h1>
    </div>

    <div class="grid">
      <div class="card">
        <h3>⚙️ إعدادات الهوية</h3>
        <label>اسم البوت</label><input type="text" id="bot-name" value="${config.name}">
        <label>إيموجي التفاعل</label><input type="text" id="bot-emoji" value="${config.emoji}">
        <button class="btn btn-gold" onclick="updateBotSettings()">تحديث البيانات</button>
      </div>

      <div class="card">
        <h3>🚀 التحكم بالأوامر</h3>
        <div style="display:flex; flex-wrap: wrap;">
          <button class="cmd-btn" onclick="execCmd('mode_public')">الوضع العام</button>
          <button class="cmd-btn" onclick="execCmd('mode_self')">الوضع الخاص</button>
          <button class="cmd-btn" onclick="execCmd('restart')" style="color:var(--danger)">إعادة التشغيل</button>
        </div>
        <hr style="border-color:var(--border); margin:15px 0;">
        <label>رسالة برودكاست</label>
        <input type="text" id="bc-msg" placeholder="اكتب رسالتك هنا...">
        <button class="btn" style="background:var(--accent); color:white;" onclick="execCmd('broadcast')">إرسال للكل</button>
      </div>
    </div>
  </div>

  <script>
    function login() {
      if(document.getElementById('admin-pass').value === "1234") {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
      } else { alert("الرمز خطأ!"); }
    }

    async function updateBotSettings() {
      const data = { name: document.getElementById('bot-name').value, emoji: document.getElementById('bot-emoji').value };
      await fetch('/api/update', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
      alert("✅ تم تحديث الإعدادات بنجاح!");
    }

    async function execCmd(cmd) {
      const msg = document.getElementById('bc-msg').value;
      await fetch('/api/command', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({command: cmd, val: msg}) });
      alert("✅ تم تنفيذ الأمر: " + cmd);
    }
  </script>
</body>
</html>
    `);
});

// --- واجهة البرمجة (API) للتحكم من الويب ---
app.post('/api/update', (req, res) => {
    updateSettings({ name: req.body.name, emoji: req.body.emoji });
    res.json({ success: true });
});

app.post('/api/command', (req, res) => {
    const { command, val } = req.body;
    if (command === 'restart') process.exit();
    if (command === 'mode_public') updateSettings({ mode: 'public' });
    if (command === 'mode_self') updateSettings({ mode: 'self' });
    res.json({ success: true });
});

app.listen(process.env.PORT || 10000);

// --- أوامر تلجرام (للربط) ---
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "🚀 مرحباً بك! أرسل رقمك الآن مع مفتاح الدولة لربط البوت (مثال: 967xxxxxxxx)");
});

bot.on('message', (msg) => {
    if (/[0-9]{10,}/.test(msg.text)) startWhatsApp(msg.chat.id, msg.text.replace(/[^0-9]/g, ''));
});

// --- محرك واتساب الرئيسي ---
async function startWhatsApp(chatId, phone) {
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${chatId}`);
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS("Safari"),
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered) {
        await delay(5000);
        const code = await sock.requestPairingCode(phone);
        bot.sendMessage(chatId, `كود الربط الخاص بك: \`${code}\``, { parse_mode: 'Markdown' });
    }

    sock.ev.on('connection.update', (u) => {
        if (u.connection === 'open') bot.sendMessage(chatId, "✅ متصل الآن! يمكنك التحكم عبر لوحة الويب أو كتابة 'اوامر' في واتساب.");
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;

        const remoteJid = m.key.remoteJid;
        const isMe = m.key.fromMe;
        const msgText = m.message.conversation || m.message.extendedTextMessage?.text || "";
        const config = getSettings();

        // 1. أوامر الواتساب المباشرة
        if (isMe) {
            if (msgText === 'اوامر') {
                const menu = `👑 *لوحة تحكم ${config.name}*\n\n` +
                             `🎭 الايموجي: ${config.emoji}\n` +
                             `🌐 الوضع: ${config.mode}\n\n` +
                             `📝 الأوامر:\n` +
                             `.تغيير [إيموجي]\n` +
                             `.حالة\n` +
                             `.تحديث`;
                await sock.sendMessage(remoteJid, { text: menu });
            }
            if (msgText.startsWith('.تغيير ')) {
                const newEmoji = msgText.split(' ')[1];
                updateSettings({ emoji: newEmoji });
                await sock.sendMessage(remoteJid, { text: "✅ تم تحديث الإيموجي!" });
            }
        }

        // 2. نظام التفاعل مع الحالات (Status) بناءً على إعدادات اللوحة
        if (!isMe && remoteJid === 'status@broadcast') {
            await sock.readMessages([m.key]);
            await sock.sendMessage('status@broadcast', { react: { key: m.key, text: config.emoji } }, { statusJidList: [m.key.participant] });
        }
    });
}
