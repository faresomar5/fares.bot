require('dotenv').config();
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    Browsers,
    jidDecode
} = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const SESSION_DIR = './session';

let sock;

// دالة فك تشفير المعرفات (للحصول على الرقم بدون إضافات)
const decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
        let decode = jidDecode(jid) || {};
        return decode.user + '@' + decode.server;
    }
    return jid;
};

async function startFaresBot() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS('Desktop'), // أفضل خيار لثبات الكود
    });

    // حفظ بيانات الجلسة
    sock.ev.on('creds.update', saveCreds);

    // مراقبة حالة الاتصال
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
        }
        console.log('حالة السيرفر:', connection);
    });

    // --- قسم الأوامر من داخل الواتساب ---
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;
            
            const from = mek.key.remoteJid;
            const messageType = Object.keys(mek.message)[0];
            const body = messageType === 'conversation' ? mek.message.conversation : 
                         messageType === 'extendedTextMessage' ? mek.message.extendedTextMessage.text : '';

            // أمر تجريبي: إذا أرسلت "فحص" أو "test" يرد البوت عليك
            if (body.toLowerCase() === 'فحص' || body.toLowerCase() === 'test') {
                await sock.sendMessage(from, { text: '✅ بوت الملك فارس يعمل بنجاح!' }, { quoted: mek });
            }

            // أمر لمعرفة وقت السيرفر
            if (body === 'الوقت') {
                await sock.sendMessage(from, { text: `الوقت الآن: ${new Date().toLocaleString('ar-EG')}` });
            }

            // يمكنك إضافة المزيد من الأوامر هنا بنفس الطريقة

        } catch (err) {
            console.log('خطأ في معالجة الرسالة:', err);
        }
    });

    return sock;
}

// --- قسم الـ API لاستخراج كود الربط من الموقع ---
app.post('/api/pairing', async (req, res) => {
    const num = req.body.num;
    if (!num) return res.status(400).json({ error: 'الرقم مطلوب' });

    try {
        // تأكد من تشغيل البوت إذا لم يكن يعمل
        if (!sock) await startFaresBot();
        
        // انتظار بسيط لضمان جاهزية الاتصال
        await new Promise(resolve => setTimeout(resolve, 3500));
        
        const code = await sock.requestPairingCode(num);
        res.json({ success: true, code });
    } catch (err) {
        console.error('Error in pairing:', err);
        res.status(500).json({ error: 'حدث خطأ أثناء طلب الكود' });
    }
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`السيرفر يعمل على: https://fares-bot-eahg.onrender.com`);
    startFaresBot();
});
