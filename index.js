const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestBaileysVersion 
} = require("@whiskeysockets/baileys");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require('express');
const pino = require('pino');
const fs = require('fs-extra');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const genAI = new GoogleGenerativeAI("AIzaSyBklT9MOcHID87Fnb86Xz0F551v9Vw_P-k");

// مصفوفة لتخزين الجلسات النشطة
let sessions = {};

app.get('/', (req, res) => {
    res.send(`
    <body style="background:#020617; color:white; font-family:sans-serif; text-align:center; padding:30px;">
        <h1 style="color:#d4a017;">👑 منصة الملك فارس العامة للربط</h1>
        <p style="color:#94a3b8;">يمكن لأي شخص ربط رقمه الآن والاستفادة من الذكاء الاصطناعي</p>
        <div style="background:#0f172a; padding:30px; border-radius:20px; border:1px solid #1e293b; max-width:400px; display:inline-block;">
            <form action="/pair" method="POST">
                <input type="text" name="number" placeholder="967..." required style="width:100%; padding:12px; margin-bottom:15px; border-radius:8px; border:1px solid #1e293b; background:#020617; color:white; text-align:center;">
                <button type="submit" style="width:100%; background:linear-gradient(45deg, #d4a017, #f9d976); color:black; padding:12px; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">استخراج كود الربط 🚀</button>
            </form>
            <p style="font-size:12px; color:#64748b; margin-top:10px;">ملاحظة: يتم إرسال إشعار فوري عند اكتمال الربط.</p>
        </div>
    </body>`);
});

app.post('/pair', async (req, res) => {
    const num = req.body.number.replace(/[^0-9]/g, '');
    if (!num) return res.send("الرجاء إدخال رقم صحيح");
    
    // بدء جلسة جديدة لهذا الرقم تحديداً
    const code = await startSession(num);
    res.send(`
    <body style="background:#020617; color:white; text-align:center; padding-top:100px; font-family:sans-serif;">
        <h2 style="color:#94a3b8;">كود الربط الخاص بالرقم ${num} هو:</h2>
        <h1 style="color:#d4a017; font-size:60px; letter-spacing:10px;">${code}</h1>
        <p style="color:#22c55e;">قم بنسخ الكود وضعه في إشعارات الواتساب بجوالك.</p>
        <br><a href="/" style="color:#d4a017; text-decoration:none;">← العودة للرئيسية</a>
    </body>`);
});

app.listen(port, () => console.log("Server online"));

async function startSession(num) {
    // إنشاء مجلد خاص لكل رقم لضمان عدم التداخل
    const authPath = `./sessions/${num}`;
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        browser: ["Chrome (Linux)", "", ""]
    });

    // استخراج الكود للرقم المطلوب
    const code = await sock.requestPairingCode(num);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
            console.log(`✅ تم ربط الرقم بنجاح: ${num}`);
            // إرسال إشعار عند نجاح الربط
            await sock.sendMessage(sock.user.id, { 
                text: `✅ مرحباً بك في نظام الملك فارس!\n\nتم ربط رقمك (${num}) بنجاح.\nالآن يمكنك استقبال ردود الذكاء الاصطناعي تلقائياً.` 
            });
            sock.sendPresenceUpdate('available');
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
            if (shouldReconnect) startSession(num);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        // معالجة الذكاء الاصطناعي لكل رقم مربوط بشكل مستقل
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-pro" });
            const result = await model.generateContent(text);
            const aiReply = result.response.text();
            await sock.sendMessage(from, { text: aiReply });
        } catch (e) {
            console.error("AI Error for session " + num);
        }
    });

    return code;
}
