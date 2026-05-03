const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const crypto = require("crypto");

const app = express();
const port = process.env.PORT || 3000;
const sessionPassword = crypto.randomBytes(3).toString('hex').toUpperCase();

async function startFaresBot() {
    // استخدمنا اسم مجلد جديد تماماً لضمان النظافة
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'fares_auth'));
    
    const socket = makeWASocket({
        auth: state,
        printQRInTerminal: true, // سيظهر الكود في سجلات Render أيضاً
        logger: pino({ level: "error" }), // تقليل السجلات لزيادة الاستقرار
        browser: ["Windows", "Chrome", "110.0.0.0"]
    });

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log("✅ CONNECTED");
            const myNumber = socket.user.id.split(':')[0] + "@s.whatsapp.net";
            await delay(5000);
            await socket.sendMessage(myNumber, { text: `👑 سيرفر فارس متصل\n🔐 كلمة السر: ${sessionPassword}` });
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== disconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
        }
    });

    return socket;
}

startFaresBot();

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/settings', (req, res) => res.sendFile(path.join(__dirname, 'settings.html')));
app.get('/api/pairing', async (req, res) => {
    let num = req.query.number?.replace(/[^0-9]/g, '');
    try {
        const { state } = await useMultiFileAuthState(path.join(__dirname, 'fares_auth'));
        const temp = makeWASocket({ auth: state, logger: pino({ level: "error" }), browser: ["Windows", "Chrome", "110.0.0.0"] });
        await delay(3000);
        const code = await temp.requestPairingCode(num);
        res.json({ status: true, pairing_code: code });
    } catch (e) { res.json({ error: "خطأ في الاتصال" }); }
});

app.listen(port, () => console.log(`Server Online: ${port}`));
