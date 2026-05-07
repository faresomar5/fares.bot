import os
import asyncio
import httpx
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# --- الإعدادات الأساسية ---
BOT_TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I"
BASE_URL = "https://fares-bot-eahg.onrender.com"

# --- دالة طلب الكود ---
async def get_pairing_code(phone):
    clean_phone = phone.replace('+', '').replace(' ', '').replace('-', '')
    url = f"{BASE_URL}/pairing?number={clean_phone}"
    
    async with httpx.AsyncClient() as client:
        try:
            # إيقاظ السيرفر
            await client.get(BASE_URL, timeout=15.0)
            
            # طلب الكود مع مهلة 120 ثانية
            print(f"جاري طلب الكود للرقم: {clean_phone}")
            response = await client.get(url, timeout=120.0)
            
            if response.status_code == 200:
                data = response.json()
                return data.get('code')
        except Exception as e:
            print(f"حدث خطأ أثناء الاتصال: {e}")
    return None

# --- معالجة أوامر البوت ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "مرحباً بك في بوت فارس لربط الواتساب 👑\n\nأرسل رقمك الآن (مثال: 967771163825):"
    )

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    phone = update.message.text.strip()
    msg = await update.message.reply_text("⏳ جاري توليد كود الربط... قد يستغرق الأمر دقيقة.")
    
    code = await get_pairing_code(phone)
    
    if code:
        await msg.edit_text(f"✅ تم توليد الكود:\n\n`{code}`", parse_mode='Markdown')
    else:
        await msg.edit_text("❌ فشل توليد الكود، يرجى المحاولة مرة أخرى.")

# --- تشغيل البوت ---
def main():
    # بناء التطبيق
    application = Application.builder().token(BOT_TOKEN).build()
    
    # إضافة الأوامر (تأكد من إغلاق الأقواس هنا)
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    
    print("البوت يعمل الآن...")
    application.run_polling()

if __name__ == '__main__':
    main()
