const { default: makeWASocket, useMultiFileAuthState, Browsers, delay } = require("@whiskeysockets/baileys");
const express = require("express");
const fs = require("fs-extra");
const pino = require("pino");

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// الواجهة التي ستظهر لك عند فتح الرابط
app.get("/", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>بوت الملك فارس 👑</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0b141a; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .container { background-color: #111b21; padding: 30px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); text-align: center; width: 90%; max-width: 400px; border-top: 5px solid #25d366; }
                input { width: 80%; padding: 12px; margin: 20px 0; border: none; border-radius: 8px; background: #2a3942; color: white; font-size: 16px; text-align: center; }
                button { background-color: #25d366; color: #0b141a; border: none; padding: 12px 25px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 16px; }
                #result { margin-top: 25px; font-size: 22px; font-weight: bold; color: #ffd700; letter-spacing: 3px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>👑 بوت الملك فارس</h2>
                <p>أدخل رقمك للحصول على كود الربط</p>
                <input type="text" id="number" placeholder="مثال: 967777777777">
                <br>
                <button onclick="getCode()">طلب كود الربط 🔢</button>
                <div id="result"></div>
            </div>
            <script>
                async function getCode() {
                    const num = document.getElementById('number').value;
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
                        resDiv.innerText = data.code || "❌ خطأ في الرقم";
                    } catch (e) { resDiv.innerText = "❌ فشل الاتصال"; }
                }
            </script>
        </body>
        </html>
    `);
});

app.post("/api/pairing", async (req, res) => {
    const { num } = req.body;
    // تنظيف الجلسة القديمة لضمان عمل الكود
    if (fs.existsSync('./session')) fs.emptyDirSync('./session');
    
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: "silent" }),
        browser: Browsers.ubuntu("Chrome")
    });

    sock.ev.on("creds.update", saveCreds);
    
    try {
        await delay(5000); // وقت مستقطع لضمان استقرار الطلب
        let code = await sock.requestPairingCode(num);
        res.json({ code });
    } catch (err) { res.json({ error: true }); }
});

app.listen(PORT, () => console.log("Server Active"));
