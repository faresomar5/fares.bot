require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const P = require('pino');
const QRCode = require('qrcode');
const { Boom } = require('@hapi/boom');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require('@whiskeysockets/baileys');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_DIR = process.env.SESSION_DIR || './session';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

let sock = null;
let authState = null;
let isBooting = false;
let latestQrText = null;
let latestQrBuffer = null;
let connectionState = 'idle';

const logger = P({ level: 'silent' });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function normalizePhone(input) {
  const raw = String(input || '').trim();
  const digits = raw.replace(/\D/g, '');
  return digits;
}

function isLoggedOut(lastDisconnect) {
  const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
  return statusCode === DisconnectReason.loggedOut;
}

async function buildQrBuffer(qrText) {
  latestQrText = qrText || null;
  latestQrBuffer = qrText
    ? await QRCode.toBuffer(qrText, { type: 'png', width: 512, margin: 1 })
    : null;
}

async function startWhatsApp(forceRestart = false) {
  if (sock && !forceRestart) return sock;
  if (isBooting) {
    while (isBooting) {
      await sleep(250);
    }
    return sock;
  }

  isBooting = true;

  try {
    ensureDir(SESSION_DIR);

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    authState = state;

    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ['King Fares Pairing API', 'Chrome', '1.0.0'], // تم تحديث الاسم هنا أيضاً
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, qr, lastDisconnect } = update;

      if (qr) {
        connectionState = 'qr';
        await buildQrBuffer(qr);
      }

      if (connection === 'open') {
        connectionState = 'open';
        await buildQrBuffer(null);
        console.log('WhatsApp connected successfully');
      }

      if (connection === 'close') {
        await buildQrBuffer(null);
        const loggedOut = isLoggedOut(lastDisconnect);
        connectionState = loggedOut ? 'logged_out' : 'closed';
        console.log('WhatsApp connection closed');

        if (loggedOut) {
          sock = null;
          authState = null;
          return;
        }

        sock = null;
        authState = null;
        setTimeout(() => {
          startWhatsApp(true).catch((err) => {
            console.error('Reconnection error:', err.message);
          });
        }, 2000);
      }
    });

    return sock;
  } finally {
    isBooting = false;
  }
}

app.get('/health', (_req, res) => {
  res.json({
    success: true,
    status: 'ok',
    connectionState,
    registered: Boolean(authState?.creds?.registered),
  });
});

app.post('/api/pairing', async (req, res) => {
  try {
    const num = normalizePhone(req.body?.num);

    if (!num) {
      return res.status(400).json({ success: false, error: 'num is required' });
    }

    const wa = await startWhatsApp();
    await sleep(2000);

    if (!wa || typeof wa.requestPairingCode !== 'function') {
      return res.status(500).json({ success: false, error: 'pairing service unavailable' });
    }

    if (authState?.creds?.registered) {
      return res.status(409).json({ success: false, error: 'session already paired' });
    }

    const code = await wa.requestPairingCode(num);

    if (!code) {
      return res.status(500).json({ success: false, error: 'failed to generate pairing code' });
    }

    return res.json({ success: true, code });
  } catch (error) {
    console.error('Pairing error:', error);
    return res.status(500).json({ success: false, error: error.message || 'internal server error' });
  }
});

app.get('/api/qr', async (_req, res) => {
  try {
    await startWhatsApp();

    if (!latestQrBuffer) {
      for (let i = 0; i < 12; i += 1) {
        await sleep(500);
        if (latestQrBuffer) break;
      }
    }

    if (!latestQrBuffer) {
      return res.status(404).json({ success: false, error: 'qr not available yet' });
    }

    res.setHeader('Content-Type', 'image/png');
    return res.send(latestQrBuffer);
  } catch (error) {
    console.error('QR error:', error);
    return res.status(500).json({ success: false, error: error.message || 'internal server error' });
  }
});

app.listen(PORT, HOST, async () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  try {
    await startWhatsApp();
  } catch (error) {
    console.error('Initial WhatsApp boot error:', error.message);
  }
});
