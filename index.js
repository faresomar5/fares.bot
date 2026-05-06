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
  jidDecode
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const AUTH_DIR = process.env.WA_AUTH_DIR || path.join(__dirname, 'storage', 'baileys_auth');
const logger = Pino({ level: 'info' });

if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

let sock = null;

// وظيفة لتوليد كلمة سر عشوائية للإعدادات
const settingsPass = "Fares-" + Math.floor(1000 + Math.random() * 9000);

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
    browser: ["Fares-Bot", "Chrome", "20.0.0"],
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      console.log('✅ Connected!');
      const userJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      
      // إرسال رسالة نجاح التشغيل فور الربط
      const welcomeMsg = `✅ *تم تشغيل البوت بنجاح!*\n\n⚙️ *رابط الإعدادات:* https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'bot-eahg.onrender.com'}/settings.html\n🔑 *كلمة السر:* ${settingsPass}`;
      await sock.sendMessage(userJid, { text: welcomeMsg });
    }
    
    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) startSocket();
    }
  });

  // ميزة التفاعل التلقائي مع الحالات (Status React)
  sock.ev.on('messages.upsert', async (chatUpdate) => {
    try {
      const msg = chatUpdate.messages[0];
      if (!msg.message) return;
      
      // التحقق إذا كانت الرسالة حالة (Status)
      if (msg.key.remoteJid === 'status@broadcast') {
        // التفاعل مع الحالة برمز تعبيري (مثل ❤️)
        await sock.sendMessage('status@broadcast', {
          react: { text: '❤️', key: msg.key }
        }, { statusJidList: [msg.key.participant] });
        
        console.log(`✅ Reacted to status from: ${msg.key.participant}`);
      }
    } catch (e) { console.error(e); }
  });

  return sock;
}

app.get('/api/pairing', async (req, res) => {
  let number = req.query.number?.replace(/\D/g, '');
  if (!number) return res.status(400).json({ status: false });
  try {
    if (!sock) await startSocket();
    await new Promise(r => setTimeout(r, 5000));
    const code = await sock.requestPairingCode(number);
    res.json({ status: true, pairing_code: code });
  } catch (err) { res.status(500).json({ status: false }); }
});

// توجيه لملف الإعدادات
app.get('/settings.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server running...`);
  startSocket();
});
