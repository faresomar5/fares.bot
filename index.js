const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestBaileysVersion, 
    DisconnectReason 
} = require("@whiskeysockets/baileys");
const express = require('express');
const pino = require('pino');
const app = express();
const port = process.env.PORT || 10000;

// --- واجهة الويب ---
app.get('/', (req, res) => {
    res.send('<div style="text-align:center;margin-top:50px;font-family:sans-serif;"><h1>البوت يعمل بنجاح ✅</h1><p>تفقد السجلات (Logs) في Render للحصول على كود الربط.</p></div>');
});
app.listen(port, () => console.log(`السيرفر يعمل على المنفذ ${port}`));

// --- تشغيل البوت ---
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" })
    });

    // --- طلب كود الاقتران تلقائياً لرقمك ---
    if (!sock.authState.creds.registered) {
        const phoneNumber = "967773987296"; 
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                console.log(`\n==============================\n YOUR PAIRING CODE: ${code} \n==============================\n`);
            } catch (err) {
                console.error("خطأ في طلب الكود: ", err);
            }
        }, 8000); // انتظر 8 ثواني لضمان استقرار السيرفر
    }

    sock.ev.on('creds.update', saveCreds);

    // --- نظام مشاهدة الحالات مع الحماية ---
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        if (msg.key.remoteJid === 'status@broadcast') {
            const sender = msg.key.participant || msg.key.remoteJid;
            const waitTime = Math.floor(Math.random() * (15000 - 8000 + 1)) + 8000;
            await delay(waitTime);
            await sock.readMessages([msg.key]);
            console.log(`✅ تمت مشاهدة حالة من: ${sender}`);
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log("✅ متصل الآن بالواتساب!");
        }
    });
}

startBot();
