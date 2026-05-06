const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const express = require("express");
const pino = require("pino");
const app = express();
const PORT = process.env.PORT || 10000;

let sock;

async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" })
    });
    sock.ev.on("creds.update", saveCreds);
}

// الرابط الذي سيطلبه البوت
app.get("/pairing", async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).send("الرقم مطلوب");
    try {
        const code = await sock.getPairingCode(num.replace(/[^0-9]/g, ''));
        res.json({ code: code });
    } catch (e) {
        res.status(500).json({ error: "فشل طلب الكود" });
    }
});

app.get("/", (req, res) => res.send("سيرفر فارس يعمل!"));

app.listen(PORT, () => {
    console.log("السيرفر نشط على المنفذ " + PORT);
    startWhatsApp();
});
