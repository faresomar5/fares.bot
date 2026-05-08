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
const fs = require('fs-extra');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SESSION_DIR = './session';

// متغيرات التحكم
let sock;
let statusEmoji = '💤'; // الإيموجي الافتراضي للتفاعل مع الحالة
const ownerNumber = '967xxxxxxxxx@s.whatsapp.net'; // ضع رقمك هنا بدون (+) مع إضافة @s.whatsapp.net

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
        patchMessageBeforeSending: (message) => {
            const requiresPatch = !!(
                message.buttonsMessage ||
                message.templateMessage ||
                message.listMessage
            );
            if (requiresPatch) {
                message = {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: {
                                deviceListMetadata: {},
                                deviceListMetadataVersion: 2
                            },
                            ...message
                        }
                    }
                };
            }
            return message;
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // نظام البقاء متصلاً 24 ساعة (Self-Ping)
    setInterval(() => {
        axios.get(`https://fares-bot-eahg.onrender.com`).catch(() => {});
    }, 5 * 60 * 1000); // كل 5 دقائق

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
        }
        console.log('حالة البوت:', connection);
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

            // --- 1. التفاعل مع الحالات (Status) ---
            if (from === 'status@broadcast' && !isMe) {
                // التفاعل بالإيموجي المختار
                await sock.sendMessage(from, { react: { text: statusEmoji, key: mek.key } }, { statusJidList: [mek.key.participant] });
                
                // رد تلقائي للمطور عند مشاهدة الحالة
                // يتم إرسال الرسالة لصاحب الحالة
                await sock.sendMessage(mek.key.participant, { text: 'تمت مشاهدة حالتك بنجاح بواسطة بوت الملك فارس 👑' });
            }

            // --- 2. أوامر التحكم والاعدادات ---
            
            // تغيير إيموجي التفاعل (للمطور فقط)
            if (command.startsWith('تغيير الايموجي')) {
                const newEmoji = args.slice(2).join(' ');
                if (newEmoji) {
                    statusEmoji = newEmoji;
                    await sock.sendMessage(from, { text: `✅ تم تغيير إيموجي التفاعل إلى: ${statusEmoji}` }, { quoted: mek });
                }
            }

            // أمر "بوت" لتوليد كود ربط لأي شخص
            if (command.startsWith('بوت')) {
                const targetNum = args[1];
                if (!targetNum) return await sock.sendMessage(from, { text: '❌ يرجى كتابة الرقم مع مفتاح الدولة، مثال:\nبوت 967xxxxxxxxx' });
                
                await sock.sendMessage(from, { text: '⏳ جاري استخراج كود الربط، انتظر لحظة...' });
                try {
                    let tempSock = makeWASocket({ auth: state, logger: pino({ level: 'silent' }) });
                    const code = await tempSock.requestPairingCode(targetNum.replace('+', ''));
                    await sock.sendMessage(from, { text: `✅ كود الربط الخاص بك هو: *${code}*\nاستخدمه لربط رقمك بالبوت.` });
                } catch (e) {
                    await sock.sendMessage(from, { text: '❌ فشل استخراج الكود، تأكد من الرقم.' });
                }
            }

            // --- 3. أوامر التحميل (سوشيال ميديا) ---
            
            // تحميل تيك توك
            if (command.includes('tiktok.com')) {
                await sock.sendMessage(from, { text: '⏳ جاري تحميل فيديو تيك توك...' });
                try {
                    const res = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${command}`);
                    await sock.sendMessage(from, { video: { url: res.data.video.noWatermark }, caption: 'تم التحميل بواسطة بوت الملك فارس 👑' });
                } catch (e) {
                    await sock.sendMessage(from, { text: '❌ عذراً، تعذر التحميل.' });
                }
            }

            // تحميل انستقرام
            if (command.includes('instagram.com')) {
                await sock.sendMessage(from, { text: '⏳ جاري تحميل وسائط انستقرام...' });
                try {
                    const res = await axios.get(`https://api.vreden.my.id/api/igdl?url=${command}`);
                    const media = res.data.result[0].url;
                    await sock.sendMessage(from, { video: { url: media }, caption: 'تم التحميل بواسطة بوت الملك فارس 👑' });
                } catch (e) {
                    await sock.sendMessage(from, { text: '❌ عذراً، تعذر التحميل من انستقرام.' });
                }
            }

            // --- 4. القائمة العامة والأوامر الأساسية ---
            if (command === 'فحص' || command === 'test') {
                await sock.sendMessage(from, { text: '✅ بوت الملك فارس يعمل بنجاح وبكامل ميزاته!' }, { quoted: mek });
            }

            if (command === 'فارس') {
                await sock.sendMessage(from, { text: '👑 نعم يا ملك، أنا في الخدمة. اطلب ما تشاء!' }, { quoted: mek });
            }

            if (command === 'الاوامر' || command === 'الأوامر') {
                const menu = `👑 *قائمة أوامر بوت الملك فارس المطورة* 👑\n\n` +
                             `• *بوت [الرقم]*: لاستخراج كود ربط لرقمه.\n` +
                             `• *فارس*: للترحيب.\n` +
                             `• *فحص*: للتأكد من حالة الاتصال.\n` +
                             `• *تغيير الايموجي [الإيموجي]*: لتغيير تفاعل الحالة.\n` +
                             `• *ارسل رابط (تيك توك/انستا)*: للتحميل التلقائي.\n` +
                             `• *الوقت*: لمعرفة وقت السيرفر.\n` +
                             `• *موقعي*: رابط بوابة الربط الخاصة بك.\n\n` +
                             `⚙️ *ميزات مفعلة*: التفاعل التلقائي مع الحالات (💤)، الرد التلقائي على أصحاب الحالات، البقاء متصلاً 24 ساعة.`;
                await sock.sendMessage(from, { text: menu }, { quoted: mek });
            }

            if (command === 'موقعي') {
                await sock.sendMessage(from, { text: 'رابط موقعك: https://fares-bot-eahg.onrender.com' });
            }

        } catch (err) {
            console.log('Error in messages:', err);
        }
    });

    return sock;
}

app.post('/api/pairing', async (req, res) => {
    const num = req.body.num;
    if (!num) return res.status(400).json({ error: 'الرقم مطلوب' });
    try {
        await startFaresBot(true);
        await new Promise(resolve => setTimeout(resolve, 5000));
        const code = await sock.requestPairingCode(num);
        res.json({ success: true, code });
    } catch (err) {
        res.status(500).json({ error: 'حدث خطأ في استخراج الكود' });
    }
});

app.listen(PORT, () => {
    console.log(`السيرفر يعمل على المنفذ ${PORT}`);
    startFaresBot();
});
