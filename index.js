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

// --- الإعدادات ---
const token = '8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I';
const devId = 7231690686;
const channelInviteCode = '0029Vb73l855K3zVq2QgsH1M'; 
const MY_RENDER_URL = "https://fares-bot.onrender.com"; 

const app = express();
const bot = new TelegramBot(token, { polling: true });
const sessions = new Map(); 

fs.ensureDirSync('./sessions');

app.get('/', (req, res) => res.send('البوت يعمل بأداء مستقر ✅'));
app.listen(process.env.PORT || 10000);

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text) return;

    if (text === '/start') {
        return bot.sendMessage(chatId, "👑 بوت الملك فارس\n\nأرسل رقمك الآن (مثال: 967773987296) لبدء الربط.");
    }

    if (/[0-9]{10,}/.test(text)) {
        const phone = text.replace(/[^0-9]/g, '');
        bot.sendMessage(chatId, "⏳ جاري توليد كود الربط... انتظر قليلاً.");
        await startWhatsAppPairing(chatId, phone);
    }
});

async function startWhatsAppPairing(chatId, phone) {
    const sessionPath = `./sessions/${chatId}`;
    
    // مسح الجلسة القديمة
