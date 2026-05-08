const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    delay
} = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const fs = require('fs-extra');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_DIR = './session';

async function startFaresBot() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // سيعرض الـ QR في سجلات Render إذا لم تستخدم Pairing Code
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome'),
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
        }
        console.log('📡 الحالة الحالية:', connection);
    });

    // كود التفاعل مع الحالات (Status)
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        const mek = chatUpdate.messages[0];
        if (mek.key.remoteJid === 'status@broadcast') {
            await sock.readMessages([mek.key]);
            await delay(2000);
            await sock.sendMessage(mek.key.remoteJid, { 
                react: { key: mek.key, text: '👑' } 
            }, { 
                statusJidList: [mek.key.participant] 
            });
        }
    });
}

app.get('/', (req, res) => res.send('Fares Bot is Running Successfully!'));

app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
    startFaresBot();
});
