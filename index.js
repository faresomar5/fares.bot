const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs-extra'); // المكتبة الجديدة للتحكم في الجلسات

const app = express();
const port = process.env.PORT || 3000;

// مجلد تخزين الجلسات الاحترافي
const SESSION_PATH = path.join(__dirname, 'sessions');

app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "يرجى إدخال الرقم" });
    phone = phone.replace(/[^0-9]/g, '');

    // توليد معرف فريد لكل طلب (ID) لمنع تصادم البيانات
    const requestId = `session_${phone}_${Date.now()}`;
    const specificSessionPath = path.join(SESSION_PATH, requestId);

    try {
        // التأكد من نظافة المجلد قبل البدء لضمان السرعة
        await fs.ensureDir(specificSessionPath);

        const { state, saveCreds } = await useMultiFileAuthState(specificSessionPath);
        const { version } = await fetchLatestBaileysVersion();

        const socket = makeWASocket({
            auth: state,
            version: version,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            // محاكاة متصفح Safari على Mac لضمان قبول الربط في الواتساب المعدل
            browser: ["Mac OS", "Safari", "15.0"]
        });

        // مراقبة الاتصال: حل مشكلة "تعذر الربط"
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log(`✅ Success: ${phone} Connected`);
            }
            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason !== disconnectReason.connectionReplaced) {
                    await fs.remove(specificSessionPath); // تنظيف الجلسة الفاشلة فوراً
                }
            }
        });

        socket.ev.on('creds.update', saveCreds);

        // طلب الكود بعد استقرار السوكيت
        await delay(3000); 
        const code = await socket.requestPairingCode(phone);
        
        if (!res.headersSent) {
            res.json({ status: true, pairing_code: code });
        }

        // إغلاق تلقائي للجلسات المعلقة بعد دقيقتين لتوفير موارد السيرفر
        setTimeout(async () => {
            if (!socket.user) {
                socket.end();
                await fs.remove(specificSessionPath);
            }
        }, 120000);

    } catch (err) {
        console.error(err);
        await fs.remove(specificSessionPath);
        if (!res.headersSent) res.status(500).json({ error: "خطأ في الاتصال" });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`سيرفر فارس يعمل الآن بأعلى كفاءة على المنفذ ${port}`);
});
