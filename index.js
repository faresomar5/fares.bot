const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");

const app = express();
const port = process.env.PORT || 3000;

// دالة تشغيل السيرفر الأساسي لمعالجة الربط
async function startFaresBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session');
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
            console.log("✅ اكتمل تسجيل الدخول بنجاح!");
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== disconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
        }
    });

    return socket;
}

// تشغيل المحرك
let mainSocket = startFaresBot();

app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "يرجى إدخال رقم الهاتف" });
    phone = phone.replace(/[^0-9]/g, '');

    try {
        const { state } = await useMultiFileAuthState('session');
        const tempSocket = makeWASocket({
            auth: state,
            logger: pino({ level: "silent" }),
            browser: ["Mac OS", "Chrome", "10.15.7"]
        });

        if (!tempSocket.authState.creds.registered) {
            await delay(2500); // تأخير لضمان استقرار الطلب
            const code = await tempSocket.requestPairingCode(phone);
            if (!res.headersSent) {
                res.json({ status: true, pairing_code: code });
            }
        } else {
            res.json({ status: false, message: "مرتبط بالفعل" });
        }
    } catch (err) {
        res.status(500).json({ error: "خطأ في السيرفر" });
    }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

app.listen(port, () => { console.log(`سيرفر فارس يعمل على المنفذ ${port}`); });
