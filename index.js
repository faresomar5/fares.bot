
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestBaileysVersion, 
    DisconnectReason 
} = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const pino = require('pino');
const express = require('express');
const fs = require('fs');
const path = require('path');

// --- إعدادات البوت (تعديل مباشر) ---
const token = '8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I';
const devId = 7231690686;
const channelInviteCode = '0029Vb73l855K3zVq2QgsH1M'; // كود القناة من الرابط

const app = express();
const bot = new TelegramBot(token, { polling: true });
const sessions = new Map(); 
const userSettings = new Map(); // لتخزين الإيموجي المفضل لكل مستخدم

// التأكد من وجود مجلد الجلسات
if (!fs.existsSync('./sessions')) fs.mkdirSync('./sessions');

// --- واجهة بسيطة للسيرفر (لضمان بقائه يعمل على الاستضافة) ---
app.get('/', (req, res) => res.send('الملك فارس: البوت يعمل بنجاح ✅'));
app.listen(process.env.PORT || 10000);

// --- أوامر التلجرام ---

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeMsg = `👑 مرحباً بك في بوت الملك فارس\n\nهذا البوت يتيح لك ربط رقمك بالواتساب لمشاهدة الحالات تلقائياً والتفاعل معها.\n\nاستخدم الأزرار أدناه للتحكم:`;
    
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🚀 ربط رقم جديد", callback_data: 'pair' }],
                [{ text: "💤 تغيير إيموجي التفاعل", callback_data: 'set_emoji' }],
                [{ text: "📊 الجلسات النشطة", callback_data: 'list' }, { text: "🗑️ حذف الجلسة", callback_data: 'delete' }]
            ]
        }
    };
    bot.sendMessage(chatId, welcomeMsg, opts);
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'pair') {
        bot.sendMessage(chatId, "الآن، أرسل رقمك مع مفتاح الدولة\nمثال: 967773987296");
    } 
    else if (data === 'set_emoji') {
        bot.sendMessage(chatId, "أرسل الإيموجي الذي تريده (مثال: 🔥 أو ❤️)");
    }
    else if (data === 'list') {
        const sessionDir = `./sessions/${chatId}`;
        if (fs.existsSync(sessionDir)) {
            bot.sendMessage(chatId, "✅ لديك جلسة نشطة مسجلة.");
        } else {
            bot.sendMessage(chatId, "❌ لا توجد لديك جلسات حالياً.");
        }
    }
    else if (data === 'delete') {
        removeSession(chatId);
    }
});

// استقبال الرسائل النصية
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith('/')) return;

    // إذا أرسل إيموجي
    if (text.length <= 4 && !/[0-9]/.test(text)) {
        userSettings.set(chatId, text);
        return bot.sendMessage(chatId, `✅ تم اعتماد ${text} كإيموجي للتفاعل.`);
    }

    // إذا أرسل رقم هاتف
    if (/[0-9]{10,}/.test(text)) {
        const phone = text.replace(/[^0-9]/g, '');
        startWhatsAppPairing(chatId, phone);
    }
});

// --- وظائف الواتساب ---

async function startWhatsAppPairing(chatId, phone) {
    const sessionPath = `./sessions/${chatId}`;
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false
    });

    sessions.set(chatId, sock);

    // توليد كود الربط
    try {
        await delay(3000);
        if (!sock.authState.creds.registered) {
            const code = await sock.requestPairingCode(phone);
            bot.sendMessage(chatId, `تم استخراج الكود بنجاح! 🎉\n\nأدخل هذا الكود في واتساب:\n\n \`${code}\``, { parse_mode: 'Markdown' });

            // مؤقت 60 ثانية
            setTimeout(async () => {
                if (!sock.authState.creds.registered) {
                    bot.sendMessage(chatId, "⚠️ انتهت مهلة الربط (60 ثانية). يرجى المحاولة مرة أخرى.");
                }
            }, 60000);
        }
    } catch (err) {
        bot.sendMessage(chatId, "❌ فشل طلب الكود. تأكد أن الرقم صحيح وليس مربوطاً بجلسة أخرى.");
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            bot.sendMessage(chatId, "✅ تمت عملية الربط بنجاح! البوت الآن يتفاعل مع الحالات.");
            
            // 1. إرسال إشعار للمطور
            bot.sendMessage(devId, `📢 مستخدم جديد ربط بنجاح!\nالرقم: ${phone}\nالمستخدم: @${msg.from.username || chatId}`);

            // 2. الانضمام للقناة تلقائياً
            try {
                await sock.newsletterFollow(channelInviteCode);
            } catch (e) { console.log("خطأ في الانضمام للقناة"); }
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                startWhatsAppPairing(chatId, phone);
            } else {
                removeSession(chatId);
            }
        }
    });

    // التفاعل مع الحالات
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (m.key.remoteJid === 'status@broadcast') {
            const emoji = userSettings.get(chatId) || "💤";
            await delay(Math.floor(Math.random() * 5000) + 10000); // تأخير للحماية
            await sock.readMessages([m.key]);
            await sock.sendMessage(m.key.remoteJid, { react: { key: m.key, text: emoji } }, { statusJidList: [m.key.participant] });
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
        fs.rmSync(sessionDir, { recursive: true, force: true });
        bot.sendMessage(chatId, "🗑️ تم حذف الجلسة بنجاح من السيرفر والواتساب.");
    } else {
        bot.sendMessage(chatId, "ℹ️ لا توجد جلسة نشطة لحذفها.");
    }
}
