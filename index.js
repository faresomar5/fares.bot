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

if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
// هذا السطر هو المسؤول عن تشغيل صفحة الإعدادات وواجهة الموقع
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
    if (connection === 'open') {
      const userJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      const welcomeMsg = `✅ *تم التفعيل بنجاح*\n\n⚙️ *الإعدادات:* https://bot-eahg.onrender.com/settings.html\n🔑 *كلمة السر:* Fares-9900`;
      await sock.sendMessage(userJid, { text: welcomeMsg });
    }
    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) startSocket();
    }
  });

  // التفاعل التلقائي مع الحالات
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (msg.key.remoteJid === 'status@broadcast') {
      await sock.sendMessage('status@broadcast', { react: { text: '❤️', key: msg.key } }, { statusJidList: [msg.key.participant] });
    }
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

// توجيه لفتح صفحة الإعدادات عند طلبها
app.get('/settings', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server is running on port ${PORT}`);
  startSocket();
});
