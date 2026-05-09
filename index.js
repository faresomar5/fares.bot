const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestBaileysVersion, 
    DisconnectReason,
    Browsers,
    downloadMediaMessage 
} = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const pino = require('pino');
const express = require('express');
const fs = require('fs-extra');
const axios = require('axios');
const path = require('path');

// --- إعدادات البوت الأساسية ---
const token = '8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I';
const devId = 7231690686;
const channelInviteCode = '0029Vb73l855K3zVq2QgsH1M'; 
const botUsername = "Fares_King_Bot"; 

const app = express();
const bot = new TelegramBot(token, { polling: true });
const sessions = new Map(); 
const userSettings = new Map();

// تأمين المجلدات
fs.ensureDirSync('./sessions');
fs.ensureDirSync('./status_downloads');

app.get('/', (req, res) => res.send('🚀 نظام الملك فارس: متصل ويعمل بكفاءة ✅'));
app.listen(process.env.PORT || 10000);

// --- وظائف التحميل الخارجية ---
async function getTikTokVideo(url) {
    try {
        const res = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${url}`);
        return res.data.video.noWatermark;
    } catch (e) { return null; }
}

// --- أوامر التلجرام ومعالجة الأرقام ---
bot.onText(/\/start/, (msg) => {
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🚀 ربط واتساب جديد", callback_data: 'pair' }],
                [{ text: "📊 حالة الجلسة", callback_data: 'list' }, { text: "🗑️ حذف الجلسة", callback_data: 'delete' }]
            ]
        }
    };
    bot.sendMessage(msg.chat.id, `👑 *أهلاً بك في نظام الملك فارس المتكامل*\n\nاربط رقمك الآن واستخدم أوامر التحميل والتحكم مباشرة من واتساب.`, { parse_mode: 'Markdown', ...opts });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'pair') bot.sendMessage(chatId, "أرسل رقمك الآن مع مفتاح الدولة (مثال: 9665xxxxxxxx)");
    else if (query.data === 'delete') removeSession(chatId);
    else if (query.data === 'list') {
        const sessionDir = `./sessions/${chatId}`;
        bot.sendMessage(chatId, fs.existsSync(sessionDir) ? "✅ جلستك نشطة." : "❌ لا توجد جلسة.");
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text || text.startsWith('/')) return;

    // التحقق من إرسال رقم هاتف للربط
    if (/[0-9]{10,}/.test(text)) {
        const phone = text.replace(/[^0-9]/g, '');
        startWhatsAppPairing(chatId, phone);
    }
});

// --- محرك الواتساب المطور (حل مشكلة الكود + الأوامر) ---
async function startWhatsAppPairing(chatId, phone) {
    bot.sendMessage(chatId, "⏳ جاري محاولة استخراج كود الربط، انتظر قليلاً...");
    
    const sessionPath = `./sessions/${chatId}`;
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS("Chrome"), // متصفح مستقر للربط
        syncFullHistory: false,
        markOnlineOnConnect: true
    });

    sessions.set(chatId, sock);
    sock.ev.on('creds.update', saveCreds);

    // معالجة طلب الكود مع تأخير لضمان جاهزية السوكيت
    try {
        await delay(5000); // وقت إضافي لتهيئة الجلسة
        if (!sock.authState.creds.registered) {
            const code = await sock.requestPairingCode(phone);
            bot.sendMessage(chatId, `✅ *كود الربط الخاص بك هو:*\n\n\`${code}\`\n\nانسخه وضعه في واتساب (الأجهزة المرتبطة).`, { parse_mode: 'Markdown' });
        } else {
            bot.sendMessage(chatId, "ℹ️ الحساب مرتبط بالفعل.");
        }
    } catch (err) {
        bot.sendMessage(chatId, `❌ فشل طلب الكود. السبب: ${err.message}`);
    }

    // إدارة الاتصال
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            bot.sendMessage(chatId, "✅ تم الربط بنجاح!\nاكتب كلمة *'الاوامر'* في واتساب للبدء.");
            try { await sock.newsletterFollow(channelInviteCode); } catch (e) {}
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWhatsAppPairing(chatId, phone);
        }
    });

    // معالجة الرسائل والأوامر داخل واتساب
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;

        const remoteJid = m.key.remoteJid;
        const msgText = m.message.conversation || m.message.extendedTextMessage?.text || "";
        const isMe = m.key.fromMe;

        // 1. نظام الأوامر (المالك فقط)
        if (isMe && (msgText.toLowerCase() === 'الاوامر' || msgText.toLowerCase() === 'اوامر')) {
            const menu = `👑 *لوحة تحكم الملك فارس العالمية*

*〔 ⚙️ أوامر النظام 〕*
📝 *.حالة* : فحص الاتصال.
🎭 *.تغيير* [ايموجي] : تفاعل الحالات.

*〔 📥 قسم التحميلات 〕*
🎬 *.tt* [رابط تيك توك] : تحميل فيديو.
🎥 *.yt* [رابط يوتيوب] : تحميل فيديو.
🎵 *.mp3* [رابط يوتيوب] : تحميل صوت.

🤖 بوت التلجرام: https://t.me/${botUsername}`;
            await sock.sendMessage(remoteJid, { text: menu });
        }

        // 2. أمر تحميل تيك توك
        if (isMe && msgText.startsWith('.tt')) {
            const url = msgText.split(' ')[1];
            if (!url) return;
            await sock.sendMessage(remoteJid, { text: "⏳ جاري التحميل من تيك توك..." });
            const video = await getTikTokVideo(url);
            if (video) await sock.sendMessage(remoteJid, { video: { url: video }, caption: "✅ تم التحميل بنجاح" });
            else await sock.sendMessage(remoteJid, { text: "❌ فشل التحميل." });
        }

        // 3. محرك الحالات (مشاهدة + تفاعل + حفظ)
        if (remoteJid === 'status@broadcast') {
            const emoji = userSettings.get(chatId) || "❤️";
            const participant = m.key.participant || m.participant;
            try {
                await sock.readMessages([m.key]); // مشاهدة
                await sock.sendMessage('status@broadcast', { react: { key: m.key, text: emoji } }, { statusJidList: [participant] }); // تفاعل
                
                const messageType = Object.keys(m.message)[0];
                if (['imageMessage', 'videoMessage'].includes(messageType)) {
                    const buffer = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                    const ext = messageType === 'imageMessage' ? 'jpg' : 'mp4';
                    await fs.writeFile(`./status_downloads/${participant.split('@')[0]}_${Date.now()}.${ext}`, buffer); // حفظ
                }
            } catch (e) {}
        }
    });
}

function removeSession(chatId) {
    if (sessions.has(chatId)) {
        try { sessions.get(chatId).logout(); } catch(e) {}
        sessions.delete(chatId);
    }
    fs.removeSync(`./sessions/${chatId}`);
    bot.sendMessage(chatId, "🗑️ تم حذف الجلسة.");
}
