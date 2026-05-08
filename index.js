require('dotenv').config();
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    Browsers,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const path = require('path');
const cors = require('cors');
const fs = require('fs-extra');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const SESSION_DIR = './session';

let sock;
let statusEmoji = '💤'; // إيموجي التفاعل الافتراضي مع الحالات

async function startFaresBot(clearSession = false) {
    if (clearSession && fs.existsSync(SESSION_DIR)) {
        await fs.emptyDir(SESSION_DIR);
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            // نظام حماية المفاتيح لمنع فصل الجلسة السريع
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'), // محاكاة متصفح مستقر للربط
        syncFullHistory: false,
        markOnlineOnConnect: true,
    });

    sock.ev.on('creds.update', saveCreds);

    // نظام منع خمول السيرفر (بقاء السيرفر نشط 24 ساعة)
    setInterval(() => {
        axios.get(`https://fares-bot-eahg.onrender.com`).catch(() => {});
    }, 4 * 60 * 1000); // تنبيه كل 4 دقائق

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('🔄 إعادة الاتصال تلقائياً...');
                startFaresBot();
            }
        }
        console.log('📡 حالة الاتصال الحالية:', connection);
    });

    // نظام التفاعل مع الحالات والأوامر
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message || mek.key.fromMe) return;

            const from = mek.key.remoteJid;
            const participant = mek.key.participant || mek.key.remoteJid;

            // 1. مشاهدة الحالة والتفاعل معها فوراً
            if (from === 'status@broadcast') {
                await sock.readMessages([mek.key]); // تسجيل مشاهدة الحالة
                await sock.sendMessage(from, { 
                    react: { text: statusEmoji, key: mek.key } 
                }, { statusJidList: [participant] });
                return;
            }

            const body = (mek.message.conversation || mek.message.extendedTextMessage?.text || "").trim();
            const command = body.toLowerCase();

            // 2. قائمة الأوامر
            if (command === 'الاوامر' || command === 'الأوامر') {
                const list = `👑 *أوامر بوت الملك فارس* 👑\n\n` +
                             `• *فارس*: ترحيب الملك.\n` +
                             `• *فحص*: حالة الاتصال.\n` +
                             `• *تنشيط*: إعادة تشغيل البوت.\n` +
                             `• *ايموجي [الشكل]*: تغيير تفاعل الحالة.\n` +
                             `• *موقعي*: رابط بوابة الربط.`;
                await sock.sendMessage(from, { text: list });
            }

            if (command === 'فارس') {
                await sock.sendMessage(from, { text: '👑 نعم يا ملك، البوت في خدمتك!' });
            }

            if (command.startsWith('ايموجي')) {
                const emo = body.split(' ')[1];
                if (emo) {
                    statusEmoji = emo;
                    await sock.sendMessage(from, { text: `✅ تم تحديث إيموجي التفاعل إلى: ${statusEmoji}` });
                }
            }

        } catch (err) {
            console.error('خطأ في معالجة الرسالة:', err);
        }
    });

    return sock;
}

// مسارات واجهة الويب
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/pairing', async (req, res) => {
    let num = req.body.num;
    if (!num) return res.status(400).json({ error: 'الرقم مطلوب' });
    num = num.replace(/[^0-9]/g, '');

    try {
        await startFaresBot(true);
        await new Promise(r => setTimeout(r, 6000));
        const code = await sock.requestPairingCode(num);
        res.json({ success: true, code });
    } catch (err) {
        res.status(500).json({ error: 'فشل استخراج الكود' });
    }
});

app.listen(PORT, () => {
    console.log(`✅ السيرفر يعمل الآن على منفذ ${PORT}`);
    startFaresBot();
});
