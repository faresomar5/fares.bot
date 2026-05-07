import os
import asyncio
import httpx
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# --- الإعدادات الأساسية ---
# التوكن الخاص بك (تأكد أنه الأحدث من BotFather)
BOT_TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I"

# رابط موقعك على Render (بدون شرطة مائلة في النهاية)
BASE_URL = "https://fares-bot-eahg.onrender.com"

# --- دالة طلب الكود ---
async def get_pairing_code(phone):
    # تنظيف الرقم من أي رموز أو مسافات
    clean_phone = phone.replace('+', '').replace(' ', '').replace('-', '')
    url = f"{BASE_URL}/pairing?number={clean_phone}"
    
    async with httpx.AsyncClient() as client:
        try:
            # 1. إيقاظ السيرفر (Wake up call)
            # هذه الخطوة تمنع الخطأ إذا كان السيرفر في وضع الخمول (Sleep)
            await client.get(BASE_URL, timeout=15.0)
            
            # 2. طلب الكود الفعلي مع مهلة انتظار طويلة (120 ثانية)
            # لأن توليد الكود في أول مرة يستغرق وقتاً طويلاً على Render
            print(f"جاري طلب الكود للرقم: {clean_phone}")
            response = await client.get(url, timeout=120.0)
            
            if response.status_code == 200:
                data = response.json()
                return data.get('code')
            else:
                print(f"خطأ من السيرفر: {response.status_code}")
                
        except Exception as e:
            print(f"حدث خطأ أثناء الاتصال: {e}")
    return None

# --- معالجة أوامر البوت ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "مرحباً بك في بوت فارس لربط الواتساب 👑\n\n"
        "من فضلك أرسل رقم الواتساب مع رمز الدولة الآن\n"
        "مثال: `967771163825`",
        parse_mode='Markdown'
    )

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    phone = update.message.text.strip()
    
    # رسالة انتظار للمستخدم
    msg = await update.message.reply_text("⏳ جاري الاتصال بالسيرفر وتوليد كود الربط... قد يستغرق الأمر دقيقة.")
    
    # استدعاء دالة طلب الكود
    code = await get_pairing_code(phone)
    
    if code:
        await msg.edit_text(
            f"✅ تم توليد كود الربط بنجاح:\n\n"
            f"`{code}`\n\n"
            "قم بنسخ الكود ووضعه في الواتساب (ربط جهاز جديد).",
            parse_mode='Markdown'
        )
    else:
        await msg.edit_text(
            "❌ فشل توليد الكود.\n\n"
            "الأسباب المحتملة:\n"
            "1. السيرفر يحتاج وقت أطول للبدء، جرب مرة أخرى الآن.\n"
            "2. الرقم المرسل غير صحيح.\n"
            "3. ضغط كبير على سيرفرات واتساب."
        )

# --- تشغيل البوت ---
def main():
    # بناء التطبيق
    application = Application.builder().token(BOT_TOKEN).build()
    
    # إضافة الأوامر والمستقبلات
    application.add_handler(CommandHandler("start", start))
    application.add_handler(
