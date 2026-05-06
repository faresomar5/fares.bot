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
    // تم تحديث المتصفح لضمان ظهور إشعار الربط على هاتفك
    browser: ["Ubuntu", "Chrome", "20.0.0"], 
    printQRInTerminal: false,
    markOnlineOnConnect: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) {
        startSocket();
      } else {
        // حذف الجلسة التالفة والبدء من جديد
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
