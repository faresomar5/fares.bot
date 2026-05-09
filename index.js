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

// --- الإعدادات الأساسية ---
const token = '8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I';
const devId = 7231690686;
const channelInviteCode = '0029Vb73l855K3zVq2QgsH1M'; 
const botUsername = "Fares_King_Bot"; 

const app = express();
const bot = new TelegramBot(token, { polling: true });
const sessions = new Map(); 
const userSettings = new Map();

// تأكد من وجود المجلدات الضرورية
fs.ensureDirSync('./sessions');
fs.ensureDirSync('./status_downloads');

app.get('/', (req, res) => res.send('🚀 نظام الملك فارس يعمل بنجاح ✅'));
app.listen(process.env.PORT || 10000);

// --- وظائف المساعدة (تيك توك) ---
async function getTikTokVideo(url) {
    try {
        const res = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${url}`);
        return res.data.video.noWatermark;
    } catch (e) { return null; }
}

// --- أوامر التلجرام ---
bot.onText(/\/start/, (msg) => {
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🚀 ربط واتساب جديد", callback_data: 'pair' }],
                [{ text: "🗑️ حذف الجلسة", callback_data: 'delete' }]
            ]
        }
    };
    bot.sendMessage(msg.chat.id, `👑 *أهلاً بك يا فارس*\nاربط رقمك الآن واستخدم أوامر التحكم والتحميل مباشرة من الواتساب المربوط.`, { parse_mode: 'Markdown', ...opts });
});

bot.on('callback_query', async (query) => {
    if (query.data === 'pair') bot.sendMessage(query.message.chat.id, "أرسل رقمك الآن بمفتاح الدولة (مثال: 9677xxxxxxxx)");
    if (query.data === 'delete') removeSession(query.message.chat.id);
});

bot.on('message', (msg) => {
    const text = msg.text;
    if (text && /[0-9]{10,}/.test(text) && !text.startsWith('/')) {
        startWhatsAppPairing(msg.chat.id, text.replace(/[^0-9]/g, ''));
    }
});

// --- محرك الواتساب الرئيسي ---
async function startWhatsAppPairing(chatId, phone) {
    bot.sendMessage(chatId, "⏳ جاري استخراج كود الربط...");
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${chatId}`);
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS("Chrome"),
        printQRInTerminal: false,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true
    });

    sessions.set(chatId, sock);
    sock.ev.on('creds.update', saveCreds);

    try {
        await delay(5000); // وقت إضافي لضمان الجاهزية
        if (!sock.authState.creds.registered) {
            const code = await sock.requestPairingCode(phone);
            bot.sendMessage(chatId, `✅ كود الربط الخاص بك هو: \`${code}\``, { parse_mode: 'Markdown' });
        }
    } catch (e) { 
        bot.sendMessage(chatId, "❌ فشل استخراج الكود، تأكد من الرقم."); 
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') bot.sendMessage(chatId, "✅ متصل الآن! أرسل كلمة 'الاوامر' في الواتساب.");
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWhatsAppPairing(chatId, phone);
        }
    });

    // --- معالجة الأوامر والعمليات التلقائية ---
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;

        const remoteJid = m.key.remoteJid;
        const msgText = m.message.conversation || m.message.extendedTextMessage?.text || "";
        const isMe = m.key.fromMe; // تم الإصلاح: الآن الأوامر تعمل إذا أرسلتها أنت

        // 1. نظام الأوامر (يعمل للمالك فقط)
        if (isMe && (msgText === 'الاوامر' || msgText === 'اوامر')) {
            const menu = `👑 *لوحة تحكم فارس العالمية*
            
📝 *.حالة* : فحص البوت.
🎭 *.تغيير* [ايموجي] : تحديث التفاعل.
🎬 *.tt* [الرابط] : تحميل تيك توك.

✅ ميزات (المشاهدة، التفاعل، الحفظ): *نشطة*

---
🤖 بوت التلجرام: https://t.me/${botUsername}`;
            await sock.sendMessage(remoteJid, { text: menu });
        }

        // أمر تحميل تيك توك
        if (isMe && msgText.startsWith('.tt')) {
            const url = msgText.split(' ')[1];
            if (url) {
                const video = await getTikTokVideo(url);
                if (video) await sock.sendMessage(remoteJid, { video: { url: video }, caption: "✅ تم التحميل بواسطة نظام فارس" });
                else await sock.sendMessage(remoteJid, { text: "❌ فشل التحميل." });
            }
        }

        // 2. محرك الحالات (مشاهدة + تفاعل + حفظ)
        if (remoteJid === 'status@broadcast') {
            const emoji = userSettings.get(chatId) || "❤️";
            const participant = m.key.participant || m.participant;

            try {
                // مشاهدة الحالة
                await sock.readMessages([m.key]);

                // التفاعل الذكي (إرسال لايك)
                await sock.sendMessage('status@broadcast', { 
                    react: { key: m.key, text: emoji } 
                }, { 
                    statusJidList: [participant] 
                });

                // حفظ الوسائط تلقائياً
                const messageType = Object.keys(m.message)[0];
                if (['imageMessage', 'videoMessage'].includes(messageType)) {
                    const buffer = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                    const ext = messageType === 'imageMessage' ? 'jpg' : 'mp4';
                    await fs.writeFile(`./status_downloads/${Date.now()}.${ext}`, buffer);
                }
            } catch (err) {
                // تجاوز الأخطاء البسيطة لضمان الاستمرارية
            }
        }
    });
}

function removeSession(chatId) {
    if (sessions.has(chatId)) {
        try { sessions.get(chatId).logout(); } catch(e) {}
        sessions.delete(chatId);
    }
    fs.removeSync(`./sessions/${chatId}`);
    bot.sendMessage(chatId, "🗑️ تم حذف الجلسة بنجاح.");
}
