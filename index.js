const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const crypto = require("crypto");

const app = express();
const port = process.env.PORT || 3000;
const sessionPassword = crypto.randomBytes(3).toString('hex').toUpperCase();

async function startFaresBot() {
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'fares_auth'));
    
    const socket = makeWASocket({
        auth: state,
        // إجبار السيرفر على استخدام أحدث إصدار ويب لإقناع واتساب بأنه متصفح حقيقي
        version: [2, 3000, 1015901307], 
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        // هوية متصفح MacOS مع Chrome 124 (موثوقة جداً ولا تُحجب غالباً)
        browser: ["Mac OS", "Chrome", "124.0.6367.60"] 
    });

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log("✅ CONNECTED");
            const myNumber = socket.user.id.split(':')[0] + "@s.whatsapp.net";
            await delay(5000);
            await socket.sendMessage(myNumber, { text: `👑 سيرفر فارس متصل\n🔐 كلمة السر: ${sessionPassword}` });
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== disconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
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
        const { state } = await useMultiFileAuthState(path.join(__dirname, 'fares_auth'));
        const temp = makeWASocket({ 
            auth: state, 
            version: [2, 3000, 1015901307],
            logger: pino({ level: "silent" }), 
            browser: ["Mac OS", "Chrome", "124.0.6367.60"] 
        });
        await delay(3500); // زيادة وقت التهيئة قليلاً
        const code = await temp.requestPairingCode(num);
        res.json({ status: true, pairing_code: code });
    } catch (e) { 
        res.json({ error: "حاول مرة أخرى بعد دقيقة" }); 
    }
});

app.listen(port, () => console.log(`Server Online`));
