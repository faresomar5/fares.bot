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
[span_0](start_span)// المسار المعتمد في ملف render.yaml الخاص بك[span_0](end_span)
const AUTH_DIR = process.env.WA_AUTH_DIR || path.join(__dirname, 'storage', 'baileys_auth');
const logger = Pino({ level: 'info' });

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
    // تغيير المتصفح لضمان ظهور إشعار الربط على الهاتف
    browser: ["Ubuntu", "Chrome", "20.0.0"], 
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) {
        startSocket();
      } else {
        // حذف الجلسة إذا تم تسجيل الخروج لبدء واحدة نظيفة
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        startSocket();
      }
    }
  });

  return sock;
}

app.get('/api/pairing', async (req, res) => {
  let number = req.query.number?.replace(/\D/g, '');
  if (!number) return res.status(400).json({ status: false, message: 'يرجى إدخال الرقم' });

  try {
    // التأكد من تشغيل السيرفر أو إعادة تشغيله عند الطلب
    if (!sock) await startSocket();
    
    // إعطاء وقت للسيرفر للاتصال قبل طلب الكود
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const code = await sock.requestPairingCode(number);
    res.json({ status: true, pairing_code: code });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ status: false, message: 'فشل إنشاء الكود، تأكد من الرقم وحاول مجدداً' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  startSocket();
});
