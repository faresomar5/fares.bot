const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const crypto = require("crypto");

const app = express();
const port = process.env.PORT || 3000;

// توليد كلمة سر فريدة لكل جلسة تشغيل
const sessionPassword = crypto.randomBytes(3).toString('hex').toUpperCase();

async function startFaresBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session');
    
    // إعدادات النسخة والمتصفح لتجاوز تعليق تسجيل الدخول
    const socket = makeWASocket({
        auth: state,
        version: [2, 3000, 1015901307], // نسخة حديثة متوافقة مع واتساب ويب
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        // هوية متصفح حديثة جداً لتبدو كجهاز رسمي
        browser: ["Ubuntu", "Chrome", "121.0.6167.160"] 
    });

    // حفظ بيانات الاعتماد
    socket.ev.on('creds.update', saveCreds);

    // مراقبة حالة الاتصال وإرسال بيانات الدخول
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
            console.log("✅ تم الربط بنجاح!");
            const myNumber = socket.user.id.split(':')[0] + "@s.whatsapp.net";
            
            const welcomeMsg = `👑 *مرحباً بك في سيرفر فارس* 👑\n\n` +
                               `✅ تم اكتمال تسجيل الدخول بنجاح.\n\n` +
                               `🔐 كلمة السر: *${sessionPassword}*\n` +
                               `⚙️ لوحة التحكم: https://fares-bot-eahg.onrender.com/settings\n\n` +
                               `*ملاحظة:* إذا واجهت مشكلة في التفاعل، تأكد من بقاء السيرفر يعمل.`;
            
            await delay(5000); // تأخير لضمان استقرار المزامنة قبل إرسال الرسالة
            await socket.sendMessage(myNumber, { text: welcomeMsg });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== disconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot(); // إعادة محاولة الاتصال
        }
    });

    // كود التفاعل التلقائي مع الحالات (Status React)
    socket.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const msg = chatUpdate.messages[0];
            if (!msg.message || msg.key.remoteJid !== 'status@broadcast') return;
            const participant = msg.key.participant || msg.participant;
            
            await socket.sendMessage('status@broadcast', {
                react: { text: '❤️', key: msg.key }
            }, { statusJidList: [participant] });
        } catch (err) {
            console.error("Status React Error:", err);
        }
    });

    return socket;
}

// تشغيل البوت تلقائياً
startFaresBot();

// --- المسارات البرمجية ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, 'settings.html'));
});

app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "رقم الهاتف مطلوب" });
    phone = phone.replace(/[^0-9]/g, '');

    try {
        const tempSocket = await startFaresBot();
        await delay(3000); // وقت إضافي لتهيئة الطلب
        const code = await tempSocket.requestPairingCode(phone);
        res.json({ status: true, pairing_code: code });
    } catch (err) {
        res.status(500).json({ error: "فشل في توليد الكود" });
    }
});

app.listen(port, () => {
    console.log(`Fares Server is Live on port ${port}`);
    console.log(`Login Password: ${sessionPassword}`);
});
