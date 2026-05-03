const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

// مجلد الجلسات الرئيسي - تم التأكد من استقلاليته
const SESSION_ROOT = path.join(__dirname, 'sessions');

app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "يرجى إدخال رقم الهاتف" });
    phone = phone.replace(/[^0-9]/g, '');

    // إنشاء معرف فريد (UUID) يمنع تداخل الجلسات وتعليق "جاري تسجيل الدخول"
    const sessionId = `session_${phone}_${uuidv4()}`;
    const sessionDir = path.join(SESSION_ROOT, sessionId);

    try {
        await fs.ensureDir(sessionDir);
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        const socket = makeWASocket({
            auth: state,
            version: version,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            // تم التأكد من هوية المتصفح لتعمل على كل نسخ واتساب
            browser: ["Mac OS", "Chrome", "110.0.5481.177"]
        });

        socket.ev.on('creds.update', saveCreds);

        // مراقبة الاتصال لحل مشكلة "تعذر الربط"
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log(`✅ Success: ${phone}`);
                // رسالة تأكيد للمستخدم
                await socket.sendMessage(socket.user.id, { text: "✅ تم ربط البوت بنجاح في منصة فارس!" });
                
                // تنظيف آلي للجلسة بعد النجاح بـ 30 ثانية لتوفير موارد السيرفر
                setTimeout(async () => {
                    socket.end();
                    await fs.remove(sessionDir);
                }, 30000);
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason !== disconnectReason.connectionReplaced) {
                    await fs.remove(sessionDir); // تنظيف الجلسات الفاشلة
                }
            }
        });

        // طلب كود الربط
        await delay(2000); 
        const code = await socket.requestPairingCode(phone);
        
        if (!res.headersSent) {
            res.json({ status: true, pairing_code: code });
        }

        // إغلاق الجلسة إذا لم يتم الربط خلال دقيقتين (Timeout)
        setTimeout(async () => {
            if (!socket.user) {
                socket.end();
                await fs.remove(sessionDir);
            }
        }, 120000);

    } catch (err) {
        console.error(err);
        await fs.remove(sessionDir);
        if (!res.headersSent) res.status(500).json({ error: "فشل في السيرفر، حاول مجدداً" });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Server Fares-Bot is running on port ${port}`);
});
