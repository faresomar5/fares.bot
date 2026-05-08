require('dotenv').config();
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    Browsers
} = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const path = require('path');
const cors = require('cors');
const fs = require('fs-extra'); // أضفنا هذه المكتبة للمسح السهل

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const SESSION_DIR = './session';

let sock;

async function startFaresBot(clearSession = false) {
    // إذا طلبنا كود جديد، نمسح المجلد القديم فوراً لحل مشكلة "الكود خطأ"
    if (clearSession && fs.existsSync(SESSION_DIR)) {
        await fs.emptyDir(SESSION_DIR);
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        // تغيير المتصفح لـ Chrome على Ubuntu هو الأسرع في إرسال الإشعارات
        browser: Browsers.ubuntu('Chrome'), 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
        }
    });

    // مستمع الرسائل للأوامر (كما طلبت سابقاً)
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        const mek = chatUpdate.messages[0];
        if (!mek.message || mek.key.fromMe) return;
        const from = mek.key.remoteJid;
        const body = mek.message.conversation || mek.message.extendedTextMessage?.text || '';

        if (body.toLowerCase() === 'فارس') {
            await sock.sendMessage(from, { text: '👑 نعم، أنا بوت الملك فارس، كيف أخدمك؟' });
        }
    });

    return sock;
}

app.post('/api/pairing', async (req, res) => {
    const num = req.body.num;
    if (!num) return res.status(400).json({ error: 'الرقم مطلوب' });

    try {
        // أهم خطوة: إعادة تشغيل البوت مع مسح الجلسة لضمان وصول الإشعار وصحة الكود
        await startFaresBot(true);
        
        // انتظار 5 ثوانٍ ليتصل السيرفر بواتساب ويجهز لطلب الكود
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const code = await sock.requestPairingCode(num);
        res.json({ success: true, code });
    } catch (err) {
        console.error('Pairing Error:', err);
        res.status(500).json({ error: 'فشل الربط، حاول مرة أخرى' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startFaresBot();
});
