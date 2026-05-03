const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys");
const pino = require("pino");

const app = express();
const port = process.env.PORT || 3000;

// 1. نظام توليد كود الاقتران (API)
app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "يرجى إدخال رقم الهاتف" });

    try {
        const { state, saveCreds } = await useMultiFileAuthState('session');
        const socket = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            // السطر الذي أضفته أنت لضمان وصول الإشعار
            browser: ["Mac OS", "Chrome", "10.15.7"] 
        });

        if (!socket.authState.creds.registered) {
            await delay(2000);
            const code = await socket.requestPairingCode(phone);
            res.json({ 
                status: true, 
                pairing_code: code 
            });
        } else {
            res.json({ status: false, message: "الرقم مربوط مسبقاً" });
        }
        
        socket.ev.on('creds.update', saveCreds);

    } catch (err) {
        res.status(500).json({ error: "خطأ في السيرفر", details: err.message });
    }
});

// 2. فتح واجهة الموقع
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`السيرفر يعمل على المنفذ ${port}`);
});
