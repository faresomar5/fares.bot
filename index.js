const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// مجلد لتخزين الجلسات المنفصلة لضمان السرعة ومنع التعليق
const SESSIONS_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR);

app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "يرجى إدخال رقم الهاتف" });

    phone = phone.replace(/[^0-9]/g, '');

    // الحل الجذري: إنشاء مسار فريد لكل رقم لمنع تداخل البيانات
    const userSessionPath = path.join(SESSIONS_DIR, `session_${phone}`);

    try {
        // حذف أي بقايا جلسة قديمة للرقم لضمان تسجيل دخول سريع بنسبة 100%
        if (fs.existsSync(userSessionPath)) {
            fs.rmSync(userSessionPath, { recursive: true, force: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(userSessionPath);
        const { version } = await fetchLatestBaileysVersion();

        const socket = makeWASocket({
            auth: state,
            version: version,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            // هوية متصفح Ubuntu هي الأفضل لتخطي تعليق "جاري تسجيل الدخول" في Render
            browser: ["Ubuntu", "Chrome", "110.0.5481.177"]
        });

        // هذا الجزء هو المسؤول عن إتمام عملية الربط فور إدخال الكود في هاتفك
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log(`✅ تم الربط بنجاح للرقم: ${phone}`);
                // يمكنك هنا إرسال رسالة ترحيبية للمستخدم عبر واتساب
            }
            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason === disconnectReason.loggedOut) {
                    fs.rmSync(userSessionPath, { recursive: true, force: true });
                }
            }
        });

        socket.ev.on('creds.update', saveCreds);

        // طلب الكود مباشرة لضمان عدم توقف الخدمة لأي مستخدم آخر
        await delay(3000); 
        const code = await socket.requestPairingCode(phone);
        
        if (!res.headersSent) {
            res.json({ status: true, pairing_code: code });
        }

        // إبقاء الجلسة نشطة لمدة دقيقتين فقط بانتظار إدخال الكود
        setTimeout(() => {
            if (!socket.user) {
                socket.end();
                if (fs.existsSync(userSessionPath)) {
                    fs.rmSync(userSessionPath, { recursive: true, force: true });
                }
            }
        }, 120000);

    } catch (err) {
        console.error("Pairing Error:", err);
        if (!res.headersSent) res.status(500).json({ error: "فشل، حاول مجدداً" });
    }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

app.listen(port, () => {
    console.log(`سيرفر فارس يعمل بنظام الجلسات المنفصلة على المنفذ ${port}`);
});
