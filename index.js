const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs-extra');

const app = express();
const port = process.env.PORT || 3000;

// مجلد الجلسات الرئيسي
const SESSIONS_DIR = path.join(__dirname, 'temp_sessions');

app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "أدخل الرقم أولاً" });
    phone = phone.replace(/[^0-9]/g, '');

    // توليد معرف فريد جداً لكل طلب (هذا هو سر السرعة)
    const requestId = `session_${phone}_${Math.random().toString(36).substring(7)}`;
    const sessionPath = path.join(SESSIONS_DIR, requestId);

    try {
        await fs.ensureDir(sessionPath);
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();

        const socket = makeWASocket({
            auth: state,
            version: version,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            // هوية متصفح عالمية تضمن الربط مع كافة النسخ (الرسمي والمعدل)
            browser: ["Mac OS", "Chrome", "110.0.5481.177"] 
        });

        // مراقبة حالة الاتصال - لحل مشكلة "تعذر الربط"
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log(`✅ تم الربط بنجاح: ${phone}`);
                // إرسال رسالة ترحيبية فورية للمستخدم لإعلامه بالنجاح
                await socket.sendMessage(socket.user.id, { text: "🎉 تم ربط حسابك بنجاح في منصة فارس!" });
                
                // تنظيف الجلسة من السيرفر بعد الربط بـ 10 ثوانٍ لتوفير المساحة
                setTimeout(async () => {
                    socket.logout();
                    await fs.remove(sessionPath);
                }, 10000);
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason !== disconnectReason.connectionReplaced) {
                    await fs.remove(sessionPath);
                }
            }
        });

        socket.ev.on('creds.update', saveCreds);

        // طلب كود الربط
        await delay(2500); 
        const code = await socket.requestPairingCode(phone);
        
        if (!res.headersSent) {
            res.json({ status: true, pairing_code: code });
        }

        // إغلاق الجلسة إذا لم يتم الربط خلال دقيقتين
        setTimeout(async () => {
            if (!socket.user) {
                socket.end();
                await fs.remove(sessionPath);
            }
        }, 120000);

    } catch (err) {
        console.error(err);
        await fs.remove(sessionPath);
        if (!res.headersSent) res.status(500).json({ error: "فشل، حاول مرة أخرى" });
    }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

app.listen(port, () => {
    console.log(`سيرفر فارس العام يعمل بنجاح على المنفذ ${port}`);
});
