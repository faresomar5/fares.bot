const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");

const app = express();
const port = process.env.PORT || 3000;

// 1. نظام توليد كود الاقتران (API)
app.get('/api/pairing', async (req, res) => {
    let phone = req.query.number?.replace(/[^0-9]/g, '');
    if (!phone) return res.json({ error: "يرجى إدخال الرقم" });

    try {
        // الحل: استخدام اسم مجلد متغير أو مسح المجلد الحالي لضمان طلب كود جديد
        const { state, saveCreds } = await useMultiFileAuthState('fares_final_session');
        
        const socket = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            browser: ["Mac OS", "Chrome", "10.15.7"]
        });

        // طلب الكود مباشرة دون فحص "registered" المعيب في النسخ القديمة
        await delay(3000);
        const code = await socket.requestPairingCode(phone);
        
        res.json({ status: true, pairing_code: code });

        socket.ev.on('creds.update', saveCreds);
    } catch (err) {
        res.status(500).json({ error: "فشل الطلب، جرب مسح Cache في Render" });
    }
});

    // تنظيف الرقم من المسافات أو الرموز
    phone = phone.replace(/[^0-9]/g, '');

    try {
        // تعريف الحالة لمرة واحدة فقط
        const { state, saveCreds } = await useMultiFileAuthState('session');
        const { version } = await fetchLatestBaileysVersion();

        // تعريف الـ socket لمرة واحدة مع أفضل الإعدادات لوصول الكود
        const socket = makeWASocket({
            auth: state,
            version: version,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            // استخدام هوية متصفح موثوقة
            browser: ["Mac OS", "Chrome", "10.15.7"]
        });

        if (!socket.authState.creds.registered) {
            await delay(2000); // تأخير بسيط لاستقرار الاتصال
            const code = await socket.requestPairingCode(phone);
            
            if (!res.headersSent) {
                res.json({ 
                    status: true, 
                    pairing_code: code 
                });
            }
        } else {
            if (!res.headersSent) {
                res.json({ status: false, message: "الرقم مربوط مسبقاً" });
            }
        }

        // حفظ التحديثات
        socket.ev.on('creds.update', saveCreds);

    } catch (err) {
        console.error("Error in Pairing:", err);
        if (!res.headersSent) {
            res.status(500).json({ error: "خطأ في السيرفر", details: err.message });
        }
    }
});

// 2. فتح واجهة الموقع (index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 3. تشغيل السيرفر
app.listen(port, () => {
    console.log(`السيرفر يعمل الآن بنجاح على المنفذ ${port}`);
});
