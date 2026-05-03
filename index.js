const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, disconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const crypto = require("crypto");

const app = express();
const port = process.env.PORT || 3000;
const sessionPassword = crypto.randomBytes(3).toString('hex').toUpperCase();

async function startFaresBot() {
    // استخدام مسار نظيف للجلسة لضمان تخطي تعليق "جاري تسجيل الدخول"
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'fares_session'));
    
    const socket = makeWASocket({
        auth: state,
        // الإصدار [2, 3000, 1015901307] هو المفتاح لوصول الإشعار وتخطي التعليق
        version: [2, 3000, 1015901307], 
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        // متصفح Ubuntu مع نسخة Chrome محددة لإقناع واتساب بالربط الفوري
        browser: ["Ubuntu", "Chrome", "110.0.5481.177"] 
    });

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
            console.log("✅ Fares Server is Connected!");
            const myNumber = socket.user.id.split(':')[0] + "@s.whatsapp.net";
            
            const welcomeMsg = `👑 *سيرفر فارس متصل بنجاح* 👑\n\n` +
                               `🔐 كلمة السر: *${sessionPassword}*\n` +
                               `⚙️ لوحة الإعدادات:\nhttps://fares-bot-eahg.onrender.com/settings`;
            
            await delay(5000);
            await socket.sendMessage(myNumber, { text: welcomeMsg });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== disconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
        }
    });

    // كود التفاعل التلقائي مع الحالات
    socket.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (msg.key.remoteJid === 'status@broadcast') {
                await socket.sendMessage('status@broadcast', { react: { text: '❤️', key: msg.key } }, { statusJidList: [msg.key.participant] });
            }
        } catch (e) {}
    });

    return socket;
}

startFaresBot();

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/settings', (req, res) => res.sendFile(path.join(__dirname, 'settings.html')));

app.get('/api/pairing', async (req, res) => {
    let num = req.query.number?.replace(/[^0-9]/g, '');
    if (!num) return res.json({ error: "الرقم مطلوب" });

    try {
        const { state } = await useMultiFileAuthState(path.join(__dirname, 'fares_session'));
        const temp = makeWASocket({ 
            auth: state, 
            version: [2, 3000, 1015901307],
            logger: pino({ level: "silent" }), 
            browser: ["Ubuntu", "Chrome", "110.0.5481.177"] 
        });
        
        await delay(3000);
        const code = await temp.requestPairingCode(num);
        res.json({ status: true, pairing_code: code });
    } catch (e) {
        res.json({ error: "فشل، حاول مرة أخرى" });
    }
});

app.listen(port, () => console.log(`Server Active. PW: ${sessionPassword}`));
