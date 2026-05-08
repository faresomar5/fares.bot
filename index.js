require('dotenv').config();
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    Browsers,
    delay
} = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const cors = require('cors');
const fs = require('fs-extra');
const axios = require('axios');
const path = require('path');
const { exec } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const SESSION_DIR = './session';
const MY_URL = 'https://fares-bot-eahg.onrender.com';

let sock;
let statusEmoji = '👑'; 

// تشغيل بوت التليجرام تلقائياً
function startTelegramBot() {
    exec('python3 bot.py', (err, stdout, stderr) => {
        if (err) { console.error("❌ خطأ في بوت التليجرام:", err); return; }
        console.log("✅ بوت التليجرام يعمل...");
    });
}

// نبض السيرفر (كل دقيقة) لمنع Render من النوم
function keepAlive() {
    setInterval(() => {
        axios.get(MY_URL).then(() => console.log('⚡ نبض النشاط: مستمر')).catch(() => {});
    }, 60 * 1000); 
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
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('🔄 انقطع الاتصال، جاري إعادة الربط...');
                setTimeout(() => startFaresBot(), 3000);
            }
        }
        console.log('📡 الحالة:', connection);
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek || !mek.message) return;
            const from = mek.key.remoteJid;

            if (from === 'status@broadcast') {
                await sock.readMessages([mek.key]);
                await delay(2500); // تأخير بسيط لضمان قبول الإعجاب
                await sock.sendMessage(from, { 
                    react: { key: mek.key, text: statusEmoji } 
                }, { 
                    statusJidList: [mek.key.participant] 
                });
                return;
            }

            const body = mek.message.conversation || mek.message.extendedTextMessage?.text || "";
            if (body.startsWith('ايموجي ')) {
                statusEmoji = body.split(' ')[1] || '👑';
                await sock.sendMessage(from, { text: `✅ تم ضبط الإيموجي على: ${statusEmoji}` });
            }
        } catch (e) { console.error(e); }
    });
}

app.get('/', (req, res) => res.send('Fares Bot Online 24/7'));

app.post('/api/pairing', async (req, res) => {
    const num = req.body.num;
    if (!num) return res.status(400).json({ error: 'num required' });
    try {
        await startFaresBot(true);
        await delay(8000);
        const code = await sock.requestPairingCode(num);
        res.json({ success: true, code });
    } catch (err) { res.status(500).json({ error: 'fail' }); }
});

app.listen(PORT, () => {
    startFaresBot();
    startTelegramBot();
    keepAlive();
});
