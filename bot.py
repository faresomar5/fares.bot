import httpx
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# --- الإعدادات ---
# ضع توكن البوت الخاص بك هنا
BOT_TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I"

# رابط موقعك على Render الذي يحتوي على ملف Node.js
# لاحظ أننا نستخدم الرابط الخارجي الكامل ليتمكن البوت الخارجي من الوصول إليه
BASE_URL = "https://fares-bot-eahg.onrender.com"

async def get_pairing_code(phone):
    # تنظيف الرقم
    clean_phone = phone.replace('+', '').replace(' ', '').replace('-', '')
    url = f"{BASE_URL}/pairing?number={clean_phone}"
    
    async with httpx.AsyncClient() as client:
        try:
            # تنبيه الموقع (Render) للاستيقاظ إذا كان خاملاً
            # هذه الخطوة ضرورية لأنك تستخدم Render Free Tier
            print("⏳ جاري إيقاظ سيرفر Render...")
            await client.get(BASE_URL, timeout=20.0)
            
            # طلب كود الربط
            print(f"📡 جاري طلب الكود للرقم {clean_phone} من Render...")
            response = await client.get(url, timeout=100.0)
            
            if response.status_code == 200:
                return response.json().get('code')
        except Exception as e:
            print(f"❌ خطأ في الاتصال بموقع Render: {e}")
    return None

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("مرحباً بك! أرسل رقم الواتساب مع رمز الدولة (مثال: 967771163825):")

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    phone = update.message.text.strip()
    msg = await update.message.reply_text("⏳ جاري التواصل مع السيرفر وتوليد الكود... انتظر قليلاً.")
    
    code = await get_pairing_code(phone)
    
    if code:
        await msg.edit_text(f"✅ كود الربط الخاص بك:\n\n`{code}`", parse_mode='Markdown')
    else:
        await msg.edit_text("❌ السيرفر لم يستجب. تأكد أن موقع Render يعمل أو حاول مرة أخرى.")

def main():
    application = Application.builder().token(BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    
    print("🚀 البوت يعمل الآن على الاستضافة الخارجية ومتصل بـ Render...")
    application.run_polling()

if __name__ == '__main__':
    main()
