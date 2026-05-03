const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const crypto = require("crypto");

const app = express();
const port = process.env.PORT || 3000;
const sessionPassword = crypto.randomBytes(3).toString('hex').toUpperCase();

async function startFaresBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session');
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
        auth: state,
        version: version,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: ["Mac OS", "Chrome", "120.0.0.0"] // هوية حديثة وموثوقة
    });

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            const myNumber = socket.user.id.split(':')[0] + "@s.whatsapp.net";
            const welcomeMsg = `👑 *سيرفر فارس يعمل بنجاح* 👑\n\n🔐 كلمة السر: *${sessionPassword}*\n⚙️ الإعدادات: https://fares-bot-eahg.onrender.com/settings`;
            await delay(3000);
            await socket.sendMessage(myNumber, { text: welcomeMsg });
        }
    });

    // التفاعل التلقائي مع الحالات
    socket.ev.on('messages.upsert', async (chatUpdate) => {
        const msg = chatUpdate.messages[0];
        if (msg.message && msg.key.remoteJid === 'status@broadcast') {
            await socket.sendMessage('status@broadcast', { react: { text: '❤️', key: msg.key } }, { statusJidList: [msg.key.participant] });
        }
    });

    return socket;
}

startFaresBot();

app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number.replace(/[^0-9]/g, '');
    const tempSocket = await startFaresBot();
    await delay(2000);
    const code = await tempSocket.requestPairingCode(phone);
    res.json({ status: true, pairing_code: code });
});

app.get('/settings', (req, res) => { res.sendFile(path.join(__dirname, 'settings.html')); });
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

app.listen(port, () => { console.log(`Server is Live! PW: ${sessionPassword}`); });
