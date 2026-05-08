const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require('express');
const pino = require('pino');
const fs = require('fs-extra');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const genAI = new GoogleGenerativeAI("AIzaSyBklT9MOcHID87Fnb86Xz0F551v9Vw_P-k");

app.get('/', (req, res) => {
    res.send(`
    <body style="background:#020617; color:white; font-family:sans-serif; text-align:center; padding-top:50px;">
        <h1 style="color:#d4a017;">👑 منصة الملك فارس</h1>
        <div style="background:#0f172a; padding:30px; border-radius:20px; border:1px solid #d4a017; display:inline-block;">
            <form action="/pair" method="POST">
                <input type="text" name="number" placeholder="967..." required style="padding:12px; border-radius:8px; width:250px; text-align:center;">
                <br><br>
                <button type="submit" style="background:#d4a017; color:black; padding:10px 25px; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">استخراج كود الربط 🚀</button>
            </form>
        </div>
    </body>`);
});

app.post('/pair', async (req, res) => {
    const num = req.body.number.replace(/[^0-9]/g, '');
    if (!num) return res.status(400).send("الرقم مطلوب");

    const authPath = `./sessions/${num}`;
    if (fs.existsSync(authPath)) fs.removeSync(authPath);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: "silent" }),
            browser: ["Ubuntu", "Chrome", "20.0.04"]
        });

        const code = await sock.requestPairingCode(num);
        
        res.send(`
        <body style="background:#020617; color:white; text-align:center; padding-top:100px; font-family:sans-serif;">
            <h1 style="color:#d4a017; font-size:70px;">${code}</h1>
            <p>أدخل الكود في واتساب جوالك الآن</p>
            <a href="/" style="color:#d4a017;">رجوع</a>
        </body>`);

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
            try {
                const model = genAI.getGenerativeModel({ model: "gemini-pro" });
                const result = await model.generateContent(text);
                await sock.sendMessage(msg.key.remoteJid, { text: result.response.text() });
            } catch (e) { console.error("AI Error"); }
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("خطأ في تشغيل الجلسة، حاول مجدداً.");
    }
});

app.listen(port, () => console.log("Server is running..."));
