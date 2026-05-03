const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const crypto = require("crypto");

const app = express();
const port = process.env.PORT || 3000;
const sessionPassword = crypto.randomBytes(3).toString('hex').toUpperCase();

// وظيفة تشغيل البوت الأساسية
async function startFaresBot() {
    // استخدام اسم المجلد الجديد لكسر وهم "الرقم مربوط مسبقاً"
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'Fares_final_session'));
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
        auth: state,
        version: version,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        // الهوية التي أثبتت نجاحها في إرسال الإشعارات سابقاً
        browser: ["Mac OS", "Chrome", "10.15.7"]
    });

    socket.ev.on('creds.update', saveCreds);

    // معالج الحالة لحل مشكلة التعليق عند تسجيل الدخول
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log("✅ تم الاتصال بنجاح!");
            const myNumber = socket.user.id.split(':')[0] + "@s.whatsapp.net";
            await delay(5000);
            await socket.sendMessage(myNumber, { text: `👑 *سيرفر فارس متصل*\n🔐 كلمة السر: ${sessionPassword}` });
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== disconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
        }
    });

    return socket;
}

// تشغيل المحرك عند بدء السيرفر
startFaresBot();

// API طلب كود الاقتران
app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number?.replace(/[^0-9]/g, '');
    if (!phone) return res.json({ error: "الرقم مطلوب" });

    try {
        // الربط بنفس مجلد الجلسة الجديد
        const { state } = await useMultiFileAuthState(path.join(__dirname, 'Fares_final_session'));
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
        res.status(500).json({ error: "فشل في طلب الكود، يرجى المحاولة بعد قليل" });
    }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

app.listen(port, () => {
    console.log(`Server Online. Password: ${sessionPassword}`);
});
