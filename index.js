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

// --- الإعدادات الأساسية ---
const token = '8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I';
const ADMIN_ID = 544321234; // ضع معرف التليجرام الخاص بك هنا (المطور)
const CHANNEL_USER = "@YourChannel"; // يوزر قناتك للاشتراك الإجباري
const app = express();
const bot = new TelegramBot(token, { polling: true });
const sessions = new Map();

// تأمين المجلدات الرئيسية
const SESSIONS_DIR = './sessions';
fs.ensureDirSync(SESSIONS_DIR);

// --- إدارة إعدادات المستخدمين ---
const getDefaultSettings = () => ({
    name: "GOLDEN QUEEN",
    emoji: "👑",
    autoViewStatus: true,
    autoReactStatus: true,
    autoSaveStatus: false,
    alwaysOnline: true,
    autoReplies: [], // مصفوفة لتخزين الردود (حتى 100)
    mode: "public"
});

const getUserConfigPath = (chatId) => path.join(SESSIONS_DIR, String(chatId), 'settings.json');

const getUserSettings = (chatId) => {
    const filePath = getUserConfigPath(chatId);
    if (fs.existsSync(filePath)) return fs.readJsonSync(filePath);
    const defaults = getDefaultSettings();
    fs.ensureDirSync(path.dirname(filePath));
    fs.writeJsonSync(filePath, defaults);
    return defaults;
};

const saveUserSettings = (chatId, data) => {
    const current = getUserSettings(chatId);
    fs.writeJsonSync(getUserConfigPath(chatId), { ...current, ...data });
};

// --- التحقق من الاشتراك الإجباري ---
async function checkSub(chatId) {
    try {
        const member = await bot.getChatMember(CHANNEL_USER, chatId);
        return ['member', 'administrator', 'creator'].includes(member.status);
    } catch { return false; }
}

// --- محرك واتساب الذكي ---
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
        markOnlineOnConnect: false, // سنتحكم بها يدوياً
        connectTimeoutMs: 60000
    });

    sessions.set(chatId, sock);

    if (!sock.authState.creds.registered) {
        await delay(3000);
        try {
            const code = await sock.requestPairingCode(phone);
            bot.sendMessage(chatId, `✅ كود الربط الخاص بك هو:\n\n\`${code}\``, { parse_mode: 'Markdown' });
        } catch (e) {
            bot.sendMessage(chatId, "❌ فشل طلب الكود، تأكد من الرقم.");
        }
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        const config = getUserSettings(chatId);

        if (connection === 'open') {
            bot.sendMessage(chatId, "🔓 تم ربط الواتساب بنجاح! يمكنك الآن التحكم بالإعدادات.");
            if (config.alwaysOnline) await sock.sendPresenceUpdate('available');
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot(chatId, phone);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;

        const config = getUserSettings(chatId);
        const remoteJid = m.key.remoteJid;
        const isMe = m.key.fromMe;
        const msgText = m.message.conversation || m.message.extendedTextMessage?.text || "";

        // 1. معالجة الحالات (Status)
        if (remoteJid === 'status@broadcast') {
            if (config.autoViewStatus) await sock.readMessages([m.key]);
            if (config.autoReactStatus) {
                await sock.sendMessage('status@broadcast', { react: { key: m.key, text: config.emoji } }, { statusJidList: [m.key.participant] });
            }
            if (config.autoSaveStatus) {
                const buffer = await downloadMediaMessage(m, 'buffer', {});
                const fileName = `./sessions/${chatId}/status_saved/${Date.now()}.jpg`;
                fs.ensureDirSync(`./sessions/${chatId}/status_saved/`);
                fs.writeFileSync(fileName, buffer);
            }
        }

        // 2. الردود التلقائية (Auto Replies)
        if (!isMe && config.autoReplies.length > 0) {
            const reply = config.autoReplies.find(r => r.key.toLowerCase() === msgText.toLowerCase());
            if (reply) await sock.sendMessage(remoteJid, { text: reply.res });
        }

        // 3. أوامر الواتساب للمستخدم (Direct Control)
        if (isMe && msgText.startsWith('.')) {
            const cmd = msgText.slice(1).split(' ')[0];
            const arg = msgText.split(' ').slice(1).join(' ');

            if (cmd === 'ايموجي') {
                saveUserSettings(chatId, { emoji: arg });
                await sock.sendMessage(remoteJid, { text: `✅ تم تغيير إيموجي التفاعل إلى: ${arg}` });
            }
        }
    });
}

