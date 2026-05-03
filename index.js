const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

// مجلد لتخزين الجلسات المؤقتة
const SESSION_ROOT = path.join(__dirname, 'sessions');

app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "أدخل رقم الهاتف أولاً" });
    phone = phone.replace(/[^0-9]/g, '');

    // إنشاء معرف فريد لكل طلب لضمان استقلالية الجلسة وعدم التعليق
    const sessionId = `${phone}_${uuidv4()}`;
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
            // هوية متصفح Mac OS Chrome - وهي الأكثر استقراراً للربط الفوري
            browser: ["Mac OS", "Chrome", "110.0.5481.177"]
        });

        // إدارة أحداث الاتصال لإتمام الربط فوراً
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log(`✅ Success for ${phone}`);
                // إرسال رسالة نجاح للمستخدم فوراً
                await socket.sendMessage(socket.user.id, { text: "✅ تم ربط جهازك بنجاح في نظام فارس!" });
                
                // تنظيف السيرفر: حذف ملفات الجلسة بعد النجاح بـ 20 ثانية لتوفير المساحة
                setTimeout(async () => {
                    socket.logout();
                    await fs.remove(sessionDir);
                }, 20000);
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason === disconnectReason.loggedOut) {
                    await fs.remove(sessionDir);
                }
            }
        });

        socket.ev.on('creds.update', saveCreds);

        // طلب كود الاقتران
        await delay(2000); 
        const code = await socket.requestPairingCode(phone);
        
        if (!res.headersSent) {
            res.json({ 
                status: true, 
                pairing_code: code 
            });
        }

        // إغلاق الجلسة وتنظيفها إذا لم يتم الربط خلال دقيقتين
        setTimeout(async () => {
            if (!socket.user) {
                socket.end();
                await fs.remove(sessionDir);
            }
        }, 120000);

    } catch (err) {
        console.error(err);
        await fs.remove(sessionDir);
        if (!res.headersSent) res.status(500).json({ error: "تعذر بدء الجلسة" });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Professional Pairing API is live on port ${port}`);
});
