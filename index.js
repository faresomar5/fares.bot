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
    browser: ["Ubuntu", "Chrome", "20.0.0"], 
    printQRInTerminal: false,
    markOnlineOnConnect: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    // إرسال رسالة عند نجاح الاتصال
    if (connection === 'open') {
      console.log('✅ Connected to WhatsApp');
      const userJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      const welcomeMsg = `✅ *تم تفعيل البوت بنجاح!*\n\n⚙️ *إعدادات البوت:* https://bot-eahg.onrender.com/settings.html\n🔑 *كلمة السر:* Fares-9900`;
      
      try {
        await sock.sendMessage(userJid, { text: welcomeMsg });
      } catch (err) {
        console.error('Failed to send welcome message:', err);
      }
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

  // ميزة التفاعل التلقائي مع الحالات (Status Auto-React)
  sock.ev.on('messages.upsert', async (chatUpdate) => {
    try {
      const msg = chatUpdate.messages[0];
      if (!msg.message || msg.key.remoteJid !== 'status@broadcast') return;
      
      // التفاعل برمز تعبيري (قلب ❤️)
      await sock.sendMessage('status@broadcast', {
        react: { text: '❤️', key: msg.key }
      }, { statusJidList: [msg.key.participant] });
      
    } catch (e) {
      // تجاهل أخطاء الحالات لضمان استقرار السيرفر
    }
  });

  return sock;
}

app.get('/api/pairing', async (req, res) => {
  let number = req.query.number?.replace(/\D/g, '');
  if (!number) return res.status(400).json({ status: false, message: 'Missing number' });

  try {
    if (!sock) await startSocket();
    
    // انتظار 5 ثوانٍ لضمان استقرار الاتصال قبل طلب الكود
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
