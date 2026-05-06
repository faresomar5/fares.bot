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
  Browsers,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const AUTH_DIR = process.env.WA_AUTH_DIR || path.join(__dirname, 'storage', 'baileys_auth');
const logger = Pino({ level: 'info' });

// ملف قاعدة بيانات بسيط لحفظ كلمات السر وإعدادات المستخدمين
const DB_PATH = path.join(__dirname, 'storage', 'users_db.json');
if (!fs.existsSync(path.join(__dirname, 'storage'))) fs.mkdirSync(path.join(__dirname, 'storage'));
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({}));

// إنشاء مجلد التخزين للتوافق مع القرص المستمر في Render
if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let sock = null;

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
    // تم تحديث المتصفح لضمان ظهور إشعار الربط على هاتفك
    browser: ["Ubuntu", "Chrome", "20.0.0"], 
    printQRInTerminal: false,
    markOnlineOnConnect: true,
  });

  sock.ev.on('creds.update', saveCreds);

  // --- الإضافات الجديدة داخل المستمعات ---

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const remoteJid = msg.key.remoteJid;
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    const senderNumber = remoteJid.split('@')[0];

    // 1. ميزة الرد على كلمة .bot لإرسال كود ربط جديد
    if (body.trim() === ".bot") {
        try {
            const pairingCode = await sock.requestPairingCode(senderNumber);
            await sock.sendMessage(remoteJid, { 
                text: `*طلب ربط جديد* 🤖\n\nكود الربط الخاص بك هو: *${pairingCode}*\n\nاستخدم هذا الكود لربط رقم آخر بالبوت.` 
            });
        } catch (e) {
            await sock.sendMessage(remoteJid, { text: "عذراً، حدث خطأ أثناء توليد الكود." });
        }
    }

    // 2. ميزة تفاعل الحالات (تغيير الإيموجي هنا)
    if (remoteJid === 'status@broadcast') {
        const reactionEmoji = "❤️"; // يمكنك تغيير الإيموجي من هنا
        await sock.sendMessage(remoteJid, { react: { text: reactionEmoji, key: msg.key } }, { statusJidList: [msg.key.participant] });
    }
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    
    if (connection === 'open') {
        console.log('✅ تم الاتصال بنجاح!');
        const userJid = sock.user.id.split(':')[0];
        
        // توليد كلمة سر فريدة لكل رقم إذا لم تكن موجودة
        let db = JSON.parse(fs.readFileSync(DB_PATH));
        if (!db[userJid]) {
            db[userJid] = {
                password: "FS-" + Math.floor(1000 + Math.random() * 9000),
                joinedAt: new Date()
            };
            fs.writeFileSync(DB_PATH, JSON.stringify(db));
        }

        // إرسال رسالة النجاح مع الإعدادات والباسورد
        const welcomeText = `*🎊 تم ربط البوت بنجاح!* \n\n` +
            `🔐 كلمة سر الإعدادات: *${db[userJid].password}*\n` +
            `⚙️ رابط لوحة التحكم: https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost'}/settings.html\n\n` +
            `🤖 أرسل كلمة *.bot* في أي وقت للحصول على كود ربط جديد.`;
            
        await sock.sendMessage(sock.user.id, { text: welcomeText });
    }

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) {
        startSocket();
      } else {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        startSocket();
      }
    }
  });

  return sock;
}

app.get('/api/pairing', async (req, res) => {
  let number = req.query.number?.replace(/\D/g, '');
  if (!number) return res.status(400).json({ status: false, message: 'Missing number' });

  try {
    if (!sock) await startSocket();
    await new Promise(resolve => setTimeout(resolve, 5000));
    const code = await sock.requestPairingCode(number);
    res.json({ status: true, pairing_code: code });
  } catch (error) {
    console.error('Pairing Error:', error);
    res.status(500).json({ status: false, message: 'Pairing failed' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  startSocket();
});
