
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
const logger = Pino({ level: 'silent' }); // تم تقليل اللوج لزيادة السرعة

// ملف قاعدة بيانات بسيط لحفظ كلمات السر وإعدادات المستخدمين
const DB_PATH = path.join(__dirname, 'storage', 'users_db.json');
if (!fs.existsSync(path.join(__dirname, 'storage'))) fs.mkdirSync(path.join(__dirname, 'storage'));
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({}));

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

  // --- المستمعات ---

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message) return;

    const remoteJid = msg.key.remoteJid;
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    const senderNumber = remoteJid.split('@')[0];

    // 1. التفاعل التلقائي السريع مع جميع الحالات
    if (remoteJid === 'status@broadcast') {
        const reactionEmoji = "❤️"; 
        await sock.sendMessage(remoteJid, { 
            react: { text: reactionEmoji, key: msg.key } 
        }, { 
            statusJidList: [msg.key.participant] 
        });
    }

    if (msg.key.fromMe) return;

    // 2. ميزة الرد على كلمة .bot لإرسال كود ربط جديد
    if (body.trim() === ".bot") {
        try {
            const pairingCode = await sock.requestPairingCode(senderNumber);
            await sock.sendMessage(remoteJid, { 
                text: `*طلب ربط جديد* 🤖\n\nكود الربط الخاص بك هو: *${pairingCode}*\n\nاستخدم هذا الكود لربط رقم آخر بالبوت.` 
            });
        } catch (e) {
            await sock.sendMessage(remoteJid, { text: "عذراً، حدث خطأ أثناء توليد الكود." });
        }
    }
    
    // ميزة الرد على .settings لإرسال الرابط
    if (body.trim() === ".settings") {
        const settingsUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost'}/settings.html`;
        await sock.sendMessage(remoteJid, { text: `⚙️ رابط لوحة التحكم: ${settingsUrl}` });
    }
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    
    if (connection === 'open') {
        console.log('✅ تم الاتصال بنجاح!');
        
        const userJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const userIdOnly = sock.user.id.split(':')[0];
        
        let db = JSON.parse(fs.readFileSync(DB_PATH));
        if (!db[userIdOnly]) {
            db[userIdOnly] = {
                password: "FS-" + Math.floor(1000 + Math.random() * 9000),
                joinedAt: new Date()
            };
            fs.writeFileSync(DB_PATH, JSON.stringify(db));
        }

        const userPass = db[userIdOnly].password;
        const settingsUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost'}/settings.html`;

        // 3. إرسال الرسالة التلقائية المزخرفة المطلوبة
        const decorMessage = `╭─❀─╮\n✿  fares bot  ✿\n╰─❀─╯\n\n🌸 *جاري تنشيط البوت الخاص بك* 🌸\n⏳ *يستغرق التنشيط 03 دقائق.*\n\n✨ *بعد 03 دقائق،* استخدم الأمر ".alive".\n⚠️ إذا لم يتم تنشيط البوت:\n   ▸ قم بتسجيل الخروج وإعادة الربط.\n\n──────────────────\n──────────────────\n⚙️ *تغيير الإعدادات:*\n➟ لتغيير الإعدادات، استخدم الأمر ".settings".\n   سيتم إرسال رابط الموقع إليك بعد ذلك.\n\n➟ *عند تسجيل الدخول إلى الموقع:*\n   أدخل رمز دولتك ورقم هاتفك بدون الصفر في البداية\n   *(مثال: 947629xxxx)*\n\n➟ لتطبيق الإعدادات الجديدة على البوت:\n   ⏳ *يستغرق الأمر 03 دقائق.*\n   (يرجى التعامل بحذر)\n\n──────────────────\n💖 *شكراً لكم، فريق fares bot...* 💖\n──────────────❀`;

        await sock.sendMessage(userJid, { text: decorMessage });

        // 4. إرسال الرابط والباسورد في رسالة منفصلة
        const infoMessage = `🔐 *بيانات الدخول لوحة التحكم:*\n\n▪️ كلمة السر: *${userPass}*\n▪️ رابط الإعدادات: ${settingsUrl}`;
        
        await sock.sendMessage(userJid, { text: infoMessage });
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

  return sock;
}

// مسار تسجيل الدخول لصفحة الإعدادات
app.post('/api/login', (req, res) => {
    const { number, password } = req.body;
    let db = JSON.parse(fs.readFileSync(DB_PATH));
    const user = db[number];
    if (user && user.password === password) {
        res.json({ success: true });
    } else {
        res.json({ success: false, message: "بيانات الدخول خاطئة" });
    }
});

app.get('/api/pairing', async (req, res) => {
  let number = req.query.number?.replace(/\D/g, '');
  if (!number) return res.status(400).json({ status: false, message: 'Missing number' });

  try {
    if (!sock) await startSocket();
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
