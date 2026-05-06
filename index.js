const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys");
const express = require("express");
const pino = require("pino");
const app = express();
const PORT = process.env.PORT || 10000;

let sock;

async function connectToWA() {
    const { state, saveCreds } = await useMultiFileAuthState('session');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection } = update;
        if (connection === "close") connectToWA();
        else if (connection === "open") console.log("✅ سيرفر الواتساب متصل ومستعد!");
    });
}

// المسار الذي يطلبه البوت (هنا يكمن الحل)
app.get("/pairing", async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: "الرقم مطلوب" });

    try {
        num = num.replace(/[^0-9]/g, '');
        // طلب كود الربط من مكتبة Baileys
        const code = await sock.getPairingCode(num);
        res.json({ code: code });
    } catch (err) {
        console.error("خطأ في توليد الكود:", err);
        res.status(500).json({ error: "فشل توليد الكود" });
    }
});

app.get("/", (req, res) => res.send("<h1>Fares Bot Server is Online!</h1>"));

app.listen(PORT, () => {
    console.log(`الموقع يعمل على المنفذ: ${PORT}`);
    connectToWA();
});
