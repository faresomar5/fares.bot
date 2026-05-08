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
const URL_APP = 'https://fares-bot-eahg.onrender.com';

let sock;
let statusEmoji = '👑';

// 1. نظام منع النوم الفعال (تنشيط كل دقيقتين)
function keepAlive() {
    setInterval(() => {
        axios.get(URL_APP).then(() => {
            console.log('保持 active - السيرفر مستيقظ');
        }).catch(() => {});
    }, 2 * 60 * 1000); 
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
        logger: pino({ level: 'silent' }), // صامت تماماً لتوفير الرام
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false, // أهم خيار لمنع التوقف
        markOnlineOnConnect: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            // إعادة الاتصال التلقائي في حال الانقطاع
            if (code !== DisconnectReason.loggedOut) {
                setTimeout(() => startFaresBot(), 2000);
            }
        }
        console.log('📡 الحالة:', connection);
    });

    // 2. معالج الرسائل المطور (سرعة استجابة قصوى)
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;
            const from = mek.key.remoteJid;

            // التفاعل مع الحالات فوراً
            if (from === 'status@broadcast') {
                await sock.readMessages([mek.key]);
                await sock.sendMessage(from, { react: { key: mek.key, text: statusEmoji } }, { statusJidList: [mek.key.participant] });
                return;
            }

            const body = mek.message.conversation || mek.message.extendedTextMessage?.text || "";
            const cmd = body.trim().toLowerCase();

            if (cmd === 'فحص') {
                await sock.sendMessage(from, { text: '🚀 بوت الملك فارس متصل ويعمل بنظام الحماية من النوم 24/7' }, { quoted: mek });
            }

            if (body.startsWith('ايموجي ')) {
                statusEmoji = body.split(' ')[1] || '👑';
                await sock.sendMessage(from, { text: `✅ تم تحديث إيموجي التفاعل إلى: ${statusEmoji}` });
            }
        } catch (e) { console.error(e); }
    });
}

app.get('/', (req, res) => res.send('Fares Bot is Running...'));

app.post('/api/pairing', async (req, res) => {
    const num = req.body.num;
    if (!num) return res.status(400).json({ error: 'الرقم مطلوب' });
    try {
        await startFaresBot(true);
        await new Promise(r => setTimeout(r, 6000));
        const code = await sock.requestPairingCode(num);
        res.json({ success: true, code });
    } catch (err) { res.status(500).json({ error: 'خطأ' }); }
});

app.listen(PORT, () => {
    console.log('Server Started');
    startFaresBot();
    keepAlive();
});
