const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

const SESSION_ROOT = path.join(__dirname, 'sessions');

app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "يرجى إدخال رقم الهاتف" });
    phone = phone.replace(/[^0-9]/g, '');

    const sessionId = `fares_${uuidv4()}`;
    const sessionDir = path.join(SESSION_ROOT, sessionId);

    try {
        await fs.ensureDir(sessionDir);
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        const socket = makeWASocket({
            auth: state,
            version: version,
            logger: pino({ level: "silent" }),
            browser: ["Fares-Bot", "Chrome", "121.0.0.0"] 
        });

        socket.ev.on('creds.update', saveCreds);

        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                await socket.sendMessage(socket.user.id, { text: "✅ تم ربط نظام فارس بنجاح!" });
                setTimeout(async () => {
                    socket.end();
                    await fs.remove(sessionDir);
                }, 15000);
            }
            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason !== disconnectReason.connectionReplaced) {
                    await fs.remove(sessionDir);
                }
            }
        });

        await delay(3000); 
        const code = await socket.requestPairingCode(phone);
        if (!res.headersSent) res.json({ status: true, pairing_code: code });

    } catch (err) {
        await fs.remove(sessionDir);
        if (!res.headersSent) res.status(500).json({ error: "خطأ في السيرفر" });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Server live on port ${port}`);
});
