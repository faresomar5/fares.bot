const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const crypto = require("crypto");

const app = express();
const port = process.env.PORT || 3000;

// متغير لتخزين كلمة السر (تتغير عند كل إعادة تشغيل للسيرفر لزيادة الأمان)
const sessionPassword = crypto.randomBytes(3).toString('hex').toUpperCase();

async function startFaresBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session');
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
        auth: state,
        version: version,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        // هوية متصفح موثوقة لضمان وصول الكود
        browser: ["Mac OS", "Chrome", "10.15.7"]
    });

    // --- حفظ الجلسة ---
    socket.ev.on('creds.update', saveCreds);

    // --- مراقبة حالة الاتصال ---
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
            console.log("✅ تم الاتصال بنجاح!");
            const myNumber = socket.user.id.split(':')[0] + "@s.whatsapp.net";
            
            // رسالة الترحيب التي تحتوي على الإعدادات وكلمة السر
            const welcomeMsg = `👑 *مرحباً بك في سيرفر فارس* 👑\n\n` +
                               `✅ تم ربط رقمك بنجاح.\n\n` +
                               `🔐 كلمة السر الخاصة بك: *${sessionPassword}*\n` +
                               `⚙️ رابط لوحة الإعدادات:\n` +
                               `https://fares-bot-eahg.onrender.com/settings\n\n` +
                               `*ملاحظة:* استخدم رقمك وكلمة السر أعلاه للتحكم في خصائص البوت.`;
            
            await delay(3000); // تأخير بسيط قبل إرسال الرسالة
            await socket.sendMessage(myNumber, { text: welcomeMsg });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== disconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot(); // إعادة الاتصال تلقائياً
        }
    });

    // --- كود التفاعل التلقائي مع الحالات (Status React) ---
    socket.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const msg = chatUpdate.messages[0];
            if (!msg.message || msg.key.remoteJid !== 'status@broadcast') return;

            const participant = msg.key.participant || msg.participant;
            
            // التفاعل بقلب حب مع كل حالة جديدة
            await socket.sendMessage('status@broadcast', {
                react: {
                    text: '❤️', 
                    key: msg.key
                }
            }, { statusJidList: [participant] });

        } catch (err) {
            console.error("Error in Status React:", err);
        }
    });

    return socket;
}

// تشغيل البوت عند بدء السيرفر
startFaresBot();

// --- المسارات (Routes) ---

// 1. واجهة الموقع الرئيسية (اختيار اللغة + الاقتران)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. واجهة الإعدادات (التي صممناها سابقاً)
app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, 'settings.html'));
});

// 3. API توليد كود الاقتران
app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "يرجى إدخال رقم الهاتف" });
    phone = phone.replace(/[^0-9]/g, '');

    try {
        const tempSocket = await startFaresBot();
        await delay(2000);
        const code = await tempSocket.requestPairingCode(phone);
        res.json({ status: true, pairing_code: code });
    } catch (err) {
        res.status(500).json({ error: "خطأ في توليد الكود" });
    }
});

app.listen(port, () => {
    console.log(`السيرفر يعمل على المنفذ: ${port}`);
    console.log(`كلمة السر الحالية لوحة التحكم: ${sessionPassword}`);
});
