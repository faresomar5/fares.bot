require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const P = require('pino');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    DisconnectReason,
    Browsers // إضافة Browsers هنا
} = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_DIR = './session';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let sock = null;
let authState = null;

async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    authState = state;
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: P({ level: 'silent' }),
        printQRInTerminal: false,
        // التعديل المهم لحل مشكلة "الكود غير صحيح":
        browser: Browsers.macOS('Desktop'),
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWhatsApp();
        }
        console.log('حالة الاتصال:', connection);
    });

    return sock;
}

app.post('/api/pairing', async (req, res) => {
    let num = req.body.num;
    if (!num) return res.status(400).json({ error: 'الرقم مطلوب' });

    try {
        const wa = await startWhatsApp();
        // ننتظر قليلاً للتأكد من جاهزية السوكيت
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const code = await wa.requestPairingCode(num);
        res.json({ success: true, code });
    } catch (err) {
        res.status(500).json({ error: 'فشل في توليد الكود: ' + err.message });
    }
});

app.listen(PORT, () => {
    console.log(`السيرفر يعمل على المنفذ ${PORT}`);
    startWhatsApp();
});
