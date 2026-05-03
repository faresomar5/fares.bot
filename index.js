const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const crypto = require("crypto");

const app = express();
const port = process.env.PORT || 3000;
const sessionPassword = crypto.randomBytes(3).toString('hex').toUpperCase();

async function startFaresBot() {
    // استخدام مسار محدد للجلسة لضمان عدم التداخل
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'session'));
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
        auth: state,
        version: version,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        // استخدام هوية متصفح قياسية ومستقرة
        browser: ["Ubuntu", "Chrome", "121.0.6167.160"]
    });

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log("✅ Connected Successfully!");
            const myNumber = socket.user.id.split(':')[0] + "@s.whatsapp.net";
            const msg = `👑 *سيرفر فارس متصل*\n🔐 كلمة السر: ${sessionPassword}`;
            await delay(5000);
            await socket.sendMessage(myNumber, { text: msg });
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== disconnectReason.loggedOut) {
                console.log("إعادة الاتصال...");
                startFaresBot();
            }
        }
    });

    // التفاعل التلقائي مع الحالات
    socket.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (msg.key.remoteJid === 'status@broadcast') {
            await socket.sendMessage('status@broadcast', { react: { text: '❤️', key: msg.key } }, { statusJidList: [msg.key.participant] });
        }
    });

    return socket;
}

startFaresBot();

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/settings', (req, res) => res.sendFile(path.join(__dirname, 'settings.html')));
app.get('/api/pairing', async (req, res) => {
    let num = req.query.number?.replace(/[^0-9]/g, '');
    if (!num) return res.json({ error: "رقم مطلوب" });
    try {
        const { state } = await useMultiFileAuthState(path.join(__dirname, 'session'));
        const temp = makeWASocket({ auth: state, logger: pino({ level: "silent" }), browser: ["Ubuntu", "Chrome", "121.0.6167.160"] });
        await delay(3000);
        const code = await temp.requestPairingCode(num);
        res.json({ status: true, pairing_code: code });
    } catch (e) { res.json({ error: "خطأ في الكود" }); }
});

app.listen(port, () => console.log(`Server Live. PW: ${sessionPassword}`));
