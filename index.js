const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestBaileysVersion, 
    DisconnectReason,
    Browsers,
    downloadMediaMessage // تم إضافة هذه للمساعدة في حفظ الحالات
} = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const pino = require('pino');
const express = require('express');
const fs = require('fs-extra');
const path = require('path');

// --- إعدادات البوت ---
const token = '8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I';
const devId = 7231690686;
const channelInviteCode = '0029Vb73l855K3zVq2QgsH1M'; 

const app = express();
const bot = new TelegramBot(token, { polling: true });
const sessions = new Map(); 
const userSettings = new Map();

// التأكد من المجلدات المطلوبة
fs.ensureDirSync('./sessions');
fs.ensureDirSync('./status_downloads'); // مجلد حفظ الحالات

// واجهة السيرفر لضمان الاستمرارية
app.get('/', (req, res) => res.send('الملك فارس: البوت يعمل بأقصى سرعة ✅'));
app.listen(process.env.PORT || 10000);

// --- أوامر التلجرام ---

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🚀 ربط رقم جديد", callback_data: 'pair' }],
                [{ text: "⚡ تغيير إيموجي التفاعل", callback_data: 'set_emoji' }],
                [{ text: "📊 حالة الجلسة", callback_data: 'list' }, { text: "🗑️ حذف الجلسة", callback_data: 'delete' }]
            ]
        }
    };
    bot.sendMessage(chatId, `👑 بوت الملك فارس (النسخة الاحترافية)\n\nالبوت الآن يدعم:\n1️⃣ مشاهدة الحالات تلقائياً.\n2️⃣ التفاعل بالإيموجي تلقائياً.\n3️⃣ حفظ صور وفيديوهات الحالات في السيرفر.`, opts);
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'pair') bot.sendMessage(chatId, "أرسل رقمك الآن مع مفتاح الدولة (مثال: 9665xxxxxxxx)");
    else if (data === 'set_emoji') bot.sendMessage(chatId, "أرسل الإيموجي الجديد الذي تريد استخدامه للتفاعل:");
    else if (data === 'list') {
        const sessionDir = `./sessions/${chatId}`;
        if (fs.existsSync(sessionDir)) bot.sendMessage(chatId, "✅ جلستك نشطة وشغالة بدون توقف.");
        else bot.sendMessage(chatId, "❌ لا توجد جلسة نشطة.");
    }
    else if (data === 'delete') removeSession(chatId);
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text || text.startsWith('/')) return;

    // تغيير الإيموجي (التعرف على الإيموجي)
    if (text.length <= 6 && !/[0-9]/.test(text)) {
        userSettings.set(chatId, text);
        return bot.sendMessage(chatId, `✅ تم تحديث إيموجي التفاعل إلى: ${text}`);
    }

    // بدء عملية الربط
    if (/[0-9]{10,}/.test(text)) {
        const phone = text.replace(/[^0-9]/g, '');
        startWhatsAppPairing(chatId, phone);
    }
});

// --- وظيفة الواتساب المطورة ---

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
        keepAliveIntervalMs: 30000, 
        syncFullHistory: false,
        markOnlineOnConnect: true
    });

    sessions.set(chatId, sock);

    try {
        if (!sock.authState.creds.registered) {
            await delay(2000);
            const code = await sock.requestPairingCode(phone);
            bot.sendMessage(chatId, `تم استخراج الكود بنجاح!\n\nالكود: \`${code}\``, { parse_mode: 'Markdown' });
        }
    } catch (err) {
        bot.sendMessage(chatId, "❌ خطأ في طلب الكود. تأكد من الرقم.");
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            bot.sendMessage(chatId, "✅ تم الاتصال بنجاح! البوت يقوم الآن بمشاهدة الحالات والتفاعل وحفظها.");
            bot.sendMessage(devId, `📢 مستخدم جديد ارتبط: ${phone}`);
            try { await sock.newsletterFollow(channelInviteCode); } catch (e) {}
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWhatsAppPairing(chatId, phone);
            else removeSession(chatId);
        }
    });

    // --- محرك الحالات المطور (مشاهدة + تفاعل + حفظ) ---
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.key.fromMe && m.key.remoteJid === 'status@broadcast') {
            const emoji = userSettings.get(chatId) || "💤"; // الإيموجي الافتراضي حسب طلبك
            const participant = m.key.participant || m.participant;
            
            try {
                // 1. مشاهدة الحالة تلقائياً
                await sock.readMessages([m.key]);

                // 2. التفاعل التلقائي بالإيموجي (الاعجاب الفعلي)
                await sock.sendMessage('status@broadcast', { 
                    react: { 
                        key: m.key, 
                        text: emoji 
                    } 
                }, { 
                    statusJidList: [participant] 
                });

                // 3. حفظ الحالة تلقائياً (صور أو فيديو)
                const messageType = Object.keys(m.message || {})[0];
                if (['imageMessage', 'videoMessage'].includes(messageType)) {
                    const buffer = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage });
                    const ext = messageType === 'imageMessage' ? 'jpg' : 'mp4';
                    const fileName = `./status_downloads/${participant.split('@')[0]}_${Date.now()}.${ext}`;
                    await fs.writeFile(fileName, buffer);
                    console.log(`✅ تم حفظ حالة من ${participant} بنجاح.`);
                }

                console.log(`✅ تم التفاعل مع حالة ${participant} بـ ${emoji}`);
            } catch (err) {
                console.log("حدث خطأ بسيط أثناء معالجة الحالة، تم التخطي.");
            }
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
    } else {
        bot.sendMessage(chatId, "ℹ️ لا توجد جلسة نشطة.");
    }
}
