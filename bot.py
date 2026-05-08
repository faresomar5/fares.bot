import httpx
import asyncio
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# --- الإعدادات ---
BOT_TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I"
# الرابط الجديد الذي زودتني به
API_URL = "https://bot.goldenqueen.store/api/pairing"

async def get_pairing_code(phone):
    # تنظيف الرقم من المسافات والرموز
    clean_phone = phone.replace('+', '').replace(' ', '').replace('-', '')
    
    # بناء الرابط مع الرقم المطللوب
    # ملاحظة: تم استخدام باراميتر ?number= بناءً على نظامك السابق
    url = f"{API_URL}?number={clean_phone}"
    
    async with httpx.AsyncClient() as client:
        try:
            print(f"📡 جاري طلب الكود للرقم {clean_phone} من السيرفر الجديد...")
            # مهلة انتظار 60 ثانية
            response = await client.get(url, timeout=60.0)
            
            if response.status_code == 200:
                data = response.json()
                # جلب الكود من استجابة الـ JSON
                return data.get('code')
            else:
                print(f"❌ خطأ من السيرفر: {response.status_code}")
        except Exception as e:
            print(f"❌ خطأ في الاتصال: {e}")
    return None

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "مرحباً بك يا فارس! البوت يعمل الآن بالرابط الجديد 🚀\n\n"
        "أرسل رقم الواتساب (مثال: 967771163825):"
    )

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    phone = update.message.text.strip()
    msg = await update.message.reply_text("⏳ جاري التواصل مع السيرفر وتوليد الكود...")
    
    code = await get_pairing_code(phone)
    
    if code:
        await msg.edit_text(f"✅ كود الربط الخاص بك هو:\n\n`{code}`", parse_mode='Markdown')
    else:
        await msg.edit_text("❌ لم يتم استلام الكود من السيرفر. تأكد من صحة الرقم أو جرب لاحقاً.")

def main():
    application = Application.builder().token(BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    
    print("🚀 البوت بدأ العمل على السيرفر الجديد...")
    application.run_polling()

if __name__ == '__main__':
    main()
