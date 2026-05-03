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
    // تغيير اسم المجلد إلى 'auth_session' لإجبار السيرفر على إنشاء تشفير جديد ونظيف
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_session'));
    
    const socket = makeWASocket({
        auth: state,
        version: [2, 3000, 1015901307], 
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        // هوية متصفح حديثة (Chrome على Windows) لتقليل احتمالية حظر الطلب
        browser: ["Windows", "Chrome", "122.0.6261.112"] 
    });

    // حفظ بيانات الاعتماد تلقائياً
    socket.ev.on('creds.update', saveCreds);

    // مراقبة حالة الاتصال
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
            console.log("✅ Fares Server is Online!");
            const myNumber = socket.user.id.split(':')[0] + "@s.whatsapp.net";
            
            const welcomeMsg = `👑 *سيرفر فارس يعمل الآن بنجاح* 👑\n\n` +
                               `🔐 كلمة السر: *${sessionPassword}*\n` +
                               `⚙️ لوحة التحكم: https://fares-bot-eahg.onrender.com/settings\n\n` +
                               `*ملاحظة:* تم تحديث نظام التشفير لتجنب أخطاء تسجيل الدخول.`;
            
            await delay(5000); // تأخير لضمان استقرار المزامنة
            await socket.sendMessage(myNumber, { text: welcomeMsg });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== disconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot(); 
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
            // تجاهل أخطاء التفاعل البسيطة
        }
    });

    return socket;
}

// تشغيل البوت
startFaresBot();

// --- المسارات (Routes) ---

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
        // استخدام نفس مسار الجلسة الجديد لطلب الكود
        const { state } = await useMultiFileAuthState(path.join(__dirname, 'auth_session'));
        const tempSocket = makeWASocket({ 
            auth: state, 
            version: [2, 3000, 1015901307],
            logger: pino({ level: "silent" }), 
            browser: ["Windows", "Chrome", "122.0.6261.112"] 
        });
        
        await delay(3000); 
        const code = await tempSocket.requestPairingCode(phone);
        res.json({ status: true, pairing_code: code });
    } catch (err) {
        res.status(500).json({ error: "فشل في توليد الكود، جرب مجدداً" });
    }
});

app.listen(port, () => {
    console.log(`Server started on port ${port}. Password: ${sessionPassword}`);
});
