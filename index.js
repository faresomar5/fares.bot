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
const HOST = '0.0.0.0';
const AUTH_DIR = path.join(__dirname, 'storage', 'baileys_auth');
const logger = Pino({ level: 'silent' });

// نظام الحظر المؤقت (في الذاكرة)
const bannedNumbers = new Map(); 

if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

app.use(cors());
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
    // تحديث المتصفح لضمان تجاوز فلاتر واتساب ووصول الإشعار
    browser: ["Ubuntu", "Chrome", "20.0.0"], 
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      const userJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      const welcomeMsg = `✅ *تم الربط بنجاح*\n\n⚙️ *الإعدادات:* https://bot-eahg.onrender.com/settings.html\n🔑 *كلمة السر:* Fares-9900`;
      await sock.sendMessage(userJid, { text: welcomeMsg });
    }
    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) startSocket();
    }
  });

  // التفاعل التلقائي مع الحالات
  sock.ev.on('messages.upsert', async (chatUpdate) => {
    const msg = chatUpdate.messages[0];
    if (msg.key.remoteJid === 'status@broadcast') {
      await sock.sendMessage('status@broadcast', { react: { text: '❤️', key: msg.key } }, { statusJidList: [msg.key.participant] });
    }
  });

  return sock;
}

app.get('/api/pairing', async (req, res) => {
  let number = req.query.number?.replace(/\D/g, '');
  if (!number) return res.status(400).json({ status: false, message: 'رقم غير صحيح' });

  // فحص إذا كان الرقم محظوراً مؤقتاً
  if (bannedNumbers.has(number)) {
    const banTime = bannedNumbers.get(number);
    if (Date.now() < banTime) {
      return res.status(403).json({ 
        status: false, 
        message: 'تم حظرك من الموقع، انتظر شوي وجرب مرة أخرى' 
      });
    } else {
      bannedNumbers.delete(number);
    }
  }

  try {
    if (!sock) await startSocket();
    await new Promise(r => setTimeout(r, 4000));
    
    const code = await sock.requestPairingCode(number);
    res.json({ status: true, pairing_code: code });

  } catch (err) {
    // إذا فشل الطلب بسبب "طلب زائد" أو حظر من واتساب، نضيف الرقم لقائمة الحظر بالموقع
    bannedNumbers.set(number, Date.now() + 10 * 60 * 1000); // حظر لمدة 10 دقائق
    res.status(500).json({ status: false, message: 'فشل الإنشاء، جرب بعد 10 دقائق' });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on port ${PORT}`);
  startSocket();
});
