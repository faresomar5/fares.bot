const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys");
const pino = require("pino");

const app = express();
const port = process.env.PORT || 3000;

// الصفحة الرئيسية لتأكيد عمل السيرفر
app.get('/', (req, res) => {
    res.json({
        status: "Online",
        message: "سيرفر بوت فارس يعمل بنجاح",
        endpoint: "/api/pairing"
    });
});

// المسار الذي طلبته api/pairing
app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    
    if (!phone) {
        return res.json({ 
            error: "نقص في البيانات", 
            example: "https://fares.bot.onrender.com/api/pairing?number=9665xxxxxxxx" 
        });
    }

    try {
        // إنشاء جلسة مؤقتة لتوليد الكود
        const { state, saveCreds } = await useMultiFileAuthState('session');
        const socket = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            browser: ["Chrome (Linux)", "", ""]
        });

        if (!socket.authState.creds.registered) {
            await delay(1500);
            const code = await socket.requestPairingCode(phone);
            res.json({
                status: true,
                author: "fares.bot",
                pairing_code: code
            });
        } else {
            res.json({ status: false, message: "هذا الرقم مربوط بالفعل" });
        }
    } catch (err) {
        res.status(500).json({ error: "خطأ في السيرفر", details: err.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

