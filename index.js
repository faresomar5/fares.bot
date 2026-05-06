const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require('pino');
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.static('public'));
app.use(express.json());

const DB_PATH = './users_data.json';
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({}));

// مسار استخراج الكود مع حل مشكلة الخطأ
app.get('/get-pairing', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: 'Number required' });

    // 1. تنظيف أي جلسة قديمة تسبب الخطأ
    const authPath = './auth_info';
    if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true });
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            auth: state,
            version,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: ["Fares-Bot", "Chrome", "20.0.04"]
        });

        // انتظر قليلاً لضمان استقرار الاتصال
        await delay(3000);

        if (!sock.authState.creds.registered) {
            const pairingCode = await sock.requestPairingCode(num);
            
            // إنشاء كلمة سر فريدة للمستخدم
            let db = JSON.parse(fs.readFileSync(DB_PATH));
            let pass = "FS-" + Math.floor(1000 + Math.random() * 9000);
            db[num] = { password: pass, settings: { emoji: "❤️", antiDelete: true } };
            fs.writeFileSync(DB_PATH, JSON.stringify(db));

            res.json({ code: pairingCode, pass: pass });
        } else {
            res.json({ error: 'Device already linked' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Try again later' });
    }
});

app.listen(port, () => console.log(`Server started on port ${port}`));
