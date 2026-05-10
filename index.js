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
const ADMIN_ID = 544321234; // ضع معرفك هنا
const CHANNEL_USER = "@fz_z_Z"; 
const app = express();
app.use(express.json());
const bot = new TelegramBot(token, { polling: true });
const sessions = new Map();

const SESSIONS_DIR = './sessions';
fs.ensureDirSync(SESSIONS_DIR);

// --- إدارة الإعدادات لكل مستخدم ---
const getDefaultSettings = () => ({
    name: "GOLDEN QUEEN",
    emoji: "👑",
    autoViewStatus: true,
    autoReactStatus: true,
    alwaysOnline: true,
    autoReplies: []
});

const getUserSettings = (chatId) => {
    const filePath = path.join(SESSIONS_DIR, String(chatId), 'settings.json');
    if (fs.existsSync(filePath)) {
        return { ...getDefaultSettings(), ...fs.readJsonSync(filePath) };
    }
    return getDefaultSettings();
};

const saveUserSettings = (chatId, data) => {
    const sessionPath = path.join(SESSIONS_DIR, String(chatId));
    fs.ensureDirSync(sessionPath);
    const current = getUserSettings(chatId);
    fs.writeJsonSync(path.join(sessionPath, 'settings.json'), { ...current, ...data });
};

// --- التحقق من الاشتراك ---
async function checkSub(chatId) {
    try {
        const member = await bot.getChatMember(CHANNEL_USER, chatId);
        return ['member', 'administrator', 'creator'].includes(member.status);
    } catch { return false; }
}

// --- محرك واتساب المطور لعدم التوقف ---
async function startBot(chatId, phone) {
    const sessionDir = path.join(SESSIONS_DIR, String(chatId));
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        auth: state,
        version,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu("Chrome"),
        printQRInTerminal: false,
        syncFullHistory: false,
        defaultQueryTimeoutMs: undefined,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000 
    });

    sessions.set(chatId, sock);

    if (!sock.authState.creds.registered) {
        await delay(3000);
        try {
            const code = await sock.requestPairingCode(phone);
            bot.sendMessage(chatId, `✅ تم توليد كود الربط:\n\n\`${code}\``, { parse_mode: 'Markdown' });
        } catch (e) {
            bot.sendMessage(chatId, "❌ خطأ في طلب الكود، حاول مجدداً.");
        }
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        const config = getUserSettings(chatId);

        if (connection === 'open') {
            bot.sendMessage(chatId, "🔓 تم الاتصال بنجاح! التفاعل مع الحالات نشط الآن.");
            if (config.alwaysOnline) {
                await sock.sendPresenceUpdate('available');
                setInterval(async () => {
                    if (sessions.has(chatId)) await sock.sendPresenceUpdate('available');
                }, 30000);
            }
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

        if (remoteJid === 'status@broadcast') {
            const participant = m.key.participant || m.key.remoteJid;
            if (config.autoViewStatus) await sock.readMessages([m.key]);
            if (config.autoReactStatus) {
                await sock.sendMessage('status@broadcast', { 
                    react: { key: m.key, text: config.emoji } 
                }, { statusJidList: [participant] });
            }
            return;
        }

        const msgText = (m.message.conversation || m.message.extendedTextMessage?.text || "").toLowerCase();
        const reply = config.autoReplies.find(r => r.key.toLowerCase() === msgText);
        if (reply && !m.key.fromMe) {
            await sock.sendMessage(remoteJid, { text: reply.res });
        }
    });
}

// --- أوامر تليجرام ---

bot.onText(/\/start/, async (msg) => {
    const isSub = await checkSub(msg.chat.id);
    if (!isSub) return bot.sendMessage(msg.chat.id, `⚠️ اشترك أولاً:\n🔗 ${CHANNEL_USER}`);

    bot.sendMessage(msg.chat.id, `👋 أهلاً بك في GOLDEN QUEEN\nأرسل رقمك الآن للربط أو استخدم الإعدادات:`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "⚙️ الإعدادات", callback_data: "settings" }],
                [{ text: "➕ إضافة رد", callback_data: "add_reply" }]
            ]
        }
    });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    let config = getUserSettings(chatId);

    if (data === "settings") {
        const text = `⚙️ *إعداداتك الحالية*:\n\n• الإيموجي المستخدم: ${config.emoji}\n• مشاهدة الحالات: ${config.autoViewStatus ? "✅" : "❌"}\n• تفاعل الحالات: ${config.autoReactStatus ? "✅" : "❌"}\n• متصل دائماً: ${config.alwaysOnline ? "✅" : "❌"}`;
        bot.sendMessage(chatId, text, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📝 تغيير إيموجي التفاعل", callback_data: "change_emoji" }],
                    [{ text: "مشاهدة الحالات", callback_data: "t_autoViewStatus" }, { text: "تفاعل الحالات", callback_data: "t_autoReactStatus" }],
                    [{ text: "متصل دائماً", callback_data: "t_alwaysOnline" }]
                ]
            }
        });
    }

    // منطق تغيير الإيموجي
    if (data === "change_emoji") {
        bot.sendMessage(chatId, "ارسل الإيموجي الجديد الذي تريد استخدامه للتفاعل:");
        bot.once('message', (msg) => {
            if (msg.text) {
                saveUserSettings(chatId, { emoji: msg.text.trim() });
                bot.sendMessage(chatId, `✅ تم تغيير إيموجي التفاعل إلى: ${msg.text}`);
            }
        });
    }

    if (data.startsWith("t_")) {
        const key = data.replace("t_", "");
        saveUserSettings(chatId, { [key]: !config[key] });
        bot.answerCallbackQuery(query.id, { text: "تم التحديث ✅" });
    }
});

bot.on('message', async (msg) => {
    if (msg.text && /^[0-9]{10,}$/.test(msg.text.replace('+', ''))) {
        const isSub = await checkSub(msg.chat.id);
        if (!isSub) return bot.sendMessage(msg.chat.id, `⚠️ اشترك في ${CHANNEL_USER}`);
        bot.sendMessage(msg.chat.id, "⏳ جاري طلب الكود...");
        startBot(msg.chat.id, msg.text.replace(/[^0-9]/g, ''));
    }
});

app.get('/', (req, res) => res.send("System Active ✅"));
app.listen(process.env.PORT || 10000);
