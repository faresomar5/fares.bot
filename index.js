const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// التأكد من وجود مجلد للجلسات
const sessionsDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir);
}

// 1. نظام توليد كود الاقتران (API) العام
app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "يرجى إدخال رقم الهاتف" });

    phone = phone.replace(/[^0-9]/g, '');

    // الحل: إنشاء مسار جلسة فريد لكل رقم هاتف لضمان عدم التداخل
    const sessionPath = path.join(sessionsDir, `session_${phone}`);

    try {
        // تعريف حالة مستقلة لكل مستخدم بناءً على رقمه
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();

        const socket = makeWASocket({
            auth: state,
            version: version,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            // استخدام هوية متصفح حديثة لضمان استقرار الاتصال
            browser: ["Ubuntu", "Chrome", "110.0.5481.177"]
        });

        // مراقبة حالة الاتصال لضمان تسجيل الدخول بنجاح
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log(`✅ تم تسجيل دخول الرقم: ${phone} بنجاح`);
            }
        });

        socket.ev.on('creds.update', saveCreds);

        // طلب الكود مباشرة (بدون شرط التفتيش القديم الذي كان يسبب "مربوط مسبقاً")
        await delay(3000); 
        const code = await socket.requestPairingCode(phone);
        
        if (!res.headersSent) {
            res.json({ 
                status: true, 
                pairing_code: code 
            });
        }

    } catch (err) {
        console.error("Error in Pairing:", err);
        if (!res.headersSent) {
            res.status(500).json({ error: "خطأ في السيرفر", details: err.message });
        }
    }
});

// 2. واجهة الموقع
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 3. تشغيل السيرفر
app.listen(port, () => {
    console.log(`السيرفر العام يعمل الآن بنجاح على المنفذ ${port}`);
});
