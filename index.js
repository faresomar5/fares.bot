const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");

const app = express();
const port = process.env.PORT || 3000;

let socket; // جعل السوكيت متغير عام لضمان المزامنة

async function startFaresBot() {
    // استخدام اسم مجلد جديد كلياً لكسر أي تعليق
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'final_session'));
    
    socket = makeWASocket({
        auth: state,
        version: [2, 3000, 1015901307],
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: ["Ubuntu", "Chrome", "110.0.5481.177"]
    });

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') console.log("✅ متصل الآن!");
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== disconnectReason.loggedOut) startFaresBot();
        }
    });
}

startFaresBot();

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/api/pairing', async (req, res) => {
    let num = req.query.number?.replace(/[^0-9]/g, '');
    if (!num) return res.json({ error: "الرقم مطلوب" });

    try {
        await delay(2000);
        // طلب الكود من نفس السوكيت الذي يعمل في الخلفية
        const code = await socket.requestPairingCode(num);
        res.json({ status: true, pairing_code: code });
    } catch (e) {
        res.json({ error: "السيرفر مضغوط، انتظر دقيقة وحاول" });
    }
});

app.listen(port, () => console.log(`Server started on ${port}`));
