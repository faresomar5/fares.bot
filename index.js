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
const ADMIN_ID = 7231690686; // قم بتغييره إلى معرف التليجرام الخاص بك (المطور) لفتح لوحة التحكم
const CHANNEL_USER = "@fz_z_Z"; // القناة الجديدة المطلوبة
const app = express();
app.use(express.json());
const bot = new TelegramBot(token, { polling: true });
const sessions = new Map();

// تأمين المجلدات
const SESSIONS_DIR = './sessions';
fs.ensureDirSync(SESSIONS_DIR);

// --- نظام إدارة الإعدادات الذكي (لكل مستخدم) ---
const getDefaultSettings = () => ({
    name: "GOLDEN QUEEN",
    emoji: "👑",
    autoViewStatus: true,
    autoReactStatus: true,
    autoSaveStatus: false,
    alwaysOnline: true,
    autoReplies: [], // يدعم حتى 100 رد
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

// --- التحقق من الاشتراك الإجباري ---
async function checkSub(chatId) {
    try {
        const member = await bot.getChatMember(CHANNEL_USER, chatId);
        return ['member', 'administrator', 'creator'].includes(member.status);
    } catch { return false; }
}

// --- محرك واتساب (النسخة المستقرة) ---
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
            bot.sendMessage(chatId, `✅ تم توليد كود الربط الخاص بك:\n\n\`${code}\`\n\nقم بإدخاله في واتساب (الأجهزة المرتبطة > ربط برقم هاتف)`, { parse_mode: 'Markdown' });
        } catch (e) {
            bot.sendMessage(chatId, "❌ خطأ في طلب الكود، يرجى المحاولة مرة أخرى لاحقاً.");
        }
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        const config = getUserSettings(chatId);

        if (connection === 'open') {
            bot.sendMessage(chatId, "🔓 تم الاتصال بنجاح! الملكة الذهبية الآن تحت تصرفك.");
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

        // 1. إدارة الحالات (Status)
        if (remoteJid === 'status@broadcast') {
            if (config.autoViewStatus) await sock.readMessages([m.key]);
            if (config.autoReactStatus) {
                await sock.sendMessage('status@broadcast', { react: { key: m.key, text: config.emoji } }, { statusJidList: [m.key.participant] });
            }
            if (config.autoSaveStatus) {
                try {
                    const buffer = await downloadMediaMessage(m, 'buffer', {});
                    const savePath = `./sessions/${chatId}/saved_status/`;
                    fs.ensureDirSync(savePath);
                    fs.writeFileSync(path.join(savePath, `${Date.now()}.jpg`), buffer);
                } catch (e) { console.error("Error saving status"); }
            }
            return;
        }

        // 2. نظام الردود التلقائية
        const reply = config.autoReplies.find(r => r.key.toLowerCase() === msgText.toLowerCase());
        if (reply) {
            await sock.sendMessage(remoteJid, { text: reply.res });
        }
    });
}

// --- أوامر تليجرام ---

// رسالة /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const isSub = await checkSub(chatId);
    
    if (!isSub) {
        return bot.sendMessage(chatId, `⚠️ عذراً! يجب عليك الاشتراك في قناة البوت أولاً لتتمكن من استخدامه:\n\n🔗 ${CHANNEL_USER}\n\nبعد الاشتراك، أرسل /start مجدداً.`);
    }

    const welcome = `👋 أهلاً بك في نظام *GOLDEN QUEEN*\n\n` +
                    `أرسل رقم هاتفك الآن مع رمز الدولة (مثال: 967xxxxxxx) ليتم إرسال كود ربط واتساب إليك.\n\n` +
                    `استخدم الأزرار أدناه للتحكم في حسابك بعد الربط:`;
    
    bot.sendMessage(chatId, welcome, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "⚙️ إعدادات الحساب", callback_data: "manage_settings" }],
                [{ text: "➕ إضافة رد تلقائي", callback_data: "add_reply_step" }]
            ]
        }
    });
});

// أوامر المطور /admin
bot.onText(/\/admin/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return bot.sendMessage(msg.chat.id, "❌ هذا الأمر مخصص للمطور فقط.");
    
    bot.sendMessage(msg.chat.id, "👨‍💻 *لوحة تحكم المطور المركزية*", {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "📊 إحصائيات النظام", callback_data: "stats" }],
                [{ text: "📢 إذاعة عامة (برودكاست)", callback_data: "broadcast_all" }]
            ]
        }
    });
});

