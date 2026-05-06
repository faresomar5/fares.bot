const { default: makeWASocket, useMultiFileAuthState, delay, DisconnectReason } = require("@whiskeysockets/baileys");
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

app.get('/get-pairing', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: 'رقم الهاتف مطلوب' });

    try {
        // حذف الجلسة القديمة لضمان عدم حدوث Error!
        if (fs.existsSync('./auth_info')) {
            fs.rmSync('./auth_info', { recursive: true, force: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            // هذا السطر مهم جداً للعمل على Render بدون أخطاء
            browser: ["Ubuntu", "Chrome", "20.0.04"]
        });

        await delay(3000); // وقت إضافي لتهيئة الاتصال
        const pairingCode = await sock.requestPairingCode(num);
        
        // توليد كلمة سر فريدة
        let db = JSON.parse(fs.readFileSync(DB_PATH));
        let userPassword = "FS-" + Math.floor(1000 + Math.random() * 9000);
        db[num] = { password: userPassword, settings: { emoji: "❤️" } };
        fs.writeFileSync(DB_PATH, JSON.stringify(db));

        res.json({ code: pairingCode, pass: userPassword });

    } catch (err) {
        console.error("Pairing Error:", err);
        res.status(500).json({ error: 'حدث خطأ أثناء استخراج الكود' });
    }
});

app.listen(port, () => console.log(`Server started on port ${port}`));
