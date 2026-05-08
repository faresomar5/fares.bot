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
const fs = require('fs-extra');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const SESSION_DIR = './session';

let sock;
let statusEmoji = '👑'; 

async function startFaresBot(clearSession = false) {
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
        browser: Browsers.ubuntu('Chrome'), // ضروري جداً لظهور الإشعارات
        getMessage: async (key) => { return { conversation: '' } } // لتحسين استجابة البوت
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
        }
        console.log('حالة الاتصال:', connection);
    });

    // --- المحرك المطور لاستقبال الرسائل والتفاعل ---
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;

            const from = mek.key.remoteJid;

            // 1. التفاعل التلقائي مع الحالات (Status)
            if (from === 'status@broadcast') {
                await sock.readMessages([mek.key]);
                await sock.sendMessage(from, { react: { key: mek.key, text: statusEmoji } }, { statusJidList: [mek.key.participant] });
                return;
            }

            // استخراج النص وتجهيز الأوامر
            const body = mek.message.conversation || mek.message.extendedTextMessage?.text || mek.message.imageMessage?.caption || "";
            const text = body.trim();
            const cmd = text.toLowerCase();

            // 2. أمر تغيير الإيموجي
            if (text.startsWith('ايموجي ')) {
                statusEmoji = text.split(' ')[1] || '👑';
                await sock.sendMessage(from, { text: `✅ تم تحديث إيموجي الحالات إلى: ${statusEmoji}` }, { quoted: mek });
            }

            // 3. أمر فحص العمل (Test)
            if (cmd === 'فحص' || cmd === 'test') {
                await sock.sendMessage(from, { text: '✅ بوت الملك فارس يعمل الآن وبأقصى سرعة!' }, { quoted: mek });
            }

            // 4. رد الترحيب
            if (cmd === 'فارس') {
                await sock.sendMessage(from, { text: '👑 لبيك يا ملك، البوت شغال ويرد عليك حالياً.' }, { quoted: mek });
            }

        } catch (err) {
            console.error('خطأ في معالجة الرسالة:', err);
        }
    });
}

app.post('/api/pairing', async (req, res) => {
    const num = req.body.num;
    if (!num) return res.status(400).json({ error: 'الرقم مطلوب' });
    try {
        await startFaresBot(true);
        await new Promise(resolve => setTimeout(resolve, 5000));
        const code = await sock.requestPairingCode(num);
        res.json({ success: true, code });
    } catch (err) {
        res.status(500).json({ error: 'فشل في الاتصال بالواتساب' });
    }
});

app.listen(PORT, () => {
    console.log(`سيرفر الملك فارس جاهز للعمل`);
    startFaresBot();
});
