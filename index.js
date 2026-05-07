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
const logger = Pino({ level: process.env.LOG_LEVEL || 'info' });

fs.mkdirSync(AUTH_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let sock = null;
let startPromise = null;
let lastConnection = 'idle';
let latestQrSeenAt = 0;
let currentPairingPromise = null;

function cleanNumber(input = '') {
  return String(input).replace(/\D/g, '');
}

function isValidPhone(number) {
  return /^\d{8,15}$/.test(number);
}

function normalizePairingCode(code = '') {
  return String(code).replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

function formatConnectionState() {
  if (sock?.user?.id) return 'paired';
  return lastConnection;
}

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
      browser: Browsers.macOS('Desktop'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      printQRInTerminal: false,
      defaultQueryTimeoutMs: 60000,
    });

    instance.ev.on('creds.update', saveCreds);

    instance.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        latestQrSeenAt = Date.now();
      }

      if (connection) {
        lastConnection = connection;
        logger.info({ connection }, 'WhatsApp connection update');
      }

      if (connection === 'open') {
        logger.info({ user: instance.user?.id || null }, 'WhatsApp connected');
      }

      if (connection === 'close') {
        const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        logger.warn({ statusCode, loggedOut }, 'WhatsApp connection closed');

        sock = null;

        if (!loggedOut) {
          setTimeout(() => {
            startSocket().catch((error) => {
              logger.error({ error: error?.message || error }, 'Reconnect failed');
            });
          }, 2500);
        }
      }
    });

    sock = instance;
    return instance;
  })();

  try {
    return await startPromise;
  } finally {
    startPromise = null;
  }
}

async function waitForPairingWindow(timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (sock?.user?.id) return 'paired';

    if (lastConnection === 'connecting' || lastConnection === 'open') {
      return lastConnection;
    }

    if (latestQrSeenAt && Date.now() - latestQrSeenAt < timeoutMs) {
      return 'qr';
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error('Timed out while waiting for WhatsApp pairing readiness');
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'fares-bot-pairing',
    connection: formatConnectionState(),
    auth_dir: AUTH_DIR,
    has_session: fs.existsSync(AUTH_DIR) && fs.readdirSync(AUTH_DIR).length > 0,
  });
});

app.get('/api/pairing', async (req, res) => {
  try {
    const number = cleanNumber(req.query.number);

    if (!number) {
      return res.status(400).json({ status: false, message: 'يرجى إدخال رقم الهاتف' });
    }

    if (!isValidPhone(number)) {
      return res.status(400).json({
        status: false,
        message: 'الرقم يجب أن يكون بصيغة دولية E.164 بدون + وبطول من 8 إلى 15 رقم',
      });
    }

    await startSocket();
    await waitForPairingWindow();

    if (sock?.user?.id) {
      return res.status(409).json({
        status: false,
        message: 'البوت مرتبط بالفعل. إذا أردت ربط رقم جديد احذف ملفات الجلسة من مجلد storage/baileys_auth ثم أعد التشغيل.',
      });
    }

    if (currentPairingPromise) {
      await currentPairingPromise.catch(() => null);
    }

    currentPairingPromise = sock.requestPairingCode(number);
    const code = normalizePairingCode(await currentPairingPromise);
    currentPairingPromise = null;

    return res.json({
      status: true,
      pairing_code: code,
    });
  } catch (error) {
    currentPairingPromise = null;
    logger.error({ error: error?.message || error }, 'Pairing endpoint failed');

    return res.status(500).json({
      status: false,
      message: 'فشل إنشاء كود الاقتران',
      error: error?.message || 'unknown_error',
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, HOST, async () => {
  logger.info(`Server running on http://${HOST}:${PORT}`);
  try {
    await startSocket();
  } catch (error) {
    logger.error({ error: error?.message || error }, 'Initial WhatsApp bootstrap failed');
  }
});
