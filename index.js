const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const crypto = require("crypto");

const app = express();
const port = process.env.PORT || 3000;
const sessionPassword = crypto.randomBytes(3).toString('hex').toUpperCase();

async function startFaresBot() {
    // استخدام اسم مجلد جديد يمسح أي أثر للربط القديم الموهم
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'Fares_final_session'));
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
        auth: state,
        version: version,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        // تغيير الهوية لـ Ubuntu يسهل وصول الإشعارات في سيرفرات Render
        browser: ["Ubuntu", "Chrome", "110.0.5481.177"]
    });

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log("✅ Connected Successfully!");
            const myNumber = socket.user.id.split(':')[0] + "@s.whatsapp.net";
            await delay(5000);
            await socket.sendMessage(myNumber, { text: `👑 سيرفر فارس متصل\n🔐 كلمة السر: ${sessionPassword}` });
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== disconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
        }
    });

    return socket;
}

startFaresBot();

app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number?.replace(/[^0-9]/g, '');
    if (!phone) return res.json({ error: "الرقم مطلوب" });

    try {
        const { state } = await useMultiFileAuthState(path.join(__dirname, 'Fares_final_session'));
        const temp = makeWASocket({
            auth: state,
            logger: pino({ level: "silent" }),
            browser: ["Ubuntu", "Chrome", "110.0.5481.177"]
        });

        await delay(3500); // زيادة وقت الانتظار قليلاً لضمان المزامنة
        const code = await temp.requestPairingCode(phone);
        res.json({ status: true, pairing_code: code });
    } catch (err) {
        res.status(500).json({ error: "فشل، جرب مرة أخرى" });
    }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.listen(port, () => { console.log(`Server Online. Password: ${sessionPassword}`); });
