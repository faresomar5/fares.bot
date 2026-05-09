import { 
    default as makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestBaileysVersion, 
    DisconnectReason,
    Browsers
} from "@whiskeysockets/baileys";
import TelegramBot from 'node-telegram-bot-api';
import pino from 'pino';
import express from 'express';
import fs from 'fs-extra';
import axios from 'axios';

const BOT_TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I";
const MY_RENDER_URL = "https://fares-bot-eahg.onrender.com"; 

const app = express();
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

app.get('/', (req, res) => res.send('👑 بوت الملك فارس: السيرفر يعمل ✅'));
app.listen(process.env.PORT || 10000);

bot.on('message', async (msg) => {
    const text = msg.text;
    if (text && /[0-9]{10,}/.test(text)) {
        const phone = text.replace(/[^0-9]/g, '');
        bot.sendMessage(msg.chat.id, "⏳ جاري تنظيف الجلسات وتوليد كود جديد... انتظر 10 ثوانٍ.");
        startWhatsAppSession(msg.chat.id, phone);
    }
});

async function startWhatsAppSession(chatId, phone) {
    const sessionPath = `./sessions/${chatId}`;
    
    // الحل الجذري: مسح المجلد بالكامل قبل كل طلب جديد
    try {
        if (fs.existsSync(sessionPath)) {
            fs.emptyDirSync(sessionPath); 
            await fs.remove(sessionPath);
        }
    } catch (e) {}

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS("Chrome"), // تغيير التعريف ليكون أكثر موثوقية
        markOnlineOnConnect: true
    });

    sock.ev.on('creds.update', saveCreds);

    try {
        await delay(10000); // وقت إضافي لضمان فتح الاتصال
        if (!sock.authState.creds.registered) {
            const code = await sock.requestPairingCode(phone);
            await bot.sendMessage(chatId, `✅ كود الربط الجديد:\n\n \`${code}\` \n\n⚠️ أدخله الآن في واتساب قبل مرور دقيقة!`, { parse_mode: 'Markdown' });
        }
    } catch (e) {
        bot.sendMessage(chatId, "❌ فشل استخراج الكود. حاول مرة أخرى.");
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            bot.sendMessage(chatId, "🎊 تم الربط بنجاح يا ملك!");
            await sock.sendMessage(sock.user.id, { text: "✅ تم تشغيل البوت بنجاح!" });
        }
        if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
            startWhatsAppSession(chatId, phone);
        }
    });
}

setInterval(() => { axios.get(MY_RENDER_URL).catch(() => {}); }, 4 * 60 * 1000);
