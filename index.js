const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys");
const pino = require("pino");

const app = express();
const port = process.env.PORT || 3000;

// مسار الـ API الخاص بتوليد كود الربط
app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "يرجى إدخال رقم الهاتف" });

    try {
        const { state, saveCreds } = await useMultiFileAuthState('session');
        const socket = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            browser: ["Ubuntu", "Chrome", "20.0.04"]
        });

        if (!socket.authState.creds.registered) {
            await delay(2000);
            const code = await socket.requestPairingCode(phone);
            res.json({ status: true, pairing_code: code });
        } else {
            res.json({ status: false, message: "الرقم مربوط مسبقاً" });
        }
    } catch (err) {
        res.status(500).json({ error: "خطأ في السيرفر", details: err.message });
    }
});

// --- الكود المطلوب وضعه في آخر الملف لفتح الواجهة ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// تشغيل السيرفر
app.listen(port, () => {
    console.log(`سيرفر فارس يعمل على المنفذ ${port}`);
});
