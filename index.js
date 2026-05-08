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
const cors = require('cors');
const fs = require('fs-extra');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SESSION_DIR = './session';
// ملاحظة: تأكد أن هذا الرابط هو رابط موقعك الفعلي على Render
const MY_URL = 'https://fares-bot-eahg.onrender.com';

let sock;
let statusEmoji = '👑';

// دالة التنشيط لمنع السيرفر من النوم
function keepAlive() {
    setInterval(() => {
        axios.get(MY_URL).then(() => {
            console.log('✅ السيرفر مستيقظ - Heartbeat sent');
        }).catch(() => {});
    }, 3 * 60 * 1000); // كل 3 دقائق
}

async function startFaresBot(clear = false) {
    if (clear && fs.existsSync(SESSION_DIR)) {
        await fs.emptyDir(SESSION_DIR);
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false, // لتقليل استهلاك السيرفر
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('🔄 جاري إعادة الاتصال...');
                setTimeout(() => startFaresBot(), 5000);
            }
        }
        console.log('📡 حالة الاتصال:', connection);
    });

    // التفاعل مع الحالات والأوامر
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;
            const from = mek.key.remoteJid;

            // 1. التفاعل التلقائي مع الحالات
            if (from === 'status@broadcast') {
                await sock.readMessages([mek.key]);
                await sock.sendMessage(from, { react: { key: mek.key, text: statusEmoji } }, { statusJidList: [mek.key.participant] });
                return;
            }

            const body = mek.message.conversation || mek.message.extendedTextMessage?.text || "";
            const cmd = body.trim().toLowerCase();

            // 2. أمر الفحص
            if (cmd === 'فحص') {
                await sock.sendMessage(from, { text: '🚀 بوت الملك فارس متصل وشغال 24 ساعة!' }, { quoted: mek });
            }

            // 3. تغيير الإيموجي
            if (body.startsWith('ايموجي ')) {
                statusEmoji = body.split(' ')[1] || '👑';
                await sock.sendMessage(from, { text: `✅ تم ضبط إيموجي الحالات على: ${statusEmoji}` });
            }

        } catch (e) { console.error('Error in message:', e); }
    });
}

// الواجهة البرمجية
app.get('/', (req, res) => res.send('Fares Bot Online 24/7'));

app.post('/api/pairing', async (req, res) => {
    const num = req.body.num;
    if (!num) return res.status(400).json({ error: 'الرقم مطلوب' });
    try {
        await startFaresBot(true);
        await new Promise(r => setTimeout(r, 7000));
        const code = await sock.requestPairingCode(num);
        res.json({ success: true, code });
    } catch (err) { res.status(500).json({ error: 'Server Error' }); }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    startFaresBot();
    keepAlive();
});
