require('dotenv').config();
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    Browsers
} = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const path = require('path');
const cors = require('cors');
const fs = require('fs-extra');
const axios = require('axios'); // تأكد من وجود axios في package.json

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const SESSION_DIR = './session';
const MY_URL = 'https://fares-bot-eahg.onrender.com'; // رابط موقعك

let sock;
let statusEmoji = '👑'; 

// دالة منع النوم (Keep-Alive)
function keepAlive() {
    setInterval(async () => {
        try {
            await axios.get(MY_URL);
            console.log('✅ تم إرسال نبض لتنشيط السيرفر...');
        } catch (e) {
            console.log('❌ خطأ في تنشيط السيرفر، لكن البوت مستمر.');
        }
    }, 5 * 60 * 1000); // كل 5 دقائق
}

async function startFaresBot(clearSession = false) {
    if (clearSession && fs.existsSync(SESSION_DIR)) {
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
        syncFullHistory: false, // لتقليل استهلاك الذاكرة وضمان عدم التوقف
        markOnlineOnConnect: true 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('🔄 إعادة الاتصال الآن...');
                startFaresBot();
            }
        }
        console.log('📡 حالة الاتصال:', connection);
    });

    // التفاعل مع الحالات (Status)
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;
            const from = mek.key.remoteJid;

            if (from === 'status@broadcast') {
                await sock.readMessages([mek.key]);
                await sock.sendMessage(from, { react: { key: mek.key, text: statusEmoji } }, { statusJidList: [mek.key.participant] });
                return;
            }

            const body = mek.message.conversation || mek.message.extendedTextMessage?.text || "";
            const cmd = body.trim().toLowerCase();

            if (cmd === 'فحص') {
                await sock.sendMessage(from, { text: '🚀 البوت يعمل بنظام 24 ساعة حالياً!' }, { quoted: mek });
            }
            
            if (body.startsWith('ايموجي ')) {
                statusEmoji = body.split(' ')[1] || '👑';
                await sock.sendMessage(from, { text: `✅ تم ضبط إيموجي الحالات على: ${statusEmoji}` });
            }
        } catch (err) { console.log(err); }
    });
}

app.post('/api/pairing', async (req, res) => {
    const num = req.body.num;
    if (!num) return res.status(400).json({ error: 'الرقم مطلوب' });
    try {
        await startFaresBot(true);
        await new Promise(r => setTimeout(r, 5000));
        const code = await sock.requestPairingCode(num);
        res.json({ success: true, code });
    } catch (err) { res.status(500).json({ error: 'فشل' }); }
});

app.get('/', (req, res) => res.send('السيرفر نشط 24/7'));

app.listen(PORT, () => {
    console.log(`سيرفر الملك فارس يعمل على المنفذ ${PORT}`);
    startFaresBot();
    keepAlive(); // تشغيل ميزة منع النوم
});
