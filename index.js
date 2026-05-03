const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");

const app = express();
const port = process.env.PORT || 3000;

async function startFaresBot() {
    // استخدام اسم مجلد جديد تماماً لكسر أي حظر IP أو جلسة معلقة
    const { state, saveCreds } = await useMultiFileAuthState('fares_final_session');
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
        auth: state,
        version: version,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        // الهوية التي نجحت معك سابقاً في إرسال الإشعار
        browser: ["Mac OS", "Chrome", "10.15.7"]
    });

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log("✅ اكتمل الربط! السيرفر يعمل الآن.");
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== disconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
        }
    });

    return socket;
}

let mainSocket = startFaresBot();

app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number?.replace(/[^0-9]/g, '');
    if (!phone) return res.json({ error: "الرقم مطلوب" });

    try {
        const { state } = await useMultiFileAuthState('fares_final_session');
        const tempSocket = makeWASocket({
            auth: state,
            logger: pino({ level: "silent" }),
            browser: ["Mac OS", "Chrome", "10.15.7"]
        });

        await delay(3000); 
        const code = await tempSocket.requestPairingCode(phone);
        if (!res.headersSent) {
            res.json({ status: true, pairing_code: code });
        }
    } catch (err) {
        res.status(500).json({ error: "حاول مرة أخرى" });
    }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.listen(port, () => { console.log(`Online on ${port}`); });
