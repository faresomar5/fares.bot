const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const express = require('express');
const pino = require('pino');
const app = express();
const port = process.env.PORT || 8080;

// --- إعداد واجهة الويب (Dashboard) ---
app.get('/', (req, res) => {
    res.send(`
        <div style="text-align:center; margin-top:50px; font-family:Arial;">
            <h1 style="color:#25D366;">WhatsApp Bot Panel</h1>
            <p>البوت شغال الآن بنجاح على السيرفر!</p>
            <p>للحصول على كود الربط، ابحث في سجلات (Logs) موقع Render.</p>
            <div style="background:#f0f0f0; padding:20px; display:inline-block; border-radius:10px;">
                <strong>حالة البوت:</strong> <span style="color:green;">متصل بالسيرفر ✅</span>
            </div>
        </div>
    `);
});

app.listen(port, () => console.log(`لوحة التحكم تعمل على المنفذ ${port}`));

// --- إعداد البوت (WhatsApp Logic) ---
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: "silent" })
    });

    sock.ev.on('creds.update', saveCreds);

    // نظام مشاهدة الحالات مع الحماية
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        if (msg.key.remoteJid === 'status@broadcast') {
            const sender = msg.key.participant || msg.key.remoteJid;
            
            // نظام حماية: انتظار عشوائي بين 7 إلى 15 ثانية (عشان ما ينحظر الرقم)
            const waitTime = Math.floor(Math.random() * (15000 - 7000 + 1)) + 7000;
            await delay(waitTime);

            await sock.readMessages([msg.key]);
            console.log(`✅ تمت مشاهدة حالة من: ${sender} (بعد انتظار ${waitTime/1000} ثانية)`);
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'close') {
            console.log("إعادة الاتصال...");
            startBot();
        } else if (connection === 'open') {
            console.log("✅ البوت متصل الآن بالواتساب!");
        }
    });
}

startBot();
