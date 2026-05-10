const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const app = express();
const port = process.env.PORT || 10000;

// إعدادات بوت التيليجرام
const tgToken = '8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I';
const bot = new TelegramBot(tgToken, { polling: true });

// إعدادات واتساب
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// --- قسم الواتساب ---
client.on('qr', (qr) => {
    console.log('سجل دخول واتساب عبر هذا الكود:');
    qrcode.generate(qr, { small: true });
    // إرسال الكود للتيليجرام لتسهيل المسح
    bot.sendMessage('ID_حسابك', 'يرجى التحقق من لوحة التحكم لمسح QR Code');
});

client.on('ready', () => {
    console.log('تم ربط واتساب بنجاح!');
});

// ميزة التفاعل التلقائي مع حالات الواتساب (Status)
client.on('message', async (msg) => {
    if (msg.from === 'status@broadcast') {
        console.log(`تم رصد حالة جديدة من: ${msg.author}`);
        // التفاعل بإيموجي (مثل القلب ❤️)
        try {
            await msg.react('❤️'); 
        } catch (err) {
            console.log('فشل التفاعل مع الحالة');
        }
    }
});

// --- قسم التيليجرام ---
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "مرحباً بك في بوت فارس الشامل!\nالبوت الآن يراقب حالات الواتساب وسيتفاعل معها تلقائياً ❤️.");
});

// إبقاء الرابط نشطاً لـ Render
app.get('/', (req, res) => {
    res.send('الرابط يعمل وبوت فارس قيد التشغيل 🚀');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

client.initialize();
