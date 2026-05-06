const express = require('express');
const app = express();
const path = require('path');

// --- إعدادات أساسية ---
app.use(express.json());
app.use(express.static('public')); // إذا كان لديك مجلد للموقع

// --- الجزء الأهم: مسار جلب كود الربط للبوت ---
app.get('/pairing', async (req, res) => {
    const phoneNumber = req.query.number;
    
    if (!phoneNumber) {
        return res.status(400).json({ error: "رقم الهاتف مطلوب" });
    }

    try {
        // تنبيه: يجب أن يكون متغير 'conn' أو 'sock' هو المحرك الأساسي للواتساب في كودك
        // هذه الدالة هي المسؤولة عن توليد الكود من مكتبة Baileys
        if (global.conn) {
            const code = await global.conn.getPairingCode(phoneNumber);
            res.json({ code: code });
        } else {
            res.status(500).json({ error: "سيرفر الواتساب غير متصل حالياً" });
        }
    } catch (err) {
        console.error("خطأ في توليد الكود:", err);
        res.status(500).json({ error: "فشل في توليد الكود من السيرفر" });
    }
});

// --- تشغيل السيرفر على المنفذ المطلوب من Render ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`الموقع يعمل على المنفذ: ${PORT}`);
});
