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

// إعداد مسار المجلد العام للواجهة
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

const PORT = process.env.PORT || 3000;
const SESSION_DIR = './session';

let sock;
let statusEmoji = '💤'; // الإيموجي الافتراضي للتفاعل مع الحالة

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

    // نظام البقاء متصلاً 24 ساعة
    setInterval(() => {
        axios.get(`https://fares-bot-eahg.onrender.com`).catch(() => {});
    }, 5 * 60 * 1000);

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
            const isMe = mek.key.fromMe;
            const body = mek.message.conversation || 
                         mek.message.extendedTextMessage?.text || 
                         mek.message.imageMessage?.caption || "";

            const command = body.toLowerCase().trim();
            const args = body.split(' ');

            // --- التفاعل مع الحالات ورد المطور ---
            if (from === 'status@broadcast' && !isMe) {
                await sock.sendMessage(from, { react: { text: statusEmoji, key: mek.key } }, { statusJidList: [mek.key.participant] });
                // رد تلقائي يرسل للشخص الذي نشر الحالة
                await sock.sendMessage(mek.key.participant, { text: 'تمت مشاهدة حالتك بواسطة بوت الملك فارس 👑' });
            }

            // --- أوامر تغيير الإيموجي ---
            if (command.startsWith('تغيير الايموجي')) {
                const newEmoji = args[2];
                if (newEmoji) {
                    statusEmoji = newEmoji;
                    await sock.sendMessage(from, { text: `✅ تم تغيير إيموجي التفاعل إلى: ${statusEmoji}` });
                }
            }

            // --- أمر الربط (بوت [الرقم]) ---
            if (command.startsWith('بوت')) {
                const targetNum = args[1];
                if (!targetNum) return await sock.sendMessage(from, { text: '❌ أرسل: بوت ثم رقم الهاتف' });
                await sock.sendMessage(from, { text: '⏳ جاري استخراج كود الربط...' });
                try {
                    let tempSock = makeWASocket({ auth: state, logger: pino({ level: 'silent' }) });
                    const code = await tempSock.requestPairingCode(targetNum.replace('+', ''));
                    await sock.sendMessage(from, { text: `✅ كود الربط الخاص بك: *${code}*` });
                } catch (e) {
                    await sock.sendMessage(from, { text: '❌ فشل استخراج الكود.' });
                }
            }

            // --- أوامر التحميل ---
            if (command.includes('tiktok.com')) {
                try {
                    const res = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${command}`);
                    await sock.sendMessage(from, { video: { url: res.data.video.noWatermark }, caption: 'تم التحميل بواسطة الملك فارس' });
                } catch (e) { await sock.sendMessage(from, { text: '❌ خطأ في تحميل تيك توك' }); }
            }

            if (command.includes('instagram.com')) {
                try {
                    const res = await axios.get(`https://api.vreden.my.id/api/igdl?url=${command}`);
                    await sock.sendMessage(from, { video: { url: res.data.result[0].url }, caption: 'تم التحميل بواسطة الملك فارس' });
                } catch (e) { await sock.sendMessage(from, { text: '❌ خطأ في تحميل انستقرام' }); }
            }

            // --- قائمة الأوامر ---
            if (command === 'الاوامر' || command === 'الأوامر') {
                const menu = `👑 *أوامر بوت الملك فارس* 👑\n\n` +
                             `• *بوت [الرقم]*: كود ربط جديد.\n` +
                             `• *تغيير الايموجي [الشكل]*: لتعديل تفاعل الحالة.\n` +
                             `• *فحص*: فحص البوت.\n` +
                             `• *التحميل*: أرسل رابط تيك توك أو انستا.\n` +
                             `• *موقعي*: رابط الواجهة الخاصة بك.`;
                await sock.sendMessage(from, { text: menu });
            }

            if (command === 'موقعي') {
                await sock.sendMessage(from, { text: 'https://fares-bot-eahg.onrender.com' });
            }

        } catch (err) { console.log(err); }
    });

    return sock;
}

// --- مسارات السيرفر والواجهة ---
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

app.post('/api/pairing', async (req, res) => {
    const num = req.body.num;
    if (!num) return res.status(400).json({ error: 'الرقم مطلوب' });
    try {
        await startFaresBot(true);
        await new Promise(r => setTimeout(r, 5000));
        const code = await sock.requestPairingCode(num);
        res.json({ success: true, code });
    } catch (err) { res.status(500).json({ error: 'حدث خطأ' }); }
});

app.listen(PORT, () => {
    console.log(`السيرفر يعمل على منفذ ${PORT}`);
    startFaresBot();
});
