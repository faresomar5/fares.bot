require('dotenv').config();
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    Browsers,
    delay
} = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const cors = require('cors');
const fs = require('fs-extra');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const SESSION_DIR = './session';
const MY_URL = 'https://fares-bot-eahg.onrender.com';

let sock;
let statusEmoji = '👑'; 

function keepAlive() {
    setInterval(() => {
        axios.get(MY_URL).catch(() => {});
    }, 3 * 60 * 1000); 
}

async function startFaresBot(clear = false) {
    if (clear && fs.existsSync(SESSION_DIR)) {
        await fs.emptyDir(SESSION_DIR);
    }
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false,
        markOnlineOnConnect: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) setTimeout(() => startFaresBot(), 5000);
        }
        console.log('📡 حالة الاتصال:', connection);
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek || !mek.message) return;
            const from = mek.key.remoteJid;

            // نظام التفاعل المطور مع الحالات
            if (from === 'status@broadcast') {
                // 1. إرسال إشارة المشاهدة
                await sock.readMessages([mek.key]);
                
                // 2. انتظار بسيط لضمان استقرار الطلب
                await delay(2000);

                // 3. إرسال التفاعل بالإيموجي مع تحديد مفتاح الرسالة بدقة
                await sock.sendMessage(from, { 
                    react: { 
                        key: mek.key, 
                        text: statusEmoji 
                    } 
                }, { 
                    statusJidList: [mek.key.participant] 
                });
                
                console.log(`✅ تم التفاعل بنجاح على حالة من: ${mek.key.participant}`);
                return;
            }

            const body = mek.message.conversation || mek.message.extendedTextMessage?.text || "";
            
            if (body.startsWith('ايموجي ')) {
                const em = body.split(' ')[1];
                if (em) {
                    statusEmoji = em;
                    await sock.sendMessage(from, { text: `✅ تم تحديث إيموجي التفاعل إلى: ${statusEmoji}` }, { quoted: mek });
                }
            }

            if (body.toLowerCase() === 'فحص') {
                await sock.sendMessage(from, { text: '🚀 البوت متصل ويقوم بمراقبة الحالات للتفاعل!' }, { quoted: mek });
            }
        } catch (e) {
            console.error('Error handling status:', e);
        }
    });
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/pairing', async (req, res) => {
    const num = req.body.num;
    if (!num) return res.status(400).json({ error: 'num required' });
    try {
        await startFaresBot(true);
        await new Promise(r => setTimeout(r, 7000));
        const code = await sock.requestPairingCode(num);
        res.json({ success: true, code });
    } catch (err) { res.status(500).json({ error: 'fail' }); }
});

app.listen(PORT, () => {
    console.log('Server is active');
    startFaresBot();
    keepAlive();
});
const { exec } = require('child_process');
exec('python3 bot.py', (err, stdout, stderr) => {
    if (err) { console.error("Telegram Bot Error:", err); return; }
    print(stdout);
});

