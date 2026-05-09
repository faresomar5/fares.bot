const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestBaileysVersion, 
    DisconnectReason 
} = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// --- الإعدادات الأساسية ---
const token = '8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I';
const devId = 7231690686;
const channelUrl = 'https://whatsapp.com/channel/0029Vb73l855K3zVq2QgsH1M';

const bot = new TelegramBot(token, { polling: true });
const sessions = new Map(); // لتخزين جلسات الواتساب النشطة لكل مستخدم
const userEmojis = new Map(); // لتخزين إيموجي كل مستخدم

// التأكد من وجود مجلد الجلسات
if (!fs.existsSync('./sessions')) fs.mkdirSync('./sessions');

// --- أوامر التلجرام ---

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🚀 ربط رقم جديد", callback_data: 'pair_new' }],
                [{ text: "💤 تغيير إيموجي التفاعل", callback_data: 'change_emoji' }],
                [{ text: "📊 معرفة الجلسات المسجلة", callback_data: 'list_sessions' }],
                [{ text: "🗑️ حذف الجلسات", callback_data: 'delete_sessions' }]
            ]
        }
    };
    bot.sendMessage(chatId, `مرحباً بك في بوت الملك فارس 👑\nيمكنك ربط رقمك بالواتساب والاستمتاع بمميزات البوت.`, opts);
});

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'pair_new') {
        bot.sendMessage(chatId, "أرسل الآن رقم هاتفك مع مفتاح الدولة (مثال: 967773987296)");
    } 
    else if (data === 'change_emoji') {
        bot.sendMessage(chatId, "أرسل الإيموجي الجديد الذي تريد استخدامه للتفاعل مع الحالات:");
    }
    else if (data === 'list_sessions') {
        const userSessionPath = `./sessions/${chatId}`;
        if (fs.existsSync(userSessionPath)) {
            bot.sendMessage(chatId, "✅ لديك جلسة نشطة مسجلة في السيرفر.");
        } else {
            bot.sendMessage(chatId, "❌ لا توجد جلسات مسجلة لك حالياً.");
        }
    }
    else if (data === 'delete_sessions') {
        deleteUserSession(chatId);
    }
});

// التعامل مع الرسائل النصية (رقم الهاتف أو الإيموجي)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text.startsWith('/') ) return;

    // إذا كان المدخل إيموجي (طول بسيط)
    if (text.length <= 5 && !/[0-9]/.test(text)) {
        userEmojis.set(chatId, text);
        return bot.sendMessage(chatId, `✅ تم تحديث إيموجي التفاعل إلى: ${text}`);
    }

    // إذا كان المدخل رقم هاتف
    if (/[0-9]{10,}/.test(text)) {
        const phoneNumber = text.replace(/[^0-9]/g, '');
        startWhatsApp(chatId, phoneNumber);
    }
});

// --- وظيفة تشغيل الواتساب لكل مستخدم ---

async function startWhatsApp(chatId, phoneNumber) {
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

    // طلب كود الربط
    try {
        setTimeout(async () => {
            if (!sock.authState.creds.registered) {
                const code = await sock.requestPairingCode(phoneNumber);
                bot.sendMessage(chatId, `كود الربط الخاص بك هو:\n\n\`${code}\``, { parse_mode: 'Markdown' });
                
                // مهلة الـ 60 ثانية
                setTimeout(() => {
                    if (!sock.authState.creds.registered) {
                        bot.sendMessage(chatId, "⚠️ انتهت مهلة الربط (60 ثانية). حاول مرة أخرى إذا لم يتم الربط.");
                    }
                }, 60000);
            }
        }, 3000);
    } catch (e) {
        bot.sendMessage(chatId, "❌ حدث خطأ أثناء طلب الكود. تأكد من الرقم.");
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
            bot.sendMessage(chatId, "🎉 تم الربط بنجاح! البوت يعمل الآن على حسابك.");
            
            // الانضمام لقناة الواتساب تلقائياً
            try {
                const code = channelUrl.split('/').pop();
                await sock.newsletterFollow(code);
            } catch (e) { console.log("خطأ في الانضمام للقناة"); }
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWhatsApp(chatId, phoneNumber);
            else deleteUserSession(chatId);
        }
    });

    // التفاعل مع الحالات
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (m.key.remoteJid === 'status@broadcast') {
            const emoji = userEmojis.get(chatId) || "💤";
            await delay(Math.floor(Math.random() * 7000) + 8000);
            await sock.readMessages([m.key]);
            await sock.sendMessage(m.key.remoteJid, { react: { key: m.key, text: emoji } }, { statusJidList: [m.key.participant] });
        }
    });
}

function deleteUserSession(chatId) {
    const sessionPath = `./sessions/${chatId}`;
    if (sessions.has(chatId)) {
        sessions.get(chatId).logout();
        sessions.delete(chatId);
    }
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        bot.sendMessage(chatId, "🗑️ تم حذف جلستك وتسجيل الخروج بنجاح.");
    } else {
        bot.sendMessage(chatId, "ℹ️ لا توجد جلسة نشطة لحذفها.");
    }
}

console.log("👑 بوت الملك فارس يعمل الآن على التلجرام...");
