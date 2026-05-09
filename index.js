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

// --- إعدادات البوت الأساسية ---
const token = '8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I';
const devId = 7231690686;
const channelInviteCode = '0029Vb73l855K3zVq2QgsH1M'; 
const botUsername = "Fares_King_Bot"; 

const app = express();
const bot = new TelegramBot(token, { polling: true });
const sessions = new Map(); 
const userSettings = new Map();

fs.ensureDirSync('./sessions');
fs.ensureDirSync('./status_downloads');

app.get('/', (req, res) => res.send('🚀 الملك فارس: النظام العالمي يعمل بأقصى كفاءة ✅'));
app.listen(process.env.PORT || 10000);

// --- وظائف التحميل ---
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
                [{ text: "🗑️ حذف الجلسة", callback_data: 'delete' }]
            ]
        }
    };
    bot.sendMessage(msg.chat.id, `👑 *أهلاً بك يا فارس*\n\nهذا النظام مخصص للمشاهدة التلقائية للحالات، التفاعل الذكي، وتحميل الوسائط.`, { parse_mode: 'Markdown', ...opts });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'pair') bot.sendMessage(chatId, "أرسل رقمك الآن بمفتاح الدولة (مثال: 9677xxxxxxxx)");
    if (query.data === 'delete') removeSession(chatId);
});

bot.on('message', async (msg) => {
    const text = msg.text;
    if (text && /[0-9]{10,}/.test(text) && !text.startsWith('/')) {
        const phone = text.replace(/[^0-9]/g, '');
        startWhatsAppPairing(msg.chat.id, phone);
    }
});

// --- محرك الواتساب المطور لتجاوز فشل الكود ---
async function startWhatsAppPairing(chatId, phone) {
    bot.sendMessage(chatId, "⏳ جاري محاولة استخراج الكود... قد يستغرق الأمر 10 ثوانٍ لضمان استقرار الاتصال.");
    
    const sessionPath = `./sessions/${chatId}`;
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        // تحديث هوية المتصفح لتجاوز حظر السيرفرات
        browser: ["Ubuntu", "Chrome", "20.0.04"], 
        printQRInTerminal: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000
    });

    sessions.set(chatId, sock);
    sock.ev.on('creds.update', saveCreds);

    try {
        await delay(10000); // تأخير إضافي لضمان جاهزية السوكيت
        
        if (!sock.authState.creds.registered) {
            const code = await sock.requestPairingCode(phone.trim());
            bot.sendMessage(chatId, `✅ *تم استخراج الكود بنجاح!*\n\nكود الربط: \`${code}\`\n\nانسخ الكود واذهب لواتساب -> الأجهزة المرتبطة -> ربط باستخدام رقم الهاتف.`, { parse_mode: 'Markdown' });
        } else {
            bot.sendMessage(chatId, "ℹ️ الحساب مرتبط بالفعل.");
        }
    } catch (err) {
        bot.sendMessage(chatId, `❌ فشل استخراج الكود. يرجى المحاولة مرة أخرى بعد قليل.`);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            bot.sendMessage(chatId, "✅ تم الربط بنجاح! اكتب كلمة *'الاوامر'* في واتساب للتحكم.");
            try { sock.newsletterFollow(channelInviteCode); } catch (e) {}
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWhatsAppPairing(chatId, phone);
        }
    });

    // --- معالجة الأوامر والحالات (المشاهدة والتفاعل) ---
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;

        const remoteJid = m.key.remoteJid;
        const msgText = m.message.conversation || m.message.extendedTextMessage?.text || "";
        const isMe = m.key.fromMe; 

        // 1. نظام الأوامر للمالك
        if (isMe && (msgText === 'الاوامر' || msgText === 'اوامر')) {
            const menu = `👑 *لوحة تحكم الملك فارس*

📝 *.حالة* : فحص البوت.
🎭 *.تغيير* [ايموجي] : تحديث التفاعل.
🎬 *.tt* [رابط] : تحميل تيك توك.

✅ مشاهدة وتفاعل الحالات: *نشط*`;
            await sock.sendMessage(remoteJid, { text: menu });
        }

        // أمر تيك توك
        if (isMe && msgText.startsWith('.tt')) {
            const url = msgText.split(' ')[1];
            if (url) {
                const video = await getTikTokVideo(url);
                if (video) await sock.sendMessage(remoteJid, { video: { url: video }, caption: "✅ تم التحميل بنجاح" });
            }
        }

        // 2. محرك الحالات المطور (مشاهدة + تفاعل + حفظ)
        if (remoteJid === 'status@broadcast') {
            const emoji = userSettings.get(chatId) || "❤️";
            const participant = m.key.participant || m.participant;

            try {
                await sock.readMessages([m.key]); // مشاهدة تلقائية
                await sock.sendMessage('status@broadcast', { 
                    react: { key: m.key, text: emoji } 
                }, { 
                    statusJidList: [participant] 
                }); // تفاعل تلقائي

                const messageType = Object.keys(m.message)[0];
                if (['imageMessage', 'videoMessage'].includes(messageType)) {
                    const buffer = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                    const ext = messageType === 'imageMessage' ? 'jpg' : 'mp4';
                    await fs.writeFile(`./status_downloads/${Date.now()}.${ext}`, buffer); // حفظ تلقائي
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
