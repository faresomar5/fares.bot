const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys");
const express = require("express");
const pino = require("pino");
const app = express();
const PORT = process.env.PORT || 10000;

let sock;

async function startWhatsApp() {
    // استخدام مجلد 'session' بدلاً من 'auth_info' لضمان الثبات
    const { state, saveCreds } = await useMultiFileAuthState('session');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: ["Ubuntu", "Chrome", "20.0.04"] // ضروري لتعريف المتصفح للسيرفر
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection } = update;
        if (connection === "close") {
            console.log("إعادة الاتصال بسيرفر واتساب...");
            startWhatsApp();
        } else if (connection === "open") {
            console.log("✅ سيرفر فارس جاهز لاستقبال الطلبات");
        }
    });
}

// الرابط الذي يطلبه البوت
app.get("/pairing", async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: "الرقم مطلوب" });

    try {
        // تنظيف الرقم من أي رموز زائدة
        const cleanNumber = num.replace(/[^0-9]/g, '');
        
        // طلب كود الربط مع مهلة انتظار بسيطة لضمان الجاهزية
        await delay(1500); 
        const code = await sock.getPairingCode(cleanNumber);
        
        console.log(`تم توليد كود للرقم: ${cleanNumber}`);
        res.json({ code: code });
    } catch (e) {
        console.error("خطأ في السيرفر:", e);
        res.status(500).json({ error: "فشل طلب الكود من واتساب" });
    }
});

app.get("/", (req, res) => res.send("<h1>سيرفر فارس شغال بنجاح!</h1>"));

app.listen(PORT, () => {
    console.log("السيرفر يعمل حالياً على المنفذ: " + PORT);
    startWhatsApp();
});
