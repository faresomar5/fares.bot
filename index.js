const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.static('public'));
app.use(express.json());

// قاعدة بيانات بسيطة لحفظ إعدادات كل رقم (يفضل استخدام MongoDB لاحقاً)
const DB_PATH = './users_db.json';
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({}));

// ميزة استخراج كود الربط والرد التلقائي
sock.ev.on('messages.upsert', async (chatUpdate) => {
    const msg = chatUpdate.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const remoteJid = msg.key.remoteJid;
    const senderNumber = remoteJid.split('@')[0];
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

    if (body.trim() === ".bot") {
        let db = JSON.parse(fs.readFileSync(DB_PATH));
        
        // إنشاء كلمة سر فريدة إذا لم تكن موجودة
        if (!db[senderNumber]) {
            db[senderNumber] = {
                password: Math.random().toString(36).slice(-6).toUpperCase(), // كلمة سر من 6 رموز
                settings: { emoji: "❤️", antiLink: false, antiCall: true }
            };
            fs.writeFileSync(DB_PATH, JSON.stringify(db));
        }

        const userPass = db[senderNumber].password;
        const pairingCode = await sock.requestPairingCode(senderNumber);

        const welcomeMsg = `👋 *مرحباً بك في بوت فارس*\n\n` +
            `🔢 كود الربط: *${pairingCode}*\n` +
            `🔐 كلمة مرور لوحة التحكم: *${userPass}*\n` +
            `🔗 رابط الإعدادات الخاص بك:\n` +
            `https://fares-bot-eahg.onrender.com/settings.html?num=${senderNumber}\n\n` +
            `⚠️ لا تشارك كلمة السر مع أحد.`;

        await sock.sendMessage(remoteJid, { text: welcomeMsg });
    }
});

app.listen(port, () => console.log(`Server is running on port ${port}`));
