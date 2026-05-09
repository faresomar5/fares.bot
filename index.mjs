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
const sessions = new Map(); 

// التأكد من وجود مجلد الجلسات
if (!fs.existsSync('./sessions')) {
    fs.mkdirSync('./sessions');
}

// خادم الويب للحفاظ على الحياة (Keep Alive)
app.get('/', (req, res) => res.send('👑 بوت الملك فارس يعمل بنظام MJS ✅'));
app.listen(process.env.PORT || 10000, () => {
    console.log("Web server is running...");
});

// --- أوامر التلجرام ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text) return;

    if (text === '/start') {
        return bot.sendMessage(chatId, "👑 أهلاً بك في نظام الملك فارس المتطور.\n\nأرسل رقمك الآن مع مفتاح الدولة (مثال: 967773987296) للحصول على كود الربط.");
    }

    // إذا كان النص رقم هاتف
    if (/[0-9]{10,}/.test(text)) {
        const phone = text.replace(/[^0-9]/g, '');
        bot.sendMessage(chatId, "⏳ جاري محاولة استخراج كود الربط... انتظر ثواني.");
        startWhatsAppSession(chatId, phone);
    }
});

// --- وظيفة الواتساب الرئيسية ---
async function startWhatsAppSession(chatId, phone) {
    const sessionPath = `./sessions/${chatId}`;
    
    // مسح الجلسة القديمة لضمان عدم التعليق
    if (fs.existsSync(sessionPath)) {
        await fs.remove(sessionPath);
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS("Chrome"), // هوية متصفح مستقرة لتخطي "جاري تسجيل الدخول"
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0
    });

    sessions.set(chatId, sock);
    sock.ev.on('creds.update', saveCreds);

    // طلب كود الربط
    try {
        await delay(8000); // إعطاء وقت كافٍ للاتصال
        const code = await sock.requestPairingCode(phone);
        await bot.sendMessage(chatId, `✅ تم استخراج كود الربط بنجاح!\n\nأدخل هذا الكود في واتساب:\n\n \`${code}\``, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(chatId, "❌ فشل السيرفر في طلب الكود. حاول مرة أخرى لاحقاً.");
        return;
    }

    // إدارة الاتصال
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            const myJid = jidNormalizedUser(sock.user.id);
            
            // إرسال رسالة النجاح للرقم المربوط
            await sock.sendMessage(myJid, { 
                text: `✅ تم تفعيل بوت الملك فارس بنجاح على هذا الرقم!\n\n🚀 البوت الآن يشاهد ويتفاعل مع الحالات تلقائياً.\n🔗 رابط الموقع: ${MY_RENDER_URL}` 
            });

            bot.sendMessage(chatId, "🎊 مبروك! تم الربط بنجاح والبوت نشط الآن.");
            bot.sendMessage(ADMIN_ID, `📢 مستخدم جديد ربط بنجاح: ${phone}`);
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                startWhatsAppSession(chatId, phone);
            }
        }
    });

    // التفاعل التلقائي مع الحالات
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;
        
        if (m.key.remoteJid === 'status@broadcast') {
            await delay(2000); // تأخير لضمان تسجيل المشاهدة والتفاعل
            try {
                await sock.readMessages([m.key]);
                await sock.sendMessage(m.key.remoteJid, { 
                    react: { key: m.key, text: "💤" } 
                }, { 
                    statusJidList: [m.key.participant] 
                });
            } catch (err) {
                console.log("خطأ في التفاعل مع الحالة");
            }
        }
    });
}

// --- ميزة الحفاظ على الحياة (Keep Alive) ---
setInterval(() => {
    axios.get(MY_RENDER_URL).catch(() => {});
}, 3 * 60 * 1000); // طلب كل 3 دقائق لضمان بقاء السيرفر مستيقظاً
