const {
    default: makeWASocket,
    useMultiFileAuthState,
    Browsers,
    delay
} = require("@whiskeysockets/baileys");
const express = require("express");
const path = require("path");
const fs = require("fs-extra");
const pino = require("pino");

const app = express();
app.use(express.static('public'));
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <title>Fares Bot Pairing</title>
            <style>
                body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f0f2f5; }
                .card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
                input { padding: 10px; width: 80%; margin: 10px 0; border: 1px solid #ccc; border-radius: 5px; }
                button { padding: 10px 20px; background: #25d366; color: white; border: none; border-radius: 5px; cursor: pointer; }
                #code { font-size: 24px; font-weight: bold; color: #075e54; margin-top: 20px; letter-spacing: 5px; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>ربط بوت فارس</h2>
                <p>أدخل رقمك مع رمز الدولة (مثلاً 967xxx)</p>
                <input type="text" id="number" placeholder="967777777777">
                <button onclick="getCode()">الحصول على الكود</button>
                <div id="code"></div>
            </div>
            <script>
                async function getCode() {
                    const num = document.getElementById('number').value;
                    const codeDiv = document.getElementById('code');
                    codeDiv.innerText = "جاري الطلب...";
                    const res = await fetch('/api/pairing', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({num})
                    });
                    const data = await res.json();
                    codeDiv.innerText = data.code || "خطأ في الرقم";
                }
            </script>
        </body>
        </html>
    `);
});

app.post("/api/pairing", async (req, res) => {
    const { num } = req.body;
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: "silent" }),
        browser: Browsers.ubuntu("Chrome")
    });

    sock.ev.on("creds.update", saveCreds);

    try {
        await delay(3000);
        let code = await sock.requestPairingCode(num);
        res.json({ code });
    } catch (err) {
        res.json({ error: "فشل طلب الكود" });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
