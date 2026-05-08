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
let statusEmoji = '👑'; // الإيموجي الذي سيظهر على كل أنواع الاستوريات

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
    });

    // ⚡ محرك التفاعل الشامل مع كافة أنواع الاستوريات
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;
            const from = mek.key.remoteJid;

            // التفاعل مع أي استوري (نص، صورة، فيديو، إلخ)
            if (from === 'status@broadcast') {
                // مشاهدة الاستوري أولاً
                await sock.readMessages([mek.key]);
                
                // التفاعل بالإيموجي (سيعمل مع الكل تلقائياً)
                await sock.sendMessage(from, { 
                    react: { 
                        key: mek.key, 
                        text: statusEmoji 
                    } 
                }, { 
                    statusJidList: [mek.key.participant] 
                });
                
                return;
            }

            // أوامر التحكم (عبر هاتفك المربوط)
            const body = mek.message.conversation || mek.message.extendedTextMessage?.text || "";
            
            // تغيير الإيموجي: اكتب "ايموجي ❤️"
            if (body.startsWith('ايموجي ')) {
                const new
