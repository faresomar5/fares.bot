const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// مجلد الجلسات العام
const SESSIONS_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "يرجى إدخال رقم الهاتف" });
    phone = phone.replace(/[^0-9]/g, '');

    // 1. الحل الجذري: إنشاء مجلد فريد لكل رقم هاتف لمنع تداخل الجلسات
    const userSessionPath = path.join(SESSIONS_DIR, `session_${phone}`);

    // 2. تنظيف الجلسة القديمة فوراً لضمان عدم ظهور "الرقم مربوط مسبقاً" أو التعليق
    if (fs.existsSync(userSessionPath)) {
        fs.rmSync(userSessionPath, { recursive: true, force: true });
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState(userSessionPath);
        const { version } = await fetchLatestBaileysVersion();

        const socket = makeWASocket({
            auth: state,
            version: version,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            // 3. هوية متصفح مستقرة جداً لتخطي حماية واتساب ومنع "تعذر الربط"
            browser: ["Ubuntu", "Chrome", "110.0.5481.177"]
        });

        // 4. إدارة الاتصال لضمان الانتقال من "جاري تسجيل الدخول" إلى "تم الربط"
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log(`✅ Success: ${phone} is now linked.`);
            }
            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason === disconnectReason.loggedOut) {
                    fs.rmSync(userSessionPath, { recursive: true, force: true });
                }
            }
        });

        socket.ev.on('creds.update', saveCreds);

        // طلب الكود لمرة واحدة فقط وبجلسة نظيفة
        await delay(3000); 
        const code = await socket.requestPairingCode(phone);
        
        if (!res.headersSent) {
            res.json({ status: true, pairing_code: code });
        }

        // إغلاق الجلسة إذا لم يتم الربط خلال دقيقتين لتوفير موارد السيرفر
        setTimeout(() => {
            if (!socket.user) {
                socket.end();
                if (fs.existsSync(userSessionPath)) {
                    fs.rmSync(userSessionPath, { recursive: true, force: true });
                }
            }
        }, 120000);

    } catch (err) {
        console.error("Error:", err);
        if (!res.headersSent) res.status(500).json({ error: "فشل السيرفر، جرب مرة أخرى" });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Server is running on port ${port} - Public Mode Active`);
});
