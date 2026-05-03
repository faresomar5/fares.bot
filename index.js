const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs-extra');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

// مسار تخزين الجلسات المؤقتة
const SESSIONS_PATH = path.join(__dirname, 'all_sessions');

app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "الرجاء إدخال رقم الهاتف" });
    phone = phone.replace(/[^0-9]/g, '');

    // إنشاء معرف فريد لهذه الجلسة لمنع التداخل
    const requestId = crypto.randomBytes(8).toString('hex');
    const sessionDir = path.join(SESSIONS_PATH, requestId);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        const socket = makeWASocket({
            auth: state,
            version: version,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            // هوية متصفح حديثة لإقناع واتساب بإرسال الإشعار فوراً
            browser: ["Ubuntu", "Chrome", "121.0.6167.160"] 
        });

        // مراقبة حالة الاتصال
        socket.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                console.log(`✅ Success for ${phone}`);
                // إغلاق الجلسة وتنظيف الملفات بعد النجاح بـ 30 ثانية
                setTimeout(async () => {
                    socket.logout();
                    await fs.remove(sessionDir);
                }, 30000);
            }
        });

        socket.ev.on('creds.update', saveCreds);

        // طلب الكود
        await delay(3000);
        const code = await socket.requestPairingCode(phone);
        
        if (!res.headersSent) {
            res.json({ status: true, pairing_code: code });
        }

        // تنظيف الجلسة تلقائياً إذا لم يتم الربط خلال 2 دقيقة
        setTimeout(async () => {
            if (!socket.user) {
                socket.end();
                await fs.remove(sessionDir);
            }
        }, 120000);

    } catch (err) {
        console.error(err);
        await fs.remove(sessionDir);
        if (!res.headersSent) {
            res.status(500).json({ error: "فشل في السيرفر، حاول مجدداً" });
        }
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`الموقع العام يعمل الآن على المنفذ ${port}`);
});
