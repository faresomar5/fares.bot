const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    DisconnectReason 
} = require("@whiskeysockets/baileys");
const pino = require('pino');
const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.static('public'));
app.use(express.json());

// مسار الحصول على كود الربط من الواجهة
app.get('/pairing', async (req, res) => {
    let codePhone = req.query.code;
    if (!codePhone) return res.status(400).send({ error: 'الرقم مطلوب' });

    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: ["Ubuntu", "Chrome", "20.0.04"]
        });

        if (!sock.authState.creds.registered) {
            let code = await sock.requestPairingCode(codePhone);
            res.send({ code: code });
        } else {
            res.send({ error: 'الجهاز مرتبط بالفعل' });
        }
    } catch (err) {
        res.status(500).send({ error: 'حدث خطأ في السيرفر' });
    }
});

// تشغيل البوت الأساسي
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const remoteJid = msg.key.remoteJid;
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        // ميزة الرد الآلي بكود الربط عند إرسال .bot
        if (body === ".bot") {
            const myCode = await sock.requestPairingCode(remoteJid.split('@')[0]);
            await sock.sendMessage(remoteJid, { text: `كود الربط الخاص بك: ${myCode}` });
        }

        // تفاعل الحالات بالإيموجي المختار
        if (remoteJid === 'status@broadcast') {
            await sock.sendMessage('status@broadcast', { react: { text: "❤️", key: msg.key } }, { statusJidList: [msg.key.participant] });
        }
    });
}

startBot();
app.listen(port, () => console.log(`Server is live on port ${port}`));
