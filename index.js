const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestBaileysVersion, 
    DisconnectReason,
    Browsers,
    jidNormalizedUser
} = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const pino = require('pino');
const express = require('express');
const fs = require('fs-extra');
const axios = require('axios');

const token = '8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I';
const devId = 7231690686;
const MY_RENDER_URL = "https://fares-bot.onrender.com"; 

const app = express();
const bot = new TelegramBot(token, { polling: true });
const sessions = new Map(); 

fs.ensureDirSync('./sessions');

app.get('/', (req, res) => res.send('الملك فارس: البوت شغال ✅'));
app.listen(process.env.PORT || 10000);

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text) return;

    if (text === '/start') {
        return bot.sendMessage(chatId, "👑 بوت الملك فارس\n\nأرسل رقمك الآن لبدء الربط.");
    }

    if (/[0-9]{10,}/.test(text)) {
        const phone = text.replace(/[^0-9]/g, '');
        bot.sendMessage(chatId, "⏳ جاري توليد الكود...");
        startWhatsAppPairing(chatId, phone);
    }
});

async function startWhatsAppPairing(chatId, phone) {
    const sessionPath = `./sessions/${chatId}`;
    if (fs.existsSync(sessionPath)) await fs.remove(sessionPath);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS("Chrome"),
        markOnlineOnConnect: true
    });

    sessions.set(chatId, sock);
    sock.ev.on('creds.update', saveCreds);

    try {
        await delay(5000);
        const code = await sock.requestPairingCode(phone);
        bot.sendMessage(chatId, `✅ كود الربط:\n\n \`${code}\``, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(chatId, "❌ فشل طلب الكود، حاول مجدداً.");
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            bot.sendMessage(chatId, "🎊 تم تسجيل الدخول بنجاح!");
            await sock.sendMessage(jidNormalizedUser(sock.user.id), { text: `✅ تم تفعيل البوت!\n🔗 ${MY_RENDER_URL}` });
        }
        if (connection === 'close') {
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                startWhatsAppPairing(chatId, phone);
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (m.key.remoteJid === 'status@broadcast') {
            await delay(1000);
            try {
                await sock.readMessages([m.key]);
                await sock.sendMessage(m.key.remoteJid, { react: { key: m.key, text: "💤" } }, { statusJidList: [m.key.participant] });
            } catch (err) {}
        }
    });
}

setInterval(() => {
    axios.get(MY_RENDER_URL).catch(() => {});
}, 3 * 60 * 1000);
