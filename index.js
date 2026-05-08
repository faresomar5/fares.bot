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

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let pairingCode = "لم يتم طلب كود بعد";

// --- واجهة الويب (لوحة التحكم العامة) ---
app.get('/', (req, res) => {
    res.send(`
        <div style="text-align:center; margin-top:50px; font-family:Arial; direction:rtl;">
            <h1 style="color:#25D366;">لوحة تحكم بوت الحالات العامة</h1>
            <p>أدخل رقمك مع مفتاح الدولة (مثال: 967773987296)</p>
            <form action="/get-code" method="POST">
                <input type="text" name="number" placeholder="رقم الهاتف" style="padding:10px; width:250px; border-radius:5px; border:1px solid #ccc;">
                <button type="submit" style="padding:10px 20px; background:#25D366; color:white; border:none; border-radius:5px; cursor:pointer;">الحصول على كود الربط</button>
            </form>
            <div style="margin-top:30px; padding:20px; background:#f9f9f9; display:inline-block; border-radius:10px; border:2px dashed #25D366;">
                <strong>كود الاقتران الخاص بك:</strong> 
                <h2 style="color:#e74c3c; letter-spacing:5px;">${pairingCode}</h2>
            </div>
            <p style="font-size:12px; color:#666;">ملاحظة: الكود يظهر هنا وأيضاً في سجلات السيرفر.</p>
        </div>
    `);
});

app.post('/get-code', async (req, res) => {
    const num = req.body.number.replace(/[^0-9]/g, '');
    if (!num) return res.send("الرجاء إدخال رقم صحيح");
    
    // تشغيل وظيفة الربط للرقم المدخل
    await startBot(num);
    
    res.send(`
        <div style="text-align:center; margin-top:50px; font-family:Arial;">
            <h2>جاري طلب الكود للرقم: ${num}</h2>
            <p>ارجع للصفحة الرئيسية بعد 10 ثوانٍ وحدث الصفحة (Refresh) لتجد الكود.</p>
            <a href="/">العودة للرئيسية</a>
        </div>
    `);
});

app.listen(port, () => console.log(`الموقع شغال على الرابط الخاص بك في Render`));

// --- وظيفة البوت المرنة ---
async function startBot(userNum = null) {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" })
    });

    if (userNum && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                pairingCode = await sock.requestPairingCode(userNum);
                console.log(`كود الربط للرقم ${userNum} هو: ${pairingCode}`);
            } catch (err) {
                console.error("خطأ:", err);
            }
        }, 5000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (msg.key.remoteJid === 'status@broadcast') {
            await delay(Math.floor(Math.random() * 10000) + 5000);
            await sock.readMessages([msg.key]);
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'open') pairingCode = "تم الربط بنجاح! ✅";
    });
}

// تشغيل البوت في الخلفية عند بدء السيرفر
startBot();
