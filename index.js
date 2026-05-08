const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestBaileysVersion,
    DisconnectReason 
} = require("@whiskeysockets/baileys");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require('express');
const pino = require('pino');
const fs = require('fs-extra');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// إعداد الذكاء الاصطناعي
const genAI = new GoogleGenerativeAI("AIzaSyBklT9MOcHID87Fnb86Xz0F551v9Vw_P-k");

app.get('/', (req, res) => {
    res.send(`
    <body style="background:#020617; color:white; font-family:sans-serif; text-align:center; padding-top:50px;">
        <h1 style="color:#d4a017;">👑 منصة الملك فارس للربط العام</h1>
        <p style="color:#94a3b8;">أدخل رقمك للحصول على كود الربط وتفعيل الذكاء الاصطناعي</p>
        <div style="background:#0f172a; padding:30px; border-radius:20px; border:1px solid #d4a017; display:inline-block;">
            <form action="/pair" method="POST">
                <input type="text" name="number" placeholder="967..." required style="padding:12px; border-radius:8px; border:none; width:250px; text-align:center;">
                <br><br>
                <button type="submit" style="background:#d4a017; color:black; padding:12px 25px; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">استخراج كود الربط 🚀</button>
            </form>
        </div>
    </body>`);
});

app.post('/pair', async (req, res) => {
    const num = req.body.number.replace(/[^0-9]/g, '');
    if (!num) return res.send("الرجاء إدخال رقم صحيح");

    const authPath = `./sessions/${num}`;
    
    // مسح الجلسة القديمة لضمان عدم حدوث خطأ في الكود
    if (fs.existsSync(authPath)) fs.removeSync(authPath);

    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        // إعدادات المتصفح لضمان استلام الإشعار على الجوال
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    try {
        const code = await sock.requestPairingCode(num);
        res.send(`
        <body style="background:#020617; color:white; text-align:center; padding-top:100px; font-family:sans-serif;">
            <h2 style="color:#94a3b8;">كود الربط للرقم ${num}:</h2>
            <h1 style="color:#d4a017; font-size:70px; letter-spacing:10px;">${code}</h1>
            <p style="color:#22c55e;">افتح واتساب > الأجهزة المرتبطة > ربط هاتف، وأدخل الكود.</p>
            <a href="/" style="color:#d4a017; text-decoration:none;">العودة للرئيسية</a>
        </body>`);
    } catch (e) {
        res.send("خطأ في السيرفر، حاول مجدداً.");
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            console.log(`✅ نجاح الربط للرقم: ${num}`);
            await sock.sendMessage(sock.user.id, { text: "✅ تم ربط رقمك بنجاح في بوت الملك فارس!\n\nيمكنك الآن استخدام الذكاء الاصطناعي مباشرة." });
        }
        if (connection === 'close') {
            // إعادة تشغيل الجلسة تلقائياً عند انقطاع الاتصال
            startSession(num);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        // معالجة الرد بالذكاء الاصطناعي
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-pro" });
            const result = await model.generateContent(text);
            const aiReply = result.response.text();
            await sock.sendMessage(from, { text: aiReply });
        } catch (err) {
            console.error("AI Error");
        }
    });
});

// دالة لإعادة تشغيل الجلسات عند توقف السيرفر
async function startSession(num) {
    const authPath = `./sessions/${num}`;
    if (!fs.existsSync(authPath)) return;
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const sock = makeWASocket({ auth: state, logger: pino({ level: "silent" }), browser: ["Ubuntu", "Chrome", "20.0.04"] });
    sock.ev.on('creds.update', saveCreds);
    // تكرار منطق الاستقبال هنا...
}

app.listen(port, () => console.log(`لوحة التحكم تعمل على المنفذ ${port}`));
