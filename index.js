const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys");
const pino = require('pino');
const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.static('public'));
app.use(express.json());

// مسار استخراج كود الربط للواجهة
app.get('/pairing-code', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: 'الرقم مطلوب' });

    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: ["Chrome (Linux)", "", ""]
        });

        if (!sock.authState.creds.registered) {
            await delay(1500);
            const code = await sock.requestPairingCode(num);
            res.json({ code: code });
        } else {
            res.json({ error: 'الحساب مرتبط بالفعل' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'فشل استخراج الكود' });
    }
});

app.listen(port, () => console.log(`سيرفر فارس يعمل على منفذ ${port}`));
