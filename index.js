const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs-extra');

const app = express();
const port = process.env.PORT || 3000;

// مجلد لتخزين كافة الجلسات المنفردة
const SESSIONS_DIR = path.join(__dirname, 'sessions');

app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "يرجى إدخال الرقم" });
    phone = phone.replace(/[^0-9]/g, '');

    // إنشاء مسار جلسة فريد لهذا الرقم لمنع التداخل
    const userSession = path.join(SESSIONS_DIR, phone);

    try {
        // مسح أي محاولة سابقة فاشلة لنفس الرقم لضمان جلسة نظيفة
        if (fs.existsSync(userSession)) {
            await fs.remove(userSession);
        }

        const { state, saveCreds } = await useMultiFileAuthState(userSession);
        const { version } = await fetchLatestBaileysVersion();

        const socket = makeWASocket({
            auth: state,
            version: version,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            // هوية متصفح حديثة تمنع تعليق "جاري تسجيل الدخول"
            browser: ["Ubuntu", "Chrome", "110.0.5481.177"]
        });

        socket.ev.on('creds.update', saveCreds);

        // مراقبة حالة الاتصال - هذا الجزء هو الذي ينهي "جاري تسجيل الدخول" بنجاح
        socket.ev.on('connection.update', (update) => {
            const { connection } = update;
            if (connection === 'open') {
                console.log(`✅ تم الربط بنجاح للرقم: ${phone}`);
            }
        });

        // طلب الكود
        await delay(3000); 
        const code = await socket.requestPairingCode(phone);
        
        if (!res.headersSent) {
            res.json({ status: true, pairing_code: code });
        }

        // إبقاء الجلسة نشطة لمدة دقيقتين للسماح لك بإدخال الكود
        setTimeout(() => {
            if (!socket.user) {
                socket.end();
                console.log(`Timeout for ${phone}`);
            }
        }, 120000);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "حدث خطأ، حاول مجدداً" });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`سيرفر فارس العام يعمل على المنفذ ${port}`);
});
