const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  Browsers
} = require('@whiskeysockets/baileys');

const app = express();
const port = process.env.PORT || 3000;
const logger = pino({ level: process.env.LOG_LEVEL || 'silent' });
const SESSION_ROOT = path.join(__dirname, 'sessions');

const activeSessions = new Map();
const pendingPairings = new Map();

function normalizePhone(input) {
  return String(input || '').replace(/\D/g, '');
}

function isValidPhone(phone) {
  return /^\d{10,15}$/.test(phone);
}

function getSessionDir(phone) {
  return path.join(SESSION_ROOT, phone);
}

async function removeSession(phone) {
  const session = activeSessions.get(phone);

  if (session?.socket?.ws && session.socket.ws.readyState === 1) {
    try {
      session.socket.ws.close();
    } catch (_) {}
  }

  activeSessions.delete(phone);
  pendingPairings.delete(phone);
  await fs.remove(getSessionDir(phone));
}

async function createSocketForPhone(phone) {
  const sessionDir = getSessionDir(phone);
  await fs.ensureDir(sessionDir);

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const socket = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    logger,
    printQRInTerminal: false,
    browser: Browsers.macOS('Google Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    defaultQueryTimeoutMs: 60000,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 15000,
    retryRequestDelayMs: 250
  });

  socket.ev.on('creds.update', saveCreds);

  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      pendingPairings.delete(phone);
      console.log(`WhatsApp connected for ${phone}`);
      return;
    }

    if (connection === 'close') {
      const disconnectCode = parseDisconnectCode(lastDisconnect);
      const currentSession = activeSessions.get(phone);
      if (!currentSession || currentSession.socket !== socket) {
        return;
      }

      if (disconnectCode === DisconnectReason.loggedOut || disconnectCode === 401) {
        console.log(`WhatsApp logged out for ${phone}`);
        await removeSession(phone);
        return;
      }

      if (state.creds.registered || socket.user) {
        console.log(`Reconnecting ${phone}, reason: ${disconnectCode || 'unknown'}`);
        activeSessions.delete(phone);
        setTimeout(() => {
          createSocketForPhone(phone).catch((error) => {
            console.error(`Reconnect failed for ${phone}:`, error.message);
          });
        }, 2000);
      }
    }
  });

  activeSessions.set(phone, { socket, sessionDir, createdAt: Date.now() });

  return { socket, state, sessionDir };
}

function parseDisconnectCode(lastDisconnect) {
  return (
    lastDisconnect?.error?.output?.statusCode ||
    lastDisconnect?.error?.data?.attrs?.code ||
    lastDisconnect?.error?.statusCode ||
    null
  );
}

async function waitForPairingCode(phone, socket, state) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let codeRequested = false;

    const finish = (type, payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.ev.off('connection.update', onUpdate);
      if (type === 'resolve') resolve(payload);
      else reject(payload);
    };

    const onUpdate = async (update) => {
      try {
        const { connection, qr, lastDisconnect } = update;
        const disconnectCode = parseDisconnectCode(lastDisconnect);

        if ((connection === 'connecting' || qr) && !codeRequested && !state.creds.registered) {
          codeRequested = true;
          const rawCode = await socket.requestPairingCode(phone);
          const formattedCode = rawCode?.match(/.{1,4}/g)?.join('-') || rawCode;
          pendingPairings.set(phone, { code: formattedCode, createdAt: Date.now() });
          return finish('resolve', {
            status: true,
            pairing_code: formattedCode,
            message: 'تم إنشاء كود الربط بنجاح'
          });
        }

        if (connection === 'open') {
          pendingPairings.delete(phone);
        }

        if (connection === 'close') {
          if (disconnectCode === DisconnectReason.loggedOut || disconnectCode === 401) {
            await removeSession(phone);
          }

          if (!codeRequested) {
            return finish('reject', new Error(`تم إغلاق الاتصال قبل إنشاء كود الربط. رمز الحالة: ${disconnectCode || 'unknown'}`));
          }
        }
      } catch (error) {
        finish('reject', error);
      }
    };

    const timeout = setTimeout(() => {
      finish('reject', new Error('انتهت مهلة إنشاء كود الربط، حاول مرة أخرى'));
    }, 45000);

    socket.ev.on('connection.update', onUpdate);
  });
}

