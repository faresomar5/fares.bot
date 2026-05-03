const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

const SESSION_ROOT = path.join(__dirname, 'sessions');

app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "أدخل الرقم أولاً" });
    phone = phone.replace(/[^0-9]/g, '');

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
            // تعديل الهوية إلى متصفح قديم قليلاً أو مستقر (Firefox على Linux) 
            // هذا التعديل يقلل من شك نظام الحماية في واتساب
            browser: ["Linux", "Firefox", "110.0"] 
        });

        socket.ev.on('creds.update', saveCreds);

        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log(`✅ تم الربط بنجاح: ${phone}`);
                // إرسال رسالة فورية لتثبيت الاتصال
                await socket.sendMessage(socket.user.id, { text: "تم ربط نظام فارس بنجاح 🚀" });
                
                setTimeout(async () => {
                    socket.end();
                    await fs.remove(sessionDir);
                }, 30000);
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                // إذا تم رفض الربط، نمسح الملفات لنبدأ بداية نظيفة في المحاولة القادمة
                if (reason !== disconnectReason.connectionReplaced) {
                    await fs.remove(sessionDir);
                }
            }
        });

        // زيادة التأخير الزمني قليلاً (3 ثوانٍ) لضمان استقرار الاتصال قبل طلب الكود
        await delay(3000); 
        const code = await socket.requestPairingCode(phone);
        
        if (!res.headersSent) {
            res.json({ 
                status: true, 
                pairing_code: code 
            });
        }

        setTimeout(async () => {
            if (!socket.user) {
                socket.end();
                await fs.remove(sessionDir);
            }
        }, 120000);

    } catch (err) {
        await fs.remove(sessionDir);
        if (!res.headersSent) res.status(500).json({ error: "فشل السيرفر" });
    }
});

app.get('/', (req, res) => { res.send("Fares-Bot API is active"); });

app.listen(port, () => { console.log(`Server live on ${port}`); });
