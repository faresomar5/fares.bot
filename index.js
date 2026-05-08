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
const { exec } = require('child_process');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SESSION_DIR = './session';

let sock;

async function startFaresBot() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
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
        console.log('📡 Connection Status:', connection);
    });

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

app.get('/', (req, res) => res.send('Fares Bot Active'));

app.post('/api/pairing', async (req, res) => {
    const num = req.body.num;
    if (!num) return res.status(400).send('Number required');
    
    // مسح الجلسة القديمة لبدء ربط نظيف
    if (fs.existsSync(SESSION_DIR)) fs.emptyDirSync(SESSION_DIR);
    
    await startFaresBot();
    await delay(5000);
    const code = await sock.requestPairingCode(num);
    res.json({ code });
});

app.listen(PORT, () => {
    startFaresBot();
    exec('python3 bot.py');
});
