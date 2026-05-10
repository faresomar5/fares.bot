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
const ADMIN_ID = 544321234; // تأكد أن هذا هو معرفك الصحيح في تليجرام
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

// --- التحقق من الاشتراك الإجباري ---
async function checkSub(chatId) {
    try {
        const member = await bot.getChatMember(CHANNEL_USER, chatId);
        return ['member', 'administrator', 'creator'].includes(member.status);
    } catch { return false; }
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
        printQRInTerminal: false,
        syncFullHistory: false,
        markOnlineOnConnect: true
    });

    sessions.set(chatId, sock);

    if (!sock.authState.creds.registered) {
        await delay(3000);
        try {
            const code = await sock.requestPairingCode(phone);
            bot.sendMessage(chatId, `✅ تم توليد كود الربط:\n\n\`${code}\``, { parse_mode: 'Markdown' });
        } catch (e) {
            bot.sendMessage(chatId, "❌ خطأ في طلب الكود.");
        }
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            bot.sendMessage(chatId, "🔓 متصل الآن! سيتم التفاعل مع الحالات فوراً.");
            await sock.sendPresenceUpdate('available');
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
        const msgText = (m.message.conversation || m.message.extendedTextMessage?.text || "").trim();

        if (remoteJid === 'status@broadcast') {
            const user = m.key.participant || m.key.remoteJid;
            if (config.autoViewStatus) await sock.readMessages([m.key]);
            if (config.autoReactStatus) {
                await sock.sendMessage('status@broadcast', { react: { key: m.key, text: config.emoji } }, { statusJidList: [user] });
            }
            return;
        }

        if (msgText === 'فحص') {
            await sock.sendMessage(remoteJid, { text: `✅ البوت متصل ونشط.\nالإيموجي: ${config.emoji}` }, { quoted: m });
        }

        const reply = config.autoReplies.find(r => r.key.toLowerCase() === msgText.toLowerCase());
        if (reply && !m.key.fromMe) {
            await sock.sendMessage(remoteJid, { text: reply.res }, { quoted: m });
        }
    });
}

// --- أوامر تليجرام ---

bot.onText(/\/start/, async (msg) => {
    const isSub = await checkSub(msg.chat.id);
    if (!isSub) return bot.sendMessage(msg.chat.id, `⚠️ يجب الاشتراك أولاً:\n🔗 ${CHANNEL_USER}`);

    bot.sendMessage(msg.chat.id, `👋 أهلاً بك في نظام الرد الآلي والتفاعل.\nارسل رقمك للربط أو استخدم القائمة:`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "⚙️ الإعدادات", callback_data: "settings" }],
                [{ text: "➕ إضافة رد تلقائي", callback_data: "add_reply_logic" }]
            ]
        }
    });
});

// --- إصلاح أمر المطور ---
bot.onText(/\/admin/, async (msg) => {
    if (msg.from.id !== ADMIN_ID) return bot.sendMessage(msg.chat.id, "❌ أنت لست المطور.");
    
    const folders = fs.readdirSync(SESSIONS_DIR).filter(f => fs.lstatSync(path.join(SESSIONS_DIR, f)).isDirectory()).length;
    bot.sendMessage(msg.chat.id, `👨‍💻 *لوحة تحكم المطور*\n\n📊 عدد الأرقام المربوطة: ${folders}\n⏱ وقت التشغيل: ${Math.floor(process.uptime() / 60)} دقيقة`, { parse_mode: 'Markdown' });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    let config = getUserSettings(chatId);

    if (data === "settings") {
        bot.sendMessage(chatId, `🛠 إعداداتك:\nإيموجي: ${config.emoji}\nمشاهدة: ${config.autoViewStatus ? "✅" : "❌"}\nتفاعل: ${config.autoReactStatus ? "✅" : "❌"}`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📝 تغيير الإيموجي", callback_data: "change_emoji" }],
                    [{ text: "تبديل المشاهدة", callback_data: "t_autoViewStatus" }],
                    [{ text: "تبديل التفاعل", callback_data: "t_autoReactStatus" }]
                ]
            }
        });
    }

    // --- إصلاح منطق إضافة رد ---
    if (data === "add_reply_logic") {
        bot.sendMessage(chatId, "📌 ارسل الكلمة المفتاحية (مثال: سلام):");
        bot.once('message', (msgKey) => {
            if (msgKey.chat.id !== chatId) return;
            const keyText = msgKey.text;
            bot.sendMessage(chatId, `✅ تم استلام الكلمة: *${keyText}*\nالآن ارسل نص الرد الذي تريده:`, {parse_mode: 'Markdown'});
            bot.once('message', (msgVal) => {
                if (msgVal.chat.id !== chatId) return;
                const replies = config.autoReplies;
                replies.push({ key: keyText, res: msgVal.text });
                saveUserSettings(chatId, { autoReplies: replies });
                bot.sendMessage(chatId, "✅ تم حفظ الرد التلقائي بنجاح!");
            });
        });
    }

    if (data === "change_emoji") {
        bot.sendMessage(chatId, "ارسل الإيموجي الجديد:");
        bot.once('message', (msg) => {
            if (msg.chat.id === chatId && msg.text) {
                saveUserSettings(chatId, { emoji: msg.text.trim() });
                bot.sendMessage(chatId, `✅ تم التحديث إلى: ${msg.text}`);
            }
        });
    }

    if (data.startsWith("t_")) {
        const field = data.replace("t_", "");
        saveUserSettings(chatId, { [field]: !config[field] });
        bot.answerCallbackQuery(query.id, { text: "تم التحديث ✅" });
    }
});

bot.on('message', async (msg) => {
    // التحقق من الأرقام للربط
    if (msg.text && /^[0-9]{10,}$/.test(msg.text.replace('+', ''))) {
        const isSub = await checkSub(msg.chat.id);
        if (!isSub) return bot.sendMessage(msg.chat.id, `⚠️ اشترك أولاً: ${CHANNEL_USER}`);
        bot.sendMessage(msg.chat.id, "⏳ جاري طلب الكود...");
        startBot(msg.chat.id, msg.text.replace(/[^0-9]/g, ''));
    }
});

app.get('/', (req, res) => res.send("Active ✅"));
app.listen(process.env.PORT || 10000);
