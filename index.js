const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// مجلد أساسي لحفظ الجلسات المنفصلة
const SESSIONS_FOLDER = path.join(__dirname, 'all_sessions');
if (!fs.existsSync(SESSIONS_FOLDER)) {
    fs.mkdirSync(SESSIONS_FOLDER);
}

app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "يرجى إدخال رقم الهاتف" });

    // تنظيف الرقم
    phone = phone.replace(/[^0-9]/g, '');

    // توليد معرف فريد لهذه الجلسة لمنع التداخل والتعليق
    const uniqueSessionId = `${phone}_${Date.now()}`;
    const sessionPath = path.join(SESSIONS_FOLDER, uniqueSessionId);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();

        const socket = makeWASocket({
            auth: state,
            version: version,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            // استخدام هوية متصفح "Ubuntu" لأنها الأكثر استقراراً في سيرفرات Render
            browser: ["Ubuntu", "Chrome", "110.0.5481.177"]
        });

        // إدارة حالة الاتصال لضمان تسجيل الدخول بنجاح
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log(`✅ تم الربط بنجاق للرقم: ${phone}`);
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason !== disconnectReason.loggedOut) {
                    // إعادة محاولة الاتصال إذا لم يكن العطل بسبب تسجيل الخروج
                } else {
                    // تنظيف ملفات الجلسة إذا تم تسجيل الخروج
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                }
            }
        });

        socket.ev.on('creds.update', saveCreds);

        // طلب كود الاقتران مباشرة لضمان عدم حدوث تعارض "الرقم مربوط مسبقاً"
        await delay(3000); 
        const code = await socket.requestPairingCode(phone);
        
        if (!res.headersSent) {
            res.json({ 
                status: true, 
                pairing_code: code 
            });
        }

        // تنظيف تلقائي للجلسات غير المكتملة بعد 5 دقائق لتوفير مساحة السيرفر
        setTimeout(() => {
            if (!socket.user) {
                socket.end();
                if (fs.existsSync(sessionPath)) {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                }
            }
        }, 300000);

    } catch (err) {
        console.error("Pairing Error:", err);
        if (!res.headersSent) {
            res.status(500).json({ error: "فشل في السيرفر، حاول مجدداً" });
        }
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`سيرفر فارس العام يعمل بنجاح على المنفذ ${port}`);
});
