const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

// مجلد الجلسات المتطايرة (مثل المنصات الكبيرة)
const SESSION_ROOT = path.join(__dirname, 'temp_sessions');

app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "يرجى إضافة الرقم بعد رابط الـ API" });
    phone = phone.replace(/[^0-9]/g, '');

    // توليد معرف فريد لكل طلب لضمان عدم تعليق "جاري تسجيل الدخول"
    const sessionId = `fares_${phone}_${uuidv4()}`;
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
            // هوية متصفح عالمية لتخطي حظر السيرفرات
            browser: ["Ubuntu", "Chrome", "110.0.5481.177"]
        });

        socket.ev.on('creds.update', saveCreds);

        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log(`✅ تم الربط بنجاح للرقم: ${phone}`);
                // إرسال رسالة نجاح للمستخدم
                await socket.sendMessage(socket.user.id, { text: "✅ تم ربط البوت بنجاح!" });
                
                // مسح الجلسة بعد النجاح بـ 15 ثانية لتوفير المساحة
                setTimeout(async () => {
                    socket.end();
                    await fs.remove(sessionDir);
                }, 15000);
            }
            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason !== disconnectReason.connectionReplaced) {
                    await fs.remove(sessionDir);
                }
            }
        });

        // طلب كود الاقتران من واتساب (هذا هو جوهر الـ API)
        await delay(2000); 
        const code = await socket.requestPairingCode(phone);
        
        // إرسال النتيجة بنفس تنسيق المواقع الكبيرة
        if (!res.headersSent) {
            res.json({ 
                status: true, 
                author: "Fares Al-Tamimi",
                pairing_code: code 
            });
        }

        // إغلاق الطلب تلقائياً بعد دقيقتين إذا لم يربط المستخدم
        setTimeout(async () => {
            if (!socket.user) {
                socket.end();
                await fs.remove(sessionDir);
            }
        }, 120000);

    } catch (err) {
        await fs.remove(sessionDir);
        if (!res.headersSent) res.status(500).json({ error: "فشل في إنشاء الكود" });
    }
});

// صفحة ترحيب بسيطة
app.get('/', (req, res) => {
    res.send("Fares-Bot API is Running! Use /api/pairing?number=YOUR_NUMBER");
});

app.listen(port, () => {
    console.log(`API is live on port ${port}`);
});
