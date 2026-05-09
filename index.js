const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestBaileysVersion, 
    DisconnectReason,
    Browsers
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

// التأكد من مجلد الجلسات
fs.ensureDirSync('./sessions');

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
    bot.sendMessage(chatId, `👑 بوت الملك فارس (النسخة السريعة)\n\nالبوت مصمم ليبقى متصلاً 24/7 والتفاعل مع الحالات فورياً.`, opts);
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'pair') bot.sendMessage(chatId, "أرسل رقمك الآن مع مفتاح الدولة (بدون +)");
    else if (data === 'set_emoji') bot.sendMessage(chatId, "أرسل الإيموجي الجديد:");
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

    if (text.length <= 4 && !/[0-9]/.test(text)) {
        userSettings.set(chatId, text);
        return bot.sendMessage(chatId, `✅ تم تحديث الإيموجي إلى: ${text}`);
    }

    if (/[0-9]{10,}/.test(text)) {
        const phone = text.replace(/[^0-9]/g, '');
        startWhatsAppPairing(chatId, phone);
    }
});

// --- وظيفة الواتساب المطورة للثبات والسرعة ---

async function startWhatsAppPairing(chatId, phone) {
    const sessionPath = `./sessions/${chatId}`;
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.ubuntu("Chrome"), // لزيادة الثبات
        keepAliveIntervalMs: 30000, // نبضات قلب للحفاظ على الجلسة
        syncFullHistory: false,
        markOnlineOnConnect: true
    });

    sessions.set(chatId, sock);

    // طلب كود الربط
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
            bot.sendMessage(chatId, "✅ تم الاتصال! الرقم سيبقى شغالاً 24 ساعة بدون فصل.");
            bot.sendMessage(devId, `📢 مستخدم ربط بنجاح: ${phone}`);
            try { await sock.newsletterFollow(channelInviteCode); } catch (e) {}
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log("إعادة الاتصال التلقائي...");
                startWhatsAppPairing(chatId, phone);
            } else {
                removeSession(chatId);
            }
        }
    });

    // التفاعل الفوري مع الحالات (كل ثانية)
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (m.key.remoteJid === 'status@broadcast') {
            const emoji = userSettings.get(chatId) || "💤";
            
            // تأخير ثانية واحدة فقط (أسرع شيء ممكن)
            await delay(1000); 
            
            try {
                // قراءة الحالة
                await sock.readMessages([m.key]);
                
                // التفاعل بالإيموجي
                await sock.sendMessage(m.key.remoteJid, { 
                    react: { key: m.key, text: emoji } 
                }, { statusJidList: [m.key.participant] });
                
                console.log(`✅ تفاعل فوري مع حالة ${m.key.participant}`);
            } catch (err) {
                console.log("خطأ بسيط في التفاعل السريع، سيتم التخطي.");
            }
        }
    });
}

function removeSession(chatId) {
    if (sessions.has(chatId)) {
        sessions.get(chatId).logout();
        sessions.delete(chatId);
    }
    const sessionDir = `./sessions/${chatId}`;
    if (fs.existsSync(sessionDir)) {
        fs.removeSync(sessionDir);
        bot.sendMessage(chatId, "🗑️ تم حذف الجلسة وتسجيل الخروج.");
    } else {
        bot.sendMessage(chatId, "ℹ️ لا توجد جلسة لحذفها.");
    }
}
