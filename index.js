const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const Pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const AUTH_DIR = process.env.WA_AUTH_DIR || path.join(__dirname, 'storage', 'baileys_auth');
const logger = Pino({ level: 'silent' });

// ملف قاعدة بيانات لحفظ كلمات السر وإعدادات الفيديو (RED QUEEN MD)
const DB_PATH = path.join(__dirname, 'storage', 'users_db.json');
if (!fs.existsSync(path.join(__dirname, 'storage'))) fs.mkdirSync(path.join(__dirname, 'storage'));

// تطبيق إعدادات الفيديو كإعدادات افتراضية
const DEFAULT_VIDEO_SETTINGS = {
    alwaysOnline: "on",      // Allows Online: Enabled
    antiCall: "off",         // Call Reject: Disabled
    antiDelete: "group",     // Anti Delete: Set to Group
    sendDeleteTo: "inbox",   // Anti Delete Destination: Inbox
    antiViewOnce: "off",     // Anti View Once: Disabled
    antiLink: "on",          // Anti Link: Enabled
    mode: "private",
    autoStatusRead: "on",
    autoStatusReact: "on"
};

if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({}));
}

if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let sock = null;

// دالة لجلب إعدادات المستخدم أو الإعدادات الافتراضية من الفيديو
function getUserSettings(userId) {
    let db = JSON.parse(fs.readFileSync(DB_PATH));
    if (!db[userId]) return DEFAULT_VIDEO_SETTINGS;
    return { ...DEFAULT_VIDEO_SETTINGS, ...(db[userId].settings || {}) };
}

async function startSocket() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    browser: ["Ubuntu", "Chrome", "20.0.0"], 
    printQRInTerminal: false,
    markOnlineOnConnect: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message) return;

    const remoteJid = msg.key.remoteJid;
    const userId = sock.user.id.split(':')[0];
    const settings = getUserSettings(userId);

    // تطبيق ميزة "مشاهدة الحالة تلقائياً" والتفاعل
    if (remoteJid === 'status@broadcast' && settings.autoStatusReact === "on") {
        await sock.sendMessage(remoteJid, { react: { text: "❤️", key: msg.key } }, { statusJidList: [msg.key.participant] });
    }

    if (msg.key.fromMe) return;

    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    
    if (body.trim() === ".bot") {
        const pairingCode = await sock.requestPairingCode(remoteJid.split('@')[0]);
        await sock.sendMessage(remoteJid, { text: `كود الربط: *${pairingCode}*` });
    }
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    
    if (connection === 'open') {
        const userJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const userIdOnly = sock.user.id.split(':')[0];
        
        let db = JSON.parse(fs.readFileSync(DB_PATH));
        if (!db[userIdOnly]) {
            db[userIdOnly] = {
                password: "FS-" + Math.floor(1000 + Math.random() * 9000),
                settings: DEFAULT_VIDEO_SETTINGS,
                joinedAt: new Date()
            };
            fs.writeFileSync(DB_PATH, JSON.stringify(db));
        }

        const userPass = db[userIdOnly].password;
        const settingsUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost'}/settings.html`;

        // رسالة التنشيط المزخرفة كما في طلبك السابق
        const decorMessage = `╭─❀─╮\n✿  fares bot  ✿\n╰─❀─╯\n\n🌸 *جاري تنشيط البوت الخاص بك* 🌸\n⏳ *يستغرق التنشيط 03 دقائق.*`;
        await sock.sendMessage(userJid, { text: decorMessage });
        await sock.sendMessage(userJid, { text: `🔐 *بيانات الدخول:* \nكلمة السر: *${userPass}*\nالرابط: ${settingsUrl}` });
    }

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) startSocket();
      else {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        startSocket();
      }
    }
  });

  return sock;
}

// مسار لتحديث الإعدادات وتطبيقها تلقائياً
app.post('/api/settings/save', (req, res) => {
    const { number, password, settings } = req.body;
    let db = JSON.parse(fs.readFileSync(DB_PATH));
    
    if (db[number] && db[number].password === password) {
        db[number].settings = { ...db[number].settings, ...settings };
        fs.writeFileSync(DB_PATH, JSON.stringify(db));
        
        // تطبيق التغييرات فوراً (مثل تغيير الظهور أونلاين)
        if (sock && settings.alwaysOnline) {
            sock.sendPresenceUpdate(settings.alwaysOnline === "on" ? 'available' : 'unavailable');
        }
        
        res.json({ success: true, message: "تم تحديث الإعدادات وتطبيقها تلقائياً" });
    } else {
        res.status(401).json({ success: false, message: "بيانات غير صحيحة" });
    }
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  startSocket();
});
