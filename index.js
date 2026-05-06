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
// تحديد مسار التخزين ليتوافق مع القرص المستمر في Render
const AUTH_DIR = process.env.WA_AUTH_DIR || path.join(__dirname, 'storage', 'baileys_auth');
const logger = Pino({ level: process.env.LOG_LEVEL || 'info' });

// إنشاء مجلد التخزين إذا لم يكن موجوداً
if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let sock = null;
let startPromise = null;

async function startSocket() {
  if (sock) return sock;
  if (startPromise) return startPromise;

  startPromise = (async () => {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const instance = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      // تم تحديث المتصفح لضمان قبول كود الاقتران من قبل واتساب
      browser: ["Ubuntu", "Chrome", "20.0.0"], 
      printQRInTerminal: false,
      markOnlineOnConnect: true,
    });

    instance.ev.on('creds.update', saveCreds);

    instance.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'close') {
        const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
        if (statusCode !== DisconnectReason.loggedOut) {
          startSocket();
        } else {
          // إذا تم تسجيل الخروج، نحذف الملفات التالفة لبدء جلسة جديدة
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          startSocket();
        }
      }
      if (connection === 'open') {
        console.log('✅ تم الاتصال بنجاح بواتساب!');
      }
    });

    sock = instance;
    return instance;
  })();

  return startPromise;
}

// نقطة النهاية (API) لطلب كود الاقتران
app.get('/api/pairing', async (req, res) => {
  let number = req.query.number;
  if (!number) return res.status(400).json({ status: false, message: 'الرجاء إدخال الرقم' });

  try {
    number = number.replace(/\D/g, ''); // تنظيف الرقم من أي رموز
    const client = await startSocket();
    
    // تأخير بسيط لضمان جاهزية السيرفر قبل طلب الكود
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const code = await client.requestPairingCode(number);
    res.json({ status: true, pairing_code: code });
  } catch (error) {
    console.error('Error in pairing:', error);
    res.status(500).json({ status: false, message: 'فشل إنشاء الكود، حاول مجدداً' });
  }
});

// توجيه أي طلب غير موجود لصفحة index.html داخل مجلد public
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
  startSocket();
});
