const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

const SESSION_ROOT = path.join(__dirname, 'sessions');

// وظيفة الربط العامة
app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    let type = req.query.type || 'code'; // افتراضيًا الكود السريع، أو 'qr' للرمز
    
    if (!phone && type === 'code') return res.json({ error: "يرجى إدخال الرقم للكود السريع" });
    if (phone) phone = phone.replace(/[^0-9]/g, '');

    const sessionId = `fares_${uuidv4()}`;
    const sessionDir = path.join(SESSION_ROOT, sessionId);

    try {
        await fs.ensureDir(sessionDir);
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        const socket = makeWASocket({
            auth: state,
            version: version,
            logger: pino({ level: "silent" }),
            // هوية متصفح "شاملة" لتقليل الحظر الجغرافي وتخطي شاشة أمريكا
            browser: ["Fares-Bot", "Chrome", "121.0.0.0"] 
        });

        socket.ev.on('creds.update', saveCreds);

        // التعامل مع QR Code إذا طلب المستخدم
        if (type === 'qr') {
            socket.ev.on('connection.update', (update) => {
                const { qr } = update;
                if (qr && !res.headersSent) {
                    res.json({ status: true, qr_code: qr, message: "قم بمسح الكود ضوئياً" });
                }
            });
        }

        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log(`✅ تم الربط بنجاح`);
                await socket.sendMessage(socket.user.id, { text: "✅ تم تفعيل منصة فارس العامة بنجاح!" });
                setTimeout(async () => {
                    socket.end();
                    await fs.remove(sessionDir);
                }, 20000);
            }
            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason !== disconnectReason.connectionReplaced) {
                    await fs.remove(sessionDir);
                }
            }
        });

        // طلب الكود السريع (Pairing Code)
        if (type === 'code') {
            await delay(3000); 
            const code = await socket.requestPairingCode(phone);
            if (!res.headersSent) {
                res.json({ status: true, pairing_code: code });
            }
        }

        // تنظيف تلقائي
        setTimeout(async () => {
            if (!socket.user) {
                socket.end();
                await fs.remove(sessionDir);
            }
        }, 150000);

    } catch (err) {
        await fs.remove(sessionDir);
        if (!res.headersSent) res.status(500).json({ error: "حدث خطأ في السيرفر العام" });
    }
});

app.get('/', (req, res) => {
    res.send("<h1>Fares-Bot Global System</h1><p>API is Ready for Pairing Code & QR</p>");
});

app.listen(port, () => {
    console.log(`Global System live on port ${port}`);
});
