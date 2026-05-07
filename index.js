const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys");
const express = require("express");
const pino = require("pino");
const app = express();
const PORT = process.env.PORT || 10000;

let sock;

async function startWhatsApp() {
    // استخدمنا مجلد 'session' لضمان الثبات
    const { state, saveCreds } = await useMultiFileAuthState('session');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection } = update;
        if (connection === "close") startWhatsApp();
        if (connection === "open") console.log("✅ واتساب جاهز");
    });
}

app.get("/pairing", async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: "الرقم مطلوب" });
    try {
        const code = await sock.getPairingCode(num.replace(/[^0-9]/g, ''));
        res.json({ code: code });
    } catch (e) {
        res.status(500).json({ error: "فشل طلب الكود" });
    }
});

app.get("/", (req, res) => res.send("Server is running"));

app.listen(PORT, '0.0.0.0', () => {
    console.log("السيرفر نشط على المنفذ " + PORT);
    startWhatsApp();
});
