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
const path = require('path');

// --- الإعدادات الأساسية (تأكد من تعديل الـ ADMIN_ID) ---
const token = '8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I';
const ADMIN_ID = 7231690686; // ضع معرفك هنا لفتح لوحة التحكم
const CHANNEL_USER = "@fz_z_Z"; // القناة الخاصة بك
const app = express();
app.use(express.json());
const bot = new TelegramBot(token, { polling: true });
const sessions = new Map();

// تأمين المجلدات
const SESSIONS_DIR = './sessions';
fs.ensureDirSync(SESSIONS_DIR);

// --- نظام الإعدادات ---
const getDefaultSettings = () => ({
    name: "GOLDEN QUEEN",
    emoji: "👑",
    autoViewStatus: true,
    autoReactStatus: true,
    autoSaveStatus: false,
    alwaysOnline: true,
    autoReplies: [],
    mode: "public"
});

const getUserConfigPath = (chatId) => path.join(SESSIONS_DIR, String(chatId), 'settings.json');

const getUserSettings = (chatId) => {
    const filePath = getUserConfigPath(chatId);
    if (fs.existsSync(filePath)) {
        return { ...getDefaultSettings(), ...fs.readJsonSync(filePath) };
    }
    const defaults = getDefaultSettings();
    fs.ensureDirSync(path.dirname(filePath));
    fs.writeJsonSync(filePath, defaults);
    return defaults;
};

const saveUserSettings = (chatId, data) => {
    const current = getUserSettings(chatId);
    fs.writeJsonSync(getUserConfigPath(chatId), { ...current, ...data });
};

// --- وظيفة التحقق من الاشتراك (تم تصحيحها) ---
async function checkSub(chatId) {
    try {
        const member = await bot.getChatMember(CHANNEL_USER, chatId);
        return ['member', 'administrator', 'creator'].includes(member.status);
    } catch (e) { 
        console.error("خطأ في فحص القناة: تأكد من رفع البوت مشرفاً في القناة.");
        return false; 
    }
}

// --- محرك واتساب ---
async function startBot(chatId, phone) {
    const sessionDir = path.join(SESSIONS_DIR, String(chatId));
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        auth: state,
        version,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu("Chrome"),
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000
    });

    sessions.set(chatId, sock);

    if (!sock.authState.creds.registered) {
        await delay(3000);
        try {
            const code = await sock.requestPairingCode(phone);
            bot.sendMessage(chatId, `✅ كود الربط الخاص بك:\n\n\`${code}\`\n\nقم بفتح واتساب > الأجهزة المرتبطة > ربط هاتف > أدخل الكود.`, { parse_mode: 'Markdown' });
        } catch (e) {
            bot.sendMessage(chatId, "❌ فشل طلب الكود. تأكد من صحة الرقم والمحاولة لاحقاً.");
        }
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        const config = getUserSettings(chatId);

        if (connection === 'open') {
            bot.sendMessage(chatId, "🔓 تم الاتصال بنجاح! حسابك نشط الآن.");
            if (config.alwaysOnline) await sock.sendPresenceUpdate('available');
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot(chatId, phone);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const config = getUserSettings(chatId);
        const remoteJid = m.key.remoteJid;
        const msgText = m.message.conversation || m.message.extendedTextMessage?.text || "";

        // التعامل مع الحالات
        if (remoteJid === 'status@broadcast') {
            if (config.autoViewStatus) await sock.readMessages([m.key]);
            if (config.autoReactStatus) {
                await sock.sendMessage('status@broadcast', { react: { key: m.key, text: config.emoji } }, { statusJidList: [m.key.participant] });
            }
            return;
        }

        // الردود التلقائية
        const reply = config.autoReplies.find(r => r.key.toLowerCase() === msgText.toLowerCase());
        if (reply) await sock.sendMessage(remoteJid, { text: reply.res });
    });
}

// --- أوامر التليجرام ---

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const isSub = await checkSub(chatId);
    
    if (!isSub) {
        return bot.sendMessage(chatId, `⚠️ عذراً! يجب عليك الاشتراك في قناة البوت أولاً:\n\n🔗 ${CHANNEL_USER}\n\nبعد الاشتراك، أرسل /start مجدداً.`);
    }

    bot.sendMessage(chatId, `👋 أهلاً بك في نظام *GOLDEN QUEEN*\n\nأرسل رقم هاتفك مع مفتاح الدولة (مثل: 9677xxxxxxx) لبدء الربط.`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "⚙️ إعدادات الحساب", callback_data: "manage_settings" }],
                [{ text: "➕ إضافة رد تلقائي", callback_data: "add_reply_step" }]
            ]
        }
    });
});

bot.onText(/\/admin/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    bot.sendMessage(msg.chat.id, "👨‍💻 لوحة المطور", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📊 إحصائيات", callback_data: "stats" }],
                [{ text: "📢 إذاعة", callback_data: "broadcast_all" }]
            ]
        }
    });
});

// معالجة الأزرار
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const config = getUserSettings(chatId);

    if (data === "stats") {
        const users = fs.readdirSync(SESSIONS_DIR).filter(f => fs.lstatSync(path.join(SESSIONS_DIR, f)).isDirectory()).length;
        bot.sendMessage(chatId, `📊 عدد المستخدمين: ${users}\n⏱️ وقت التشغيل: ${Math.floor(process.uptime()/60)} دقيقة`);
    }

    if (data === "manage_settings") {
        bot.sendMessage(chatId, `🛠 إعداداتك:\n\n• مشاهدة الحالات: ${config.autoViewStatus ? "✅" : "❌"}\n• تفاعل الحالات: ${config.autoReactStatus ? "✅" : "❌"}\n• متصل دائماً: ${config.alwaysOnline ? "✅" : "❌"}`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "مشاهدة الحالات", callback_data: "toggle_autoViewStatus" }],
                    [{ text: "تفاعل الحالات", callback_data: "toggle_autoReactStatus" }],
                    [{ text: "متصل دائماً", callback_data: "toggle_alwaysOnline" }]
                ]
            }
        });
    }

    if (data.startsWith("toggle_")) {
        const field = data.replace("toggle_", "");
        saveUserSettings(chatId, { [field]: !config[field] });
        bot.answerCallbackQuery(query.id, { text: "تم التحديث ✅" });
    }

    if (data === "add_reply_step") {
        bot.sendMessage(chatId, "أرسل الكلمة التي تريد الرد عليها:");
        bot.once('message', (k) => {
            bot.sendMessage(chatId, "أرسل نص الرد:");
            bot.once('message', (r) => {
                const reps = config.autoReplies;
                reps.push({ key: k.text, res: r.text });
                saveUserSettings(chatId, { autoReplies: reps });
                bot.sendMessage(chatId, "✅ تم الحفظ.");
            });
        });
    }
});

// استقبال الرقم (تم تصحيح القناة هنا أيضاً)
bot.on('message', async (msg) => {
    if (msg.text && /^[0-9]{10,}$/.test(msg.text.replace('+', ''))) {
        const isSub = await checkSub(msg.chat.id);
        if (!isSub) {
            return bot.sendMessage(msg.chat.id, `⚠️ يجب الاشتراك أولاً في القناة:\n🔗 ${CHANNEL_USER}`);
        }
        bot.sendMessage(msg.chat.id, "⏳ جاري طلب كود الربط...");
        startBot(msg.chat.id, msg.text.replace(/[^0-9]/g, ''));
    }
});

app.get('/', (req, res) => res.send("Bot Online ✅"));
app.listen(process.env.PORT || 10000);
