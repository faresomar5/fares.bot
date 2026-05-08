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
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SESSION_DIR = './session';
const MY_URL = 'https://fares-bot-eahg.onrender.com';
const TELEGRAM_TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I";

let sock;
let statusEmoji = '👑'; 

// نظام التنبيه الفوري للتليجرام
async function sendToTg(text) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: "7231690686", // تأكد من الـ ID الخاص بك
            text: text,
            parse_mode: "Markdown"
        });
    } catch (e) {}
}

async function startFaresBot(clear = false) {
    if (clear && fs.existsSync(SESSION_DIR)) { await fs.emptyDir(SESSION_DIR); }
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Desktop'), // محاكاة تصفح ديسكتوب للاستقرار
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000, // نبض داخلي كل 10 ثواني
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log('✅ متصل');
            await sendToTg("🚀 **البوت متصل الآن وسيبدأ التفاعل التلقائي!**");
        }
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                console.log('🔄 إعادة اتصال تلقائي...');
                setTimeout(() => startFaresBot(), 2000);
            }
        }
    });

    // ⚡ محرك التفاعل النهائي (حل مشكلة عدم الإعجاب)
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek || !mek.message || mek.key.fromMe) return;
            const from = mek.key.remoteJid;

            if (from === 'status@broadcast') {
                // 1. قراءة الحالة (Seen)
                await sock.readMessages([mek.key]);
                
                // 2. تأخير عشوائي بين 2-5 ثواني لمنع الحظر والجمود
                await delay(Math.floor(Math.random() * 3000) + 2000);

                // 3. التفاعل المباشر باستخدام الـ Participant ID
                await sock.sendMessage(from, { 
                    react: { key: mek.key, text: statusEmoji } 
                }, { 
                    statusJidList: [mek.key.participant] 
                });
                
                console.log(`✅ تم التفاعل مع حالة: ${mek.pushName || 'مستخدم'}`);
            }
        } catch (e) { console.error("توقف مؤقت في التفاعل:", e.message); }
    });
}

// نقاط التحكم (API)
app.get('/', (req, res) => res.send('Fares Bot Active 24/7'));
app.post('/api/logout', async (req, res) => {
    if (fs.existsSync(SESSION_DIR)) { await fs.emptyDir(SESSION_DIR); if (sock) sock.logout(); res.json({ success: true }); }
});
app.post('/api/update-emoji', (req, res) => { if (req.body.emoji) { statusEmoji = req.body.emoji; res.json({ success: True }); } });
app.post('/api/pairing', async (req, res) => {
    const num = req.body.num;
    await startFaresBot(true);
    await delay(10000);
    const code = await sock.requestPairingCode(num);
    res.json({ success: true, code });
});

app.listen(PORT, () => {
    console.log('Server Running');
    startFaresBot();
    exec('python3 bot.py');
    // نبض ذاتي كل 45 ثانية لمنع Render من النوم
    setInterval(() => { axios.get(MY_URL).catch(() => {}); }, 45000);
});
