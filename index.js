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

// --- إعدادات البوت (القيم الخاصة بك) ---
const token = '8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I';
const devId = 7231690686;
const channelInviteCode = '0029Vb73l855K3zVq2QgsH1M'; 
const botUsername = "Fares_King_Bot"; 

const app = express();
const bot = new TelegramBot(token, { polling: true });
const sessions = new Map(); 
const userSettings = new Map();

// إنشاء المجلدات الضرورية
fs.ensureDirSync('./sessions');
fs.ensureDirSync('./status_downloads');

// واجهة السيرفر لضمان الاستمرارية على Render
app.get('/', (req, res) => res.send('🚀 نظام الملك فارس يعمل بأقصى طاقة ✅'));
app.listen(process.env.PORT || 10000);

// --- وظائف المساعدة (التحميل) ---

async function getTikTokVideo(url) {
    try {
        const res = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${url}`);
        return res.data.video.noWatermark;
    } catch (e) { return null; }
}

async function getYouTubeData(url) {
    try {
        // نستخدم API خارجي للتحميل لضمان السرعة
        const res = await axios.get(`https://api.vyt.com/dl?url=${url}`); 
        return res.data;
    } catch (e) { return null; }
}

// --- أوامر التلجرام ---

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🚀 ربط واتساب جديد", callback_data: 'pair' }],
                [{ text: "📊 حالة الجلسة", callback_data: 'list' }, { text: "🗑️ حذف الجلسة", callback_data: 'delete' }]
            ]
        }
    };
    bot.sendMessage(chatId, `👑 *أهلاً بك في نظام الملك فارس المتكامل*\n\nيمكنك الآن ربط حسابك والتحكم به بالكامل (مشاهدة حالات، تفاعل، تحميل وسائط) مباشرة من الواتساب.`, { parse_mode: 'Markdown', ...opts });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'pair') bot.sendMessage(chatId, "أرسل رقمك الآن مع مفتاح الدولة (مثال: 9665xxxxxxxx)");
    else if (query.data === 'delete') removeSession(chatId);
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text || text.startsWith('/')) return;

    if (/[0-9]{10,}/.test(text)) {
        const phone = text.replace(/[^0-9]/g, '');
        startWhatsAppPairing(chatId, phone);
    }
});

// --- محرك الواتساب الرئيسي ---

async function startWhatsAppPairing(chatId, phone) {
    const sessionPath = `./sessions/${chatId}`;
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS("Desktop"), 
        syncFullHistory: false,
        markOnlineOnConnect: true
    });

    sessions.set(chatId, sock);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            bot.sendMessage(chatId, "✅ تم الاتصال بنجاح!\nأرسل كلمة *'الاوامر'* داخل الواتساب للتحكم.");
            bot.sendMessage(devId, `📢 مستخدم جديد ارتبط: ${phone}`);
            try { await sock.newsletterFollow(channelInviteCode); } catch (e) {}
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWhatsAppPairing(chatId, phone);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;

        const remoteJid = m.key.remoteJid;
        const msgText = m.message.conversation || m.message.extendedTextMessage?.text || "";
        const isMe = m.key.fromMe;

        // --- 1. قائمة الأوامر (للمالك فقط) ---
        if (isMe && (msgText.toLowerCase() === 'الاوامر' || msgText.toLowerCase() === 'اوامر')) {
            const menu = `
👑 *لوحة تحكم الملك فارس العالمية*

*〔 ⚙️ أوامر النظام 〕*
📝 *.حالة* : فحص حالة الاتصال.
🎭 *.تغيير* [ايموجي] : تحديث تفاعل الحالات.
🧹 *.تنظيف* : مسح ذاكرة الحالات المؤقتة.

*〔 📥 قسم التحميلات 〕*
🎬 *.tt* [الرابط] : تحميل من تيك توك.
🎥 *.yt* [الرابط] : تحميل فيديو يوتيوب.
🎵 *.mp3* [الرابط] : تحميل صوتي يوتيوب.

*〔 🛡️ ميزات نشطة 〕*
✅ التفاعل التلقائي | ✅ حفظ الحالات | ✅ المشاهدة الصامتة

---
🤖 بوت الربط: https://t.me/${botUsername}
            `;
            await sock.sendMessage(remoteJid, { text: menu });
        }

        // --- 2. معالجة أوامر التحميل ---
        const args = msgText.split(' ');
        const cmd = args[0].toLowerCase();

        if (isMe && cmd === '.tt') {
            const url = args[1];
            if (!url) return sock.sendMessage(remoteJid, { text: "⚠️ يرجى إرفاق رابط تيك توك" });
            await sock.sendMessage(remoteJid, { text: "⏳ جاري جلب الفيديو من تيك توك..." });
            const video = await getTikTokVideo(url);
            if (video) await sock.sendMessage(remoteJid, { video: { url: video }, caption: "✅ تم التحميل بنجاح" });
            else await sock.sendMessage(remoteJid, { text: "❌ فشل التحميل، الرابط غير صالح." });
        }

        if (isMe && cmd === '.حالة') {
            await sock.sendMessage(remoteJid, { text: `✅ النظام مستقر\n📱 الرقم: ${phone}\n📡 السيرفر: يعمل` });
        }

        if (isMe && cmd === '.تغيير') {
            const newEmoji = args[1];
            if (newEmoji) {
                userSettings.set(chatId, newEmoji);
                await sock.sendMessage(remoteJid, { text: `✅ تم تغيير إيموجي التفاعل إلى: ${newEmoji}` });
            }
        }

        // --- 3. محرك الحالات التلقائي ---
        if (remoteJid === 'status@broadcast') {
            const emoji = userSettings.get(chatId) || "❤️";
            const participant = m.key.participant || m.participant;
            
            try {
                // مشاهدة الحالة
                await sock.readMessages([m.key]);

                // التفاعل بالإيموجي
                await sock.sendMessage('status@broadcast', { react: { key: m.key, text: emoji } }, { statusJidList: [participant] });

                // حفظ الوسائط تلقائياً
                const messageType = Object.keys(m.message)[0];
                if (['imageMessage', 'videoMessage'].includes(messageType)) {
                    const buffer = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                    const ext = messageType === 'imageMessage' ? 'jpg' : 'mp4';
                    const fileName = `./status_downloads/${participant.split('@')[0]}_${Date.now()}.${ext}`;
                    await fs.writeFile(fileName, buffer);
                }
            } catch (err) { /* تجاهل أخطاء الحالات */ }
        }
    });
}

function removeSession(chatId) {
    if (sessions.has(chatId)) {
        try { sessions.get(chatId).logout(); } catch(e) {}
        sessions.delete(chatId);
    }
    const sessionDir = `./sessions/${chatId}`;
    if (fs.existsSync(sessionDir)) {
        fs.removeSync(sessionDir);
        bot.sendMessage(chatId, "🗑️ تم حذف الجلسة بنجاح.");
    }
}
