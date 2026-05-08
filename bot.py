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
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SESSION_DIR = './session';
const MY_URL = 'https://fares-bot-eahg.onrender.com';
const TELEGRAM_TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I";

let sock;
let statusEmoji = '👑'; 

// دالة إرسال إشعار للتليجرام
async function sendToTg(text) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: "7231690686", // ضع هنا ID التليجرام الخاص بك (يمكنك استخراجه من بوت userinfobot)
            text: text,
            parse_mode: "Markdown"
        });
    } catch (e) { console.error("TG Notify Error"); }
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
        browser: Browsers.ubuntu('Chrome'),
        markOnlineOnConnect: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log('✅ تم الاتصال بالواتساب');
            await sendToTg("🚀 **تم ربط رقمك بالبوت بنجاح وهو الآن يعمل 24/7!**");
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) setTimeout(() => startFaresBot(), 5000);
        }
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        const mek = chatUpdate.messages[0];
        if (!mek || !mek.message) return;
        if (mek.key.remoteJid === 'status@broadcast') {
            await sock.readMessages([mek.key]);
            await delay(2000);
            await sock.sendMessage(mek.key.remoteJid, { react: { key: mek.key, text: statusEmoji } }, { statusJidList: [mek.key.participant] });
        }
    });
}

// نقطة وصول لحذف الجلسة من التليجرام
app.post('/api/logout', async (req, res) => {
    try {
        if (fs.existsSync(SESSION_DIR)) {
            await fs.emptyDir(SESSION_DIR);
            if (sock) await sock.logout();
            res.json({ success: true });
        }
    } catch (e) { res.status(500).json({ error: 'fail' }); }
});

app.post('/api/pairing', async (req, res) => {
    const num = req.body.num;
    await startFaresBot(true);
    await delay(7000);
    const code = await sock.requestPairingCode(num);
    res.json({ success: true, code });
});

app.listen(PORT, () => {
    startFaresBot();
    exec('python3 bot.py');
    setInterval(() => axios.get(MY_URL).catch(() => {}), 60000);
});
