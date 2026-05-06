const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require('pino');
const express = require('express');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.static('public'));
app.use(express.json());

app.get('/get-pairing', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: 'Number missing' });

    // مسح الجلسات القديمة لضمان عدم حدوث تضارب
    if (fs.existsSync('./auth_info')) {
        fs.rmSync('./auth_info', { recursive: true, force: true });
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            auth: state,
            version,
            logger: pino({ level: 'silent' }),
            // تعديل هوية المتصفح لضمان وصول الإشعار وقبول الكود
            browser: ["Chrome (Linux)", "Chrome", "110.0.5481.177"] 
        });

        await delay(3000); // وقت مستقطع للتهيئة

        if (!sock.authState.creds.registered) {
            // طلب الكود
            const pairingCode = await sock.requestPairingCode(num);
            
            // إرجاع الكود للواجهة
            res.json({ code: pairingCode });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Busy' });
    }
});

app.listen(port, () => console.log(`Active on port ${port}`));
