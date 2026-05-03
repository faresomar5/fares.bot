const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const crypto = require("crypto");

const app = express();
const port = process.env.PORT || 3000;
const sessionPassword = crypto.randomBytes(3).toString('hex').toUpperCase();

async function startFaresBot() {
    // استخدام مجلد جلسة جديد لضمان تخطي تعليق تسجيل الدخول
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'fares_session'));
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
        auth: state,
        version: version,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        // هوية متصفح حديثة لضمان وصول الإشعار فوراً
        browser: ["Ubuntu", "Chrome", "110.0.5481.177"]
    });

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
            console.log("✅ تم تسجيل الدخول بنجاح!");
            const myNumber = socket.user.id.split(':')[0] + "@s.whatsapp.net";
            const welcomeMsg = `👑 *سيرفر فارس يعمل الآن* 👑\n🔐 كلمة السر: *${sessionPassword}*`;
            await delay(5000);
            await socket.sendMessage(myNumber, { text: welcomeMsg });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== disconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
        }
    });

    return socket;
}

// بدء تشغيل البوت في الخلفية ليكون مستعداً للربط
let mainSocket = startFaresBot();

app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "يرجى إدخال رقم الهاتف" });
    phone = phone.replace(/[^0-9]/g, '');

    try {
        const { state } = await useMultiFileAuthState(path.join(__dirname, 'fares_session'));
        const tempSocket = makeWASocket({
            auth: state,
            logger: pino({ level: "silent" }),
            browser: ["Ubuntu", "Chrome", "110.0.5481.177"]
        });

        await delay(3000);
        const code = await tempSocket.requestPairingCode(phone);
        
        if (!res.headersSent) {
            res.json({ status: true, pairing_code: code });
        }
    } catch (err) {
        res.status(500).json({ error: "خطأ في توليد الكود" });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`السيرفر يعمل على المنفذ ${port}`);
});
