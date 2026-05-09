import { 
    default as makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestBaileysVersion, 
    DisconnectReason,
    Browsers,
    jidNormalizedUser
} from "@whiskeysockets/baileys";
import TelegramBot from 'node-telegram-bot-api';
import pino from 'pino';
import express from 'express';
import fs from 'fs-extra';
import axios from 'axios';

// --- الإعدادات الخاصة بك ---
const BOT_TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I";
const MY_RENDER_URL = "https://fares-bot-eahg.onrender.com"; 
const ADMIN_ID = 7231690686;

const app = express();
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// التأكد من المجلدات
if (!fs.existsSync('./sessions')) fs.mkdirSync('./sessions');

app.get('/', (req, res) => res.send('👑 بوت الملك فارس: السيرفر يعمل ✅'));
app.listen(process.env.PORT || 10000);

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text) return;

    if (text === '/start') {
        return bot.sendMessage(chatId, "👑 أهلاً بك يا ملك.\n\nأرسل رقمك الآن مع مفتاح الدولة (مثال: 967773987296) للحصول على كود الربط الصحيح.");
    }

    if (/[0-9]{10,}/.test(text)) {
        const phone = text.replace(/[^0-9]/g, '');
        bot.sendMessage(chatId, "⏳ جاري توليد كود ربط متوافق... انتظر قليلاً.");
        startWhatsAppSession(chatId, phone);
    }
});

async function startWhatsAppSession(chatId, phone) {
    const sessionPath = `./sessions/${chatId}`;
    
    // تنظيف الجلسة تماماً قبل البدء لحل مشكلة "الكود خطأ"
    if (fs.existsSync(sessionPath)) await fs.remove(sessionPath);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        // تغيير التعريف إلى Chrome Windows يحل مشكلة رفض الكود في بعض الهواتف
        browser: Browsers.appropriate('Chrome'), 
        markOnlineOnConnect: true,
        printQRInTerminal: false,
        connectTimeoutMs: 60000,
        generateHighQualityLinkPreview: true
    });

    sock.ev.on('creds.update', saveCreds);

    try {
        // زيادة وقت الانتظار قليلاً قبل طلب الكود لضمان استقرار الاتصال
        await delay(10000); 
        
        if (!sock.authState.creds.registered) {
            const code = await sock.requestPairingCode(phone);
            // إرسال الكود بتنسيق واضح للنسخ
            await bot.sendMessage(chatId, `✅ تم استخراج كود الربط بنجاح!\n\nأدخل هذا الكود في واتساب:\n\n \`${code}\``, { parse_mode: 'Markdown' });
        }
    } catch (e) {
        console.error(e);
        bot.sendMessage(chatId, "❌ فشل استخراج الكود. يرجى المحاولة مرة أخرى بعد دقيقة.");
        return;
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            const myJid = jidNormalizedUser(sock.user.id);
            await sock.sendMessage(myJid, { text: `✅ تم تفعيل بوت الملك فارس بنجاح!\n🔗 الرابط: ${MY_RENDER_URL}` });
            bot.sendMessage(chatId, "🎊 مبروك! تمت عملية الربط بنجاح والبوت نشط.");
            bot.sendMessage(ADMIN_ID, `📢 رقم جديد ربط بنجاح: ${phone}`);
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWhatsAppSession(chatId, phone);
        }
    });

    // التفاعل التلقائي مع الحالات
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (m.key.remoteJid === 'status@broadcast') {
            await delay(2000);
            try {
                await sock.readMessages([m.key]);
                await sock.sendMessage(m.key.remoteJid, { react: { key: m.key, text: "💤" } }, { statusJidList: [m.key.participant] });
            } catch (err) {}
        }
    });
}

// Keep Alive لضمان بقاء السيرفر مستيقظاً
setInterval(() => {
    axios.get(MY_RENDER_URL).catch(() => {});
}, 3 * 60 * 1000);
