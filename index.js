const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs-extra');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

// مجلد أساسي لتخزين الجلسات المنفردة
const SESSIONS_BASE = path.join(__dirname, 'all_sessions');

app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number;
    if (!phone) return res.json({ error: "يرجى إدخال رقم الهاتف" });
    phone = phone.replace(/[^0-9]/g, '');

    // توليد معرف فريد لهذه الجلسة لضمان استقلالها
    const requestId = crypto.randomBytes(8).toString('hex');
    const sessionPath = path.join(SESSIONS_BASE, requestId);

    try {
        // إنشاء حالة جديدة تماماً لهذا الطلب
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();

        const socket = makeWASocket({
            auth: state,
            version: version,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            // استخدام هوية متصفح حديثة لضمان وصول الإشعار فوراً
            browser: ["Ubuntu", "Chrome", "110.0.5481.177"]
        });

        // طلب الكود مباشرة دون فحص التسجيل القديم
        await delay(3000); 
        const code = await socket.requestPairingCode(phone);
        
        if (!res.headersSent) {
            res.json({ 
                status: true, 
                pairing_code: code 
            });
        }

        // حفظ التحديثات لهذه الجلسة فقط
        socket.ev.on('creds.update', saveCreds);

        // مراقبة الاتصال: إذا نجح الربط يتم ترك الجلسة، وإذا فشل يتم تنظيفها
        socket.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                console.log(`✅ Success pairing for: ${phone}`);
                // الجلسة الآن مفعلة ومنفصلة
            }
        });

        // تنظيف تلقائي للمجلد إذا لم يتم الربط خلال 5 دقائق لتوفير المساحة
        setTimeout(async () => {
            if (!socket.user) {
                socket.end();
                await fs.remove(sessionPath);
            }
        }, 300000);

    } catch (err) {
        console.error("Pairing Error:", err);
        await fs.remove(sessionPath);
        if (!res.headersSent) {
            res.status(500).json({ error: "حدث خطأ في السيرفر" });
        }
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`سيرفر فارس العام يعمل على المنفذ ${port}`);
});