async function restoreExistingSessions() {
  await fs.ensureDir(SESSION_ROOT);
  const entries = await fs.readdir(SESSION_ROOT).catch(() => []);

  for (const phone of entries) {
    if (!/^\d{10,15}$/.test(phone)) continue;
    try {
      await createSocketForPhone(phone);
      console.log(`Session restored for ${phone}`);
    } catch (error) {
      console.error(`Failed to restore session for ${phone}:`, error.message);
    }
  }
}

app.get('/health', async (_req, res) => {
  res.json({
    ok: true,
    active_sessions: activeSessions.size,
    pending_pairings: pendingPairings.size
  });
});

app.get('/api/status', async (req, res) => {
  const phone = normalizePhone(req.query.number);
  if (!isValidPhone(phone)) {
    return res.status(400).json({ status: false, error: 'اكتب الرقم بصيغة دولية صحيحة بدون + أو مسافات' });
  }

  const session = activeSessions.get(phone);
  const pending = pendingPairings.get(phone);
  const sessionDir = getSessionDir(phone);
  const exists = await fs.pathExists(sessionDir);

  return res.json({
    status: true,
    phone,
    connected: Boolean(session?.socket?.user),
    pairing_pending: Boolean(pending),
    pairing_code: pending?.code || null,
    session_saved: exists
  });
});

app.get('/api/logout', async (req, res) => {
  const phone = normalizePhone(req.query.number);
  if (!isValidPhone(phone)) {
    return res.status(400).json({ status: false, error: 'اكتب الرقم بصيغة دولية صحيحة بدون + أو مسافات' });
  }

  try {
    await removeSession(phone);
    res.json({ status: true, message: 'تم حذف الجلسة وتسجيل الخروج' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ status: false, error: 'فشل حذف الجلسة' });
  }
});

app.get('/api/pairing', async (req, res) => {
  const phone = normalizePhone(req.query.number);

  if (!isValidPhone(phone)) {
    return res.status(400).json({ status: false, error: 'اكتب الرقم بصيغة دولية صحيحة بدون + أو مسافات' });
  }

  try {
    const existing = activeSessions.get(phone);
    const pending = pendingPairings.get(phone);

    if (existing?.socket?.user) {
      return res.json({
        status: true,
        already_connected: true,
        message: 'الرقم مسجل دخول بالفعل',
        phone
      });
    }

    if (pending?.code && Date.now() - pending.createdAt < 60000) {
      return res.json({
        status: true,
        pairing_code: pending.code,
        message: 'تم إرجاع نفس كود الربط الحالي',
        phone
      });
    }

    if (existing?.socket && !existing.socket.user) {
      try {
        existing.socket.ws.close();
      } catch (_) {}
      activeSessions.delete(phone);
    }

    const { socket, state } = await createSocketForPhone(phone);
    const result = await waitForPairingCode(phone, socket, state);
    return res.json(result);
  } catch (error) {
    console.error('Pairing error:', error);
    await removeSession(phone).catch(() => {});
    return res.status(500).json({
      status: false,
      error: error.message || 'فشل إنشاء كود الربط'
    });
  }
});

app.get('/', (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Fares Bot</title>
        <style>
          body { font-family: Arial, sans-serif; background:#0f172a; color:#fff; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
          .box { width:min(92vw,700px); background:#111827; border:1px solid #334155; border-radius:18px; padding:28px; box-shadow:0 12px 40px rgba(0,0,0,.3); }
          h1 { margin-top:0; color:#22c55e; }
          code { background:#020617; padding:3px 8px; border-radius:8px; }
          .muted { color:#cbd5e1; }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>بوابة ربط فارس بوت</h1>
          <p class="muted">استخدم المسار التالي للحصول على كود الربط:</p>
          <p><code>/api/pairing?number=201001234567</code></p>
          <p class="muted">لمتابعة حالة الجلسة:</p>
          <p><code>/api/status?number=201001234567</code></p>
          <p class="muted">ولتسجيل الخروج:</p>
          <p><code>/api/logout?number=201001234567</code></p>
        </div>
      </body>
    </html>
  `);
});

app.listen(port, async () => {
  await fs.ensureDir(SESSION_ROOT);
  await restoreExistingSessions();
  console.log(`Server Fares-Bot is running on port ${port}`);
});
