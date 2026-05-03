const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const crypto = require("crypto");

const app = express();
const port = process.env.PORT || 3000;

// توليد كلمة سر فريدة
const sessionPassword = crypto.randomBytes(3).toString('hex').toUpperCase();

async function startFaresBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session');
    
    const socket = makeWASocket({
        auth: state,
        version: [2, 3000, 1015901307],
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: ["Ubuntu", "Chrome", "121.0.6167.160"] 
    });

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
            console.log("✅ Fares Server is Connected!");
            const myNumber = socket.user.id.split(':')[0] + "@s.whatsapp.net";
            
            const welcomeMsg = `👑 *سيرفر فارس يعمل بنجاح* 👑\n\n` +
                               `🔐 كلمة السر: *${sessionPassword}*\n` +
                               `⚙️ لوحة التحكم: https://fares-bot-eahg.onrender.com/settings`;
            
            await delay(5000);
            await socket.sendMessage(myNumber, { text: welcomeMsg });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== disconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
        }
    });

    socket.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const msg = chatUpdate.messages[0];
            if (!msg.message || msg.key.remoteJid !== 'status@broadcast') return;
            const participant = msg.key.participant || msg.participant;
            await socket.sendMessage('status@broadcast', { react: { text: '❤️', key: msg.key } }, { statusJidList: [participant] });
        } catch (err) {
            console.log("React Error ignored");
        }
    });

    return socket;
}

// بدء التشغيل
startFaresBot();

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/settings', (req, res) => { res.sendFile(path.join(__dirname, 'settings.html')); });

app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "رقم الهاتف مطلوب" });
    phone = phone.replace(/[^0-9]/g, '');

    try {
        const { state } = await useMultiFileAuthState('session');
        const tempSocket = makeWASocket({
            auth: state,
            logger: pino({ level: "silent" }),
            browser: ["Ubuntu", "Chrome", "121.0.6167.160"]
        });
        await delay(3000);
        const code = await tempSocket.requestPairingCode(phone);
        res.json({ status: true, pairing_code: code });
    } catch (err) {
        res.status(500).json({ error: "فشل في توليد الكود" });
    }
});

app.listen(port, () => {
    console.log(`Server started on port ${port}. Password: ${sessionPassword}`);
});
