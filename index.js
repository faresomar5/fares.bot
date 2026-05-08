const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    Browsers, 
    delay, 
    DisconnectReason 
} = require("@whiskeysockets/baileys");
const express = require("express");
const fs = require("fs-extra");
const pino = require("pino");

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// --- واجهة الويب (بوت الملك فارس) ---
app.get("/", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>بوت الملك فارس 👑</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0b141a; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .container { background-color: #111b21; padding: 30px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); text-align: center; width: 90%; max-width: 400px; border-top: 5px solid #25d366; }
                h2 { color: #25d366; margin-bottom: 10px; }
                input { width: 85%; padding: 12px; margin: 20px 0; border: none; border-radius: 8px; background: #2a3942; color: white; font-size: 18px; text-align: center; outline: none; }
                button { background-color: #25d366; color: #0b141a; border: none; padding: 12px 25px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 16px; width: 100%; transition: 0.3s; }
                button:hover { background-color: #1da851; }
                #result { margin-top: 25px; font-size: 24px; font-weight: bold; color: #ffd700; letter-spacing: 3px; min-height: 30px; }
                .footer { margin-top: 20px; font-size: 12px; color: #8696a0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>👑 بوت الملك فارس</h2>
                <p>بوابة ربط الأجهزة الآمنة</p>
                <input type="text" id="number" placeholder="مثال: 9677773987296">
                <button onclick="getCode()">طلب كود الربط 🔢</button>
                <div id="result"></div>
                <div class="footer">تأكد من إدخال الرقم مع رمز الدولة بدون (+)</div>
            </div>
            <script>
                async function getCode() {
                    const num = document.getElementById('number').value.replace(/[^0-9]/g, '');
                    const resDiv = document.getElementById('result');
                    if(!num) return alert("يرجى إدخال الرقم أولاً");
                    resDiv.innerText = "⏳ جاري طلب الكود...";
                    try {
                        const response = await fetch('/api/pairing', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({num})
                        });
                        const data = await response.json();
                        if(data.code) {
                            resDiv.innerText = data.code;
                        } else {
                            resDiv.innerText = "❌ خطأ في الرقم";
                        }
                    } catch (e) { resDiv.innerText = "❌ فشل الاتصال بالسيرفر"; }
                }
            </script>
        </body>
        </html>
    `);
});

// --- معالجة طلب الكود ---
app.post("/api/pairing", async (req, res) => {
    let { num } = req.body;
    num = num.replace(/[^0-9]/g, '');

    // تنظيف أي جلسة قديمة تسبب "خطأ في الرقم"
    try {
        if (fs.existsSync('./session')) {
            fs.rmSync('./session', { recursive: true, force: true });
        }
    } catch (e) { console.log("Cleaning session..."); }

    const { state, saveCreds } = await useMultiFileAuthState('./session');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: "silent" }),
        browser: Browsers.ubuntu("Chrome")
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection } = update;
        if (connection === "open") {
            console.log("✅ تم الاتصال بنجاح!");
        }
    });

    try {
        await delay(7000); // وقت انتظار لضمان استجابة خوادم واتساب
        let code = await sock.requestPairingCode(num);
        res.json({ code });
    } catch (err) {
        console.error(err);
        res.json({ error: true });
    }
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`Server is live on port ${PORT}`);
});
