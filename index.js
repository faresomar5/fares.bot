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

// --- الإعدادات (تأكد من صحة التوكن) ---
const token = '8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I';
const devId = 7231690686;
const channelInviteCode = '0029Vb73l855K3zVq2QgsH1M'; 
const MY_RENDER_URL = "https://fares-bot.onrender.com"; // ضع رابطك هنا

const app = express();
const bot = new TelegramBot(token, { polling: true });
const sessions = new Map(); 

fs.ensureDirSync('./sessions');

app.get('/', (req, res) => res.send('البوت يعمل ✅'));
app.listen(process.env.PORT || 10000);

// --- التعامل مع رسائل التلجرام ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    if (text === '/start') {
        return bot.sendMessage(chatId, "👑 بوت الملك فارس\n\nأرسل رقمك الآن (مثال: 967773987296) لبدء الربط.");
    }

    // التحقق إذا كان النص المدخل عبارة عن رقم هاتف
    if (/[0-9]{10,}/.test(text)) {
        const phone = text.replace(/[^0-9]/g, '');
        bot.sendMessage(chatId, "⏳ جاري محاولة استخراج كود الربط... يرجى الانتظار ثواني.");
        
        try {
            await startWhatsAppPairing(chatId, phone);
        } catch (error) {
            console.error(error);
            bot.sendMessage(chatId, "❌ حدث خطأ تقني أثناء المحاولة. يرجى إرسال الرقم مرة أخرى.");
        }
    }
});

// --- وظيفة الربط والتشغيل ---
async function startWhatsAppPairing(chatId, phone) {
    const sessionPath = `./sessions/${chatId}`;
    
    // تنظيف أي جلسة سابقة عالقة لنفس المستخدم
    if (fs.existsSync(sessionPath)) {
        fs.removeSync(sessionPath);
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS("Safari"), // تغيير المتصفح أحياناً يحل مشكلة عدم الاستجابة
        markOnlineOnConnect: true
    });

    sessions.set(chatId, sock);
    sock.ev.on('creds.update', saveCreds);

    // محاولة طلب الكود فوراً
    try {
        await delay(5000); // إعطاء وقت للسوكت ليبدأ
        const code = await sock.requestPairingCode(phone);
        bot.sendMessage(chatId, `✅ تم توليد الكود بنجاح!\n\nأدخل هذا الكود في واتساب:\n\n \`${code}\``, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(chatId, "❌ فشل السيرفر في توليد الكود. قد يكون الرقم محظوراً من طلب الأكواد مؤقتاً أو أن هناك ضغط على السيرفر.");
        return;
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            const myJid = jidNormalizedUser(sock.user.id);
            await sock.sendMessage(myJid, { text: `✅ تم تشغيل بوت الملك فارس بنجاح!\n\n🔗 الرابط: ${MY_RENDER_URL}` });
            bot.sendMessage(chatId, "🎊 مبروك! تمت عملية الربط بنجاح.");
            bot.sendMessage(devId, `📢 مستخدم جديد ربط بنجاح: ${phone}`);
        }

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                startWhatsAppPairing(chatId, phone);
            }
        }
    });

    // التفاعل مع الحالات
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (m.key.remoteJid === 'status@broadcast') {
            await delay(2000);
            await sock.readMessages([m.key]);
            await sock.sendMessage(m.key.remoteJid, { react: { key: m.key, text: "💤" } }, { statusJidList: [m.key.participant] });
        }
    });
}

// ميزة البقاء نشطاً
setInterval(() => {
    axios.get(MY_RENDER_URL).catch(() => {});
}, 3 * 60 * 1000);
