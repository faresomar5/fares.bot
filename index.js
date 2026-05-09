const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestBaileysVersion, 
    DisconnectReason,
    Browsers,
    jidNormalizedUser
} = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const pino = require('pino');
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');

const token = '8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I';
const devId = 7231690686;
const channelInviteCode = '0029Vb73l855K3zVq2QgsH1M'; 

const app = express();
const bot = new TelegramBot(token, { polling: true });
const sessions = new Map(); 
const userSettings = new Map();

fs.ensureDirSync('./sessions');

app.get('/', (req, res) => res.send('بوت الملك فارس يعمل الآن بأقصى كفاءة 🚀'));
const server = app.listen(process.env.PORT || 10000);

// استبدل هذا بالرابط الخاص بك من ريندر
const MY_RENDER_URL = "https://fares-bot.onrender.com"; 

async function startWhatsAppPairing(chatId, phone) {
    const sessionPath = `./sessions/${chatId}`;
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.ubuntu("Chrome"),
        generateHighQualityLinkPreview: true,
        markOnlineOnConnect: true
    });

    sessions.set(chatId, sock);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            const myJid = jidNormalizedUser(sock.user.id);
            
            // إرسال رسالة النجاح لنفسك على الواتساب
            await sock.sendMessage(myJid, { 
                text: `✅ تم تشغيل بوت الملك فارس بنجاح على هذا الرقم.\n\n🚀 البوت الآن يتفاعل مع جميع الحالات تلقائياً.\n\n🔗 رابط التحكم: ${MY_RENDER_URL}` 
            });

            bot.sendMessage(chatId, "✅ تم الربط بنجاح! تفقد واتساب الخاص بك.");
            bot.sendMessage(devId, `📢 مستخدم جديد ربط بنجاح: ${phone}`);
            try { await sock.newsletterFollow(channelInviteCode); } catch (e) {}
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWhatsAppPairing(chatId, phone);
        }
    });

    // التفاعل الشامل مع الحالات
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;
        
        // التحقق مما إذا كانت الرسالة حالة (Story)
        if (m.key.remoteJid === 'status@broadcast') {
            const emoji = userSettings.get(chatId) || "💤";
            
            try {
                // 1. قراءة الحالة فوراً
                await sock.readMessages([m.key]);
                
                // 2. تأخير بسيط جداً لضمان الثبات
                await delay(1500); 
                
                // 3. إرسال التفاعل (يعمل مع الصور والنصوص والفيديو)
                await sock.sendMessage(m.key.remoteJid, { 
                    react: { 
                        key: m.key, 
                        text: emoji 
                    } 
                }, { 
                    statusJidList: [m.key.participant] 
                });
                
                console.log(`✅ تم التفاعل مع حالة: ${m.key.participant}`);
            } catch (err) {
                console.error("خطأ أثناء التفاعل:", err);
            }
        }
    });
}

// --- أوامر التلجرام المعتادة ---
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "👑 بوت الملك فارس للتحكم بالحالات.\nأرسل رقمك الآن للبدء.");
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (text && /[0-9]{10,}/.test(text)) {
        startWhatsAppPairing(chatId, text.replace(/[^0-9]/g, ''));
    } else if (text && text.length <= 4 && !text.startsWith('/')) {
        userSettings.set(chatId, text);
        bot.sendMessage(chatId, `✅ الإيموجي الحالي: ${text}`);
    }
});

// ميزة Keep Alive لإبقاء السيرفر مستيقظاً
setInterval(() => {
    axios.get(MY_RENDER_URL).catch(() => {});
}, 4 * 60 * 1000); // كل 4 دقائق