// --- أوامر تليجرام ---

// رسالة /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const welcomeMsg = `👋 أهلاً بك في نظام GOLDEN QUEEN\n\n` +
        `هذا البوت يتيح لك ربط واتساب الخاص بك والتحكم به آلياً.\n\n` +
        `⚙️ *الخيارات المتاحة لك:*\n` +
        `1️⃣ أرسل رقم هاتفك (بالصيغة الدولية) لبدء الربط.\n` +
        `2️⃣ استخدم القائمة أدناه لإدارة إعداداتك بعد الربط.`;
    
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🛠 إعدادات البوت", callback_data: "manage_settings" }],
                [{ text: "📝 إضافة رد تلقائي", callback_data: "add_reply" }]
            ]
        }
    };
    bot.sendMessage(chatId, welcomeMsg, opts);
});

// أمر المطور /admin
bot.onText(/\/admin/, async (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    
    const adminMsg = `👨‍💻 *لوحة تحكم المطور*\n\n` +
        `مرحباً بك يا مطور، يمكنك التحكم في النظام بشكل كامل من هنا.`;
    
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📢 إرسال إذاعة للكل", callback_data: "broadcast_all" }],
                [{ text: "📊 إحصائيات النظام", callback_data: "stats" }]
            ]
        }
    };
    bot.sendMessage(msg.chat.id, adminMsg, opts);
});

// معالجة الأزرار والعمليات
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const config = getUserSettings(chatId);

    if (data === "manage_settings") {
        const settingsText = `⚙️ *إعداداتك الحالية:*\n\n` +
            `• التفاعل: ${config.emoji}\n` +
            `• مشاهدة الحالات: ${config.autoViewStatus ? "✅" : "❌"}\n` +
            `• التفاعل مع الحالات: ${config.autoReactStatus ? "✅" : "❌"}\n` +
            `• حفظ الحالات: ${config.autoSaveStatus ? "✅" : "❌"}\n` +
            `• متصل دائماً: ${config.alwaysOnline ? "✅" : "❌"}`;
        
        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Toggle مشاهدة الحالات", callback_data: "toggle_view" }],
                    [{ text: "Toggle حفظ الحالات", callback_data: "toggle_save" }],
                    [{ text: "Toggle متصل دائماً", callback_data: "toggle_online" }]
                ]
            }
        };
        bot.sendMessage(chatId, settingsText, opts);
    }

    // منطق التبديل (Toggles)
    if (data.startsWith("toggle_")) {
        const field = data === "toggle_view" ? "autoViewStatus" : 
                      data === "toggle_save" ? "autoSaveStatus" : "alwaysOnline";
        saveUserSettings(chatId, { [field]: !config[field] });
        bot.answerCallbackQuery(query.id, { text: "تم التحديث بنجاح ✅" });
    }

    if (data === "broadcast_all" && chatId === ADMIN_ID) {
        bot.sendMessage(chatId, "ارسل الرسالة التي تريد إرسالها للجميع الآن:");
        bot.once('message', (m) => {
            const allUsers = fs.readdirSync(SESSIONS_DIR);
            allUsers.forEach(u => bot.sendMessage(u, `📢 *إعلان من المطور:*\n\n${m.text}`));
            bot.sendMessage(chatId, "✅ تم الإرسال للجميع.");
        });
    }
});

// استقبال أرقام الهواتف
bot.on('message', async (msg) => {
    if (msg.text && /^[0-9]{10,}$/.test(msg.text.replace('+', ''))) {
        const isSubbed = await checkSub(msg.chat.id);
        if (!isSubbed) {
            return bot.sendMessage(msg.chat.id, `⚠️ يجب عليك الاشتراك في القناة أولاً لاستخدام البوت:\n${CHANNEL_USER}`);
        }
        startBot(msg.chat.id, msg.text.replace(/[^0-9]/g, ''));
    }
});

// --- تشغيل السيرفر ---
app.get('/', (req, res) => res.send("System is Running..."));
app.listen(process.env.PORT || 10000, () => console.log("Server Started"));
