require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, delay } = require('@whiskeysockets/baileys');
const express = require('express');
const axios = require('axios');
const fs = require('fs-extra');
const { exec } = require('child_process');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SESSION_DIR = './session';
const MY_ID = "7231690686"; // الآيدي الجديد الخاص بك
const TG_TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I";

let sock;
let statusEmoji = '👑'; 

async function sendToTg(text) {
    try {
        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            chat_id: MY_ID,
            text: text,
            parse_mode: "Markdown"
        });
    } catch (e) { console.log("خطأ في إرسال الإشعار"); }
}

async function startFaresBot(clear = false) {
    if (clear && fs.existsSync(SESSION_DIR)) { await fs.emptyDir(SESSION_DIR); }
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    sock = makeWASocket({
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false,
        markOnlineOnConnect: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            await sendToTg("✅ **تم ربط رقمك بنجاح! البوت شغال الآن.**");
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
        }
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        const mek = chatUpdate.messages[0];
        if (mek?.key?.remoteJid === 'status@broadcast') {
            await sock.readMessages([mek.key]);
            await delay(3000);
            await sock.sendMessage(mek.key.remoteJid, { react: { key: mek.key, text: statusEmoji } }, { statusJidList: [mek.key.participant] });
        }
    });
}

app.get('/', (req, res) => res.send('Active'));
app.post('/api/logout', async (req, res) => {
    await fs.emptyDir(SESSION_DIR);
    if (sock) await sock.logout();
    res.json({ success: true });
});
app.post('/api/pairing', async (req, res) => {
    await startFaresBot(true);
    await delay(10000); // وقت كافٍ لتجهيز السيرفر
    const code = await sock.requestPairingCode(req.body.num);
    res.json({ success: true, code });
});

app.listen(PORT, () => {
    startFaresBot();
    exec('python3 bot.py');
});
