const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    DisconnectReason 
} = require("@whiskeysockets/baileys");
const pino = require('pino');
const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 10000;

// إعداد السيرفر لعرض واجهة التحكم
app.use(express.static('public'));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/public/index.html'));
});

async function startFaresBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    // تعريف المتغير sock في نطاق الدالة
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: ["Fares Bot", "Chrome", "1.0.0"]
    });

    // الاستماع للرسائل (يجب أن يكون داخل الدالة ليرى متغير sock)
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const msg = chatUpdate.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const remoteJid = msg.key.remoteJid;
            const body = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

            // أمر كود الربط
            if (body.trim() === ".bot") {
                const senderNumber = remoteJid.split('@')[0];
                // طلب كود الربط من Baileys
                const code = await sock.requestPairingCode(senderNumber);
                await sock.sendMessage(remoteJid, { 
                    text: `*لوحة تحكم فارس* 🔐\n\nكود الربط الخاص بك هو: *${code}*` 
                });
            }
        } catch (err) {
            console.log("Error in messages.upsert:", err);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
        } else if (connection === 'open') {
            console.log('✅ تم تشغيل بوت فارس بنجاح');
        }
    });
}

// تشغيل البوت والسيرفر
startFaresBot();
app.listen(port, () => console.log(`Server running on port ${port}`));