// معالجة ضغطات الأزرار (Callback Queries)
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const config = getUserSettings(chatId);

    // 📊 تصحيح وظيفة الإحصائيات
    if (data === "stats") {
        const folders = fs.readdirSync(SESSIONS_DIR);
        const usersCount = folders.filter(f => fs.lstatSync(path.join(SESSIONS_DIR, f)).isDirectory()).length;
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);

        const statsText = `📊 *إحصائيات النظام الحالية:*\n\n` +
                          `👥 عدد المستخدمين النشطين: ${usersCount}\n` +
                          `⏱️ وقت تشغيل السيرفر: ${hours} ساعة و ${minutes} دقيقة\n` +
                          `📡 حالة الاتصال: مستقرة ✅\n` +
                          `🧠 استهلاك الذاكرة: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`;
        
        bot.sendMessage(chatId, statsText, { parse_mode: 'Markdown' });
    }

    // إدارة الإعدادات
    if (data === "manage_settings") {
        const settingsText = `🛠 *إعدادات حسابك الحالي:*\n\n` +
                             `• إيموجي التفاعل: ${config.emoji}\n` +
                             `• مشاهدة الحالات: ${config.autoViewStatus ? "✅" : "❌"}\n` +
                             `• التفاعل مع الحالات: ${config.autoReactStatus ? "✅" : "❌"}\n` +
                             `• حفظ الحالات: ${config.autoSaveStatus ? "✅" : "❌"}\n` +
                             `• متصل دائماً: ${config.alwaysOnline ? "✅" : "❌"}`;
        
        bot.sendMessage(chatId, settingsText, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "تبديل مشاهدة الحالات", callback_data: "toggle_autoViewStatus" }],
                    [{ text: "تبديل تفاعل الحالات", callback_data: "toggle_autoReactStatus" }],
                    [{ text: "تبديل حفظ الحالات", callback_data: "toggle_autoSaveStatus" }],
                    [{ text: "تبديل (متصل دائماً)", callback_data: "toggle_alwaysOnline" }]
                ]
            }
        });
    }

    if (data.startsWith("toggle_")) {
        const field = data.replace("toggle_", "");
        saveUserSettings(chatId, { [field]: !config[field] });
        bot.answerCallbackQuery(query.id, { text: "تم تحديث الإعداد بنجاح ✅" });
        // لتحديث الرسالة بعد الضغط
        bot.deleteMessage(chatId, query.message.message_id);
    }

    if (data === "add_reply_step") {
        bot.sendMessage(chatId, "أرسل الكلمة المفتاحية (التي سيرسلها الشخص):");
        bot.once('message', (msgK) => {
            bot.sendMessage(chatId, `تم تحديد الكلمة: *${msgK.text}*\nالآن أرسل الرد الذي سيقوم البوت بإرساله:`, {parse_mode: 'Markdown'});
            bot.once('message', (msgR) => {
                const currentReplies = config.autoReplies;
                if (currentReplies.length >= 100) return bot.sendMessage(chatId, "❌ عذراً، لقد وصلت للحد الأقصى (100 رد).");
                currentReplies.push({ key: msgK.text, res: msgR.text });
                saveUserSettings(chatId, { autoReplies: currentReplies });
                bot.sendMessage(chatId, "✅ تم إضافة الرد التلقائي بنجاح!");
            });
        });
    }

    if (data === "broadcast_all") {
        bot.sendMessage(chatId, "أرسل الرسالة التي تريد إذاعتها لجميع مستخدمي البوت:");
        bot.once('message', (msgB) => {
            const users = fs.readdirSync(SESSIONS_DIR);
            users.forEach(u => {
                if (!isNaN(u)) bot.sendMessage(u, `📢 *رسالة من الإدارة:*\n\n${msgB.text}`, {parse_mode: 'Markdown'});
            });
            bot.sendMessage(chatId, "✅ تم إرسال البرودكاست بنجاح.");
        });
    }
});

// استقبال رقم الهاتف وبدء الربط
bot.on('message', async (msg) => {
    if (msg.text && /^[0-9]{10,}$/.test(msg.text.replace('+', ''))) {
        const isSub = await checkSub(msg.chat.id);
        if (!isSub) return bot.sendMessage(msg.chat.id, `⚠️ يجب الاشتراك في القناة أولاً: ${CHANNEL_USER}`);
        
        bot.sendMessage(msg.chat.id, "⏳ جاري تحضير كود الربط، انتظر قليلاً...");
        startBot(msg.chat.id, msg.text.replace(/[^0-9]/g, ''));
    }
});

// --- السيرفر (Dashboard) ---
app.get('/', (req, res) => res.send(`System ${getDefaultSettings().name} is Online ✅`));
app.listen(process.env.PORT || 10000);
