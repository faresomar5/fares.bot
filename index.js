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
const axios = require('axios');

const token = '8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I';
const devId = 7231690686;
const MY_RENDER_URL = "https://fares-bot.onrender.com"; 

const app = express();
const bot = new TelegramBot(token, { polling: true });

fs.ensureDirSync('./sessions');

app.get('/', (req, res) => res.send('بوت الملك فارس: متصل ومستقر ✅'));
app.listen(process.env.PORT || 10000);

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (msg.text === '/start') return bot.sendMessage(chatId, "👑 أرسل رقمك الآن لبدء الربط.");
    if (/[0-9]{10,}/.test(msg.text)) {
        bot.sendMessage(chatId, "⏳ جاري محاولة الربط... يرجى الانتظار ولا تغلق الواتساب.");
        startWhatsApp(chatId, msg.text.replace(/[^0-9]/g, ''));
    }
});

async function startWhatsApp(chatId, phone) {
    const sessionPath = `./sessions/${chatId}`;
    if (fs.existsSync(sessionPath)) await fs.remove(sessionPath);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS("Desktop"), // تغيير المتصفح لحل مشكلة التعليق
        connectTimeoutMs: 100000, // زيادة وقت الانتظار
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 30000
    });

    // حفظ البيانات فوراً عند أي تغيير
    sock.ev.on('creds.update', saveCreds);

    try {
        await delay(5000);
        const code = await sock.requestPairingCode(phone);
        await bot.sendMessage(chatId, `✅ كود الربط: \`${code}\``, { parse_mode: 'Markdown' });
    } catch (e) {
        return bot.sendMessage(chatId, "❌ فشل طلب الكود، حاول مجدداً.");
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
            bot.sendMessage(chatId, "🎊 مبروك! تم الربط بنجاح.");
            await sock.sendMessage(sock.user.id, { text: "✅ تم تشغيل بوت الملك فارس بنجاح!" });
        }

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                startWhatsApp(chatId, phone);
            } else {
                await fs.remove(sessionPath);
                bot.sendMessage(chatId, "❌ تم تسجيل الخروج، يرجى إعادة الربط.");
            }
        }
    });

    // التفاعل التلقائي
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (m.key.remoteJid === 'status@broadcast') {
            await delay(2000); // تأخير بسيط للثبات
            try {
                await sock.readMessages([m.key]);
                await sock.sendMessage(m.key.remoteJid, { react: { key: m.key, text: "💤" } }, { statusJidList: [m.key.participant] });
            } catch {}
        }
    });
}

// Keep-Alive
setInterval(() => { axios.get(MY_RENDER_URL).catch(() => {}); }, 4 * 60 * 1000);
