const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// مجلد عام لتخزين الجلسات المنفصلة
const SESSIONS_DIR = path.join(__dirname, 'all_sessions');
if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "الرجاء إدخال رقم الهاتف" });
    phone = phone.replace(/[^0-9]/g, '');

    // 1. سر النجاح: إنشاء مجلد فريد تماماً لكل طلب باستخدام الوقت الحالي
    // هذا يمنع تعليق "جاري تسجيل الدخول" للأبد
    const uniqueId = `session_${phone}_${Date.now()}`;
    const sessionPath = path.join(SESSIONS_DIR, uniqueId);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();

        const socket = makeWASocket({
            auth: state,
            version: version,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            // 2. محاكاة متصفح Chrome على نظام Mac لضمان قبول الربط من كل النسخ
            browser: ["Mac OS", "Chrome", "10.15.7"]
        });

        // 3. إدارة الربط (هذا ما يمنع رسالة "تعذر الربط")
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log(`✅ Linked Successfully: ${phone}`);
                // بعد النجاح، يمكنك إرسال رسالة تأكيد للمستخدم هنا
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                // إذا فشل الربط أو انتهى، نقوم بحذف المجلد لتوفير مساحة
                if (reason !== disconnectReason.connectionReplaced) {
                    if (fs.existsSync(sessionPath)) {
                        fs.rmSync(sessionPath, { recursive: true, force: true });
                    }
                }
            }
        });

        socket.ev.on('creds.update', saveCreds);

        // طلب كود الربط
        await delay(2000); 
        const code = await socket.requestPairingCode(phone);
        
        if (!res.headersSent) {
            res.json({ 
                status: true, 
                pairing_code: code 
            });
        }

        // 4. حماية السيرفر: إذا لم يربط المستخدم خلال دقيقتين، نغلق الجلسة
        setTimeout(async () => {
            if (!socket.user) {
                socket.end();
                if (fs.existsSync(sessionPath)) {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                }
            }
        }, 120000);

    } catch (err) {
        console.error("Error:", err);
        if (!res.headersSent) {
            res.status(500).json({ error: "السيرفر مشغول، حاول مرة أخرى" });
        }
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`سيرفر فارس العام يعمل الآن على المنفذ ${port}`);
});
