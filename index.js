const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const crypto = require("crypto");
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// مجلد مؤقت للجلسات لضمان عدم التداخل
const sessionsDir = path.join(__dirname, 'temp_sessions');
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir);

app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number?.replace(/[^0-9]/g, '');
    if (!phone) return res.json({ error: "الرجاء إدخال رقم الهاتف" });

    // إنشاء معرف فريد لهذه العملية لمنع التداخل بين المستخدمين
    const requestId = crypto.randomBytes(4).toString('hex');
    const userSessionPath = path.join(sessionsDir, `session_${requestId}`);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(userSessionPath);
        const { version } = await fetchLatestBaileysVersion();

        const socket = makeWASocket({
            auth: state,
            version: version,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            // هوية متصفح حديثة جداً لضمان تخطي حجب الإشعارات
            browser: ["Ubuntu", "Chrome", "121.0.6167.160"] 
        });

        // طلب الكود
        await delay(3000);
        const code = await socket.requestPairingCode(phone);
        
        // إرسال الكود للمستخدم
        res.json({ 
            status: true, 
            pairing_code: code,
            id: requestId 
        });

        // مراقبة حالة الاتصال - إذا نجح الربط يتم مسح الملفات المؤقتة
        socket.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                console.log(`✅ Success pairing for: ${phone}`);
                // هنا يمكنك إضافة كود لإرسال رسالة ترحيب للمستخدم
                await delay(10000);
                socket.logout(); // إغلاق الجلسة من جانب السيرفر ليبقى متاحاً للآخرين
            }
        });

        socket.ev.on('creds.update', saveCreds);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "السيرفر مضغوط، حاول مجدداً" });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Platform Live on port ${port}`);
});
