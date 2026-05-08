const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion 
} = require("@whiskeysockets/baileys");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require('express');
const pino = require('pino');
const fs = require('fs-extra');
const path = require('path');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تهيئة الذكاء الاصطناعي بمفتاحك الخاص
const genAI = new GoogleGenerativeAI("AIzaSyBklT9MOcHID87Fnb86Xz0F551v9Vw_P-k");

// معالجة المجلدات لضمان عدم ظهور "خطأ في الجلسة"
const sessionsDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
}

app.get('/', (req, res) => {
    res.send(`
    <body style="background:#020617; color:white; font-family:sans-serif; text-align:center; padding-top:50px;">
        <h1 style="color:#d4a017;">👑 بوت الملك فارس</h1>
        <p style="color:#94a3b8;">أدخل رقمك مع مفتاح الدولة (مثل 967...) لربط جهازك</p>
        <div style="background:#0f172a; padding:30px; border-radius:20px; border:1px solid #d4a017; display:inline-block;">
            <form action="/pair" method="POST">
                <input type="text" name="number" placeholder="967..." required style="padding:12px; border-radius:8px; width:250px; text-align:center; border:none;">
                <br><br>
                <button type="submit" style="background:#d4a017; color:black; padding:12px 25px; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">استخراج كود الربط 🚀</button>
            </form>
        </div>
    </body>`);
});

app.post('/pair', async (req, res) => {
    const num = req.body.number.replace(/[^0-9]/g, '');
    if (!num) return res.status(400).send("يرجى إدخال رقم صحيح");

    const authPath = path.join(sessionsDir, num);

    try {
        // تنظيف أي محاولات قديمة فاشلة لضمان استلام كود جديد
        if (fs.existsSync(authPath)) fs.removeSync(authPath);

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
            <h2 style="color:#94a3b8;">كود الربط الخاص بك هو:</h2>
            <h1 style="color:#d4a017; font-size:70px; letter-spacing:10px;">${code}</h1>
            <p>افتح واتساب > الأجهزة المرتبطة > ربط جهاز، وأدخل هذا الكود.</p>
            <br><a href="/" style="color:#d4a017;">العودة للرئيسية</a>
        </body>`);

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;
            const from = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

            // الرد الآلي بالذكاء الاصطناعي Gemini
            try {
                const model = genAI.getGenerativeModel({ model: "gemini-pro" });
                const result = await model.generateContent(text);
                const aiReply = result.response.text();
                await sock.sendMessage(from, { text: aiReply });
            } catch (err) {
                console.error("AI Error");
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("حدث خطأ في تشغيل السيرفر، يرجى المحاولة مرة أخرى.");
    }
});

app.listen(port, () => console.log(`لوحة التحكم جاهزة على المنفذ ${port}`));
