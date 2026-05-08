require('dotenv').config();
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    Browsers
} = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const path = require('path');
const cors = require('cors');
const fs = require('fs-extra');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const SESSION_DIR = './session';

let sock;
let statusEmoji = '💤'; // إيموجي التفاعل الافتراضي
const developerNumber = '967xxxxxxxxx@s.whatsapp.net'; // استبدله برقمك

async function startFaresBot(clearSession = false) {
    if (clearSession && fs.existsSync(SESSION_DIR)) {
        await fs.emptyDir(SESSION_DIR);
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'), 
    });

    sock.ev.on('creds.update', saveCreds);

    // --- كود البقاء مستيقظاً 24 ساعة ---
    setInterval(() => {
        axios.get(`https://fares-bot-eahg.onrender.com`).catch(() => {});
    }, 5 * 60 * 1000); // بينغ كل 5 دقائق

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
        }
        console.log('حالة الاتصال:', connection);
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;

            const from = mek.key.remoteJid;
            const body = mek.message.conversation || 
                         mek.message.extendedTextMessage?.text || 
                         mek.message.imageMessage?.caption || "";

            const command = body.toLowerCase().trim();
            const args = body.split(' ');

            // 1. التفاعل التلقائي مع الحالة + رد المطور
            if (from === 'status@broadcast' && !mek.key.fromMe) {
                // وضع الإيموجي المطلوب
                await sock.sendMessage(from, { react: { text: statusEmoji, key: mek.key } }, { statusJidList: [mek.key.participant] });
                // رد تلقائي للمطور (يرسل لمن شاهد البوت حالته)
                await sock.sendMessage(mek.key.participant, { text: 'تمت مشاهدة حالتك بنجاح بواسطة بوت الملك فارس 💤' });
            }

            // 2. تغيير إيموجي التفاعل من داخل الواتساب
            if (command.startsWith('تغيير الايموجي')) {
                const newEmoji = args.slice(2).join(' ');
                if (newEmoji) {
                    statusEmoji = newEmoji;
                    await sock.sendMessage(from, { text: `✅ تم تحديث إيموجي الحالة إلى: ${statusEmoji}` });
                }
            }

            // 3. أمر الربط (بوت + رقم)
            if (command.startsWith('بوت')) {
                const num = args[1];
                if (!num) return await sock.sendMessage(from, { text: '❌ يرجى كتابة الرقم، مثال: بوت 967xxxxxxxxx' });
                try {
                    const tempSock = makeWASocket({ auth: state, logger: pino({ level: 'silent' }) });
                    const code = await tempSock.requestPairingCode(num);
                    await sock.sendMessage(from, { text: `✅ كود الربط للرقم ${num} هو: *${code}*` });
                } catch {
                    await sock.sendMessage(from, { text: '❌ تعذر استخراج الكود حالياً.' });
                }
            }

            // 4. تحميل انستقرام وتيك توك
            if (command.includes('tiktok.com') || command.includes('instagram.com')) {
                await sock.sendMessage(from, { text: '⏳ جاري التحميل...' });
                try {
                    // ملاحظة: تحتاج لاستخدام API تحميل خارجي هنا، هذا مثال للمنطق
                    await sock.sendMessage(from, { text: '✅ تم استلام الرابط، جاري المعالجة والارسال...' });
                } catch (e) { await sock.sendMessage(from, { text: '❌ فشل التحميل.' }); }
            }

            // 5. أمر الأوامر الشامل
            if (command === 'الاوامر' || command === 'الأوامر') {
                const list = `👑 *أوامر بوت الملك فارس المطورة* 👑\n\n` +
                             `• *بوت [الرقم]* : استخراج كود ربط جديد.\n` +
                             `• *تغيير الايموجي [الشكل]* : لتعديل تفاعل الحالة.\n` +
                             `• *فارس* : للترحيب.\n` +
                             `• *فحص* : حالة الاتصال.\n` +
                             `• *موقعي* : بوابة الربط.\n\n` +
                             `💡 البوت يعمل الآن 24 ساعة ويتفاعل مع الحالات تلقائياً بـ ${statusEmoji}.`;
                await sock.sendMessage(from, { text: list });
            }

        } catch (err) { console.log(err); }
    });

    return sock;
}

// تعديل واجهة الدخول لضمان ظهور الصفحة
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/pairing', async (req, res) => {
    const num = req.body.num;
    if (!num) return res.status(400).json({ error: 'الرقم مطلوب' });
    try {
        await startFaresBot(true);
        await new Promise(r => setTimeout(r, 5000));
        const code = await sock.requestPairingCode(num);
        res.json({ success: true, code });
    } catch (err) { res.status(500).json({ error: 'خطأ' }); }
});

app.listen(PORT, () => {
    console.log(`السيرفر يعمل 24/7`);
    startFaresBot();
});
