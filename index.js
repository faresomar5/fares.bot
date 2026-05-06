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

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["Fares Bot", "Chrome", "1.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const remoteJid = msg.key.remoteJid;
        const senderNumber = remoteJid.split('@')[0];
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        if (body.trim() === ".bot") {
            let db = JSON.parse(fs.readFileSync(DB_PATH));
            if (!db[senderNumber]) {
                db[senderNumber] = {
                    password: "FS-" + Math.floor(1000 + Math.random() * 9000),
                    settings: { 
                        emoji: "❤️", antiCall: true, autoRead: true, 
                        alwaysOnline: true, antiDelete: true, publicMode: true 
                    }
                };
                fs.writeFileSync(DB_PATH, JSON.stringify(db));
            }

            const userPass = db[senderNumber].password;
            const pairingCode = await sock.requestPairingCode(senderNumber);

            const welcomeMsg = `✅ *تم استخراج كود الربط*\n\n` +
                `🔢 كودك هو: *${pairingCode}*\n` +
                `🔐 كلمة سر الموقع: *${userPass}*\n\n` +
                `🔗 رابط الإعدادات:\n` +
                `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost'}/settings.html\n\n` +
                `💡 استعمل رقمك وكلمة السر المسجلة أعلاه للدخول.`;

            await sock.sendMessage(remoteJid, { text: welcomeMsg });
        }
    });

    sock.ev.on('connection.update', async (update) => {
        if (update.connection === 'open') {
            await sock.sendMessage(sock.user.id, { 
                text: `🎊 تم تشغيل البوت بنجاح!\n\n⚙️ لوحة التحكم: https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost'}/settings.html` 
            });
        }
    });
}

app.post('/login', (req, res) => {
    const { number, password } = req.body;
    let db = JSON.parse(fs.readFileSync(DB_PATH));
    if (db[number] && db[number].password === password) {
        res.json({ success: true, settings: db[number].settings });
    } else {
        res.json({ success: false, message: "بيانات الدخول خاطئة" });
    }
});

startBot();
app.listen(port, () => console.log(`Server started on port ${port}`));
