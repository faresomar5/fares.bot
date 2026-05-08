import logging
import requests
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# الإعدادات الأساسية
TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I"
API_URL = "https://fares-bot-eahg.onrender.com/api/pairing" # رابط موقعك المربوط

# إعداد السجلات
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """رسالة الترحيب عند تشغيل البوت"""
    user_name = update.effective_user.first_name
    message = (
        f"👋 أهلاً بك يا {user_name} في بوت الملك فارس.\n\n"
        "🚀 هذا البوت يساعدك على ربط رقمك بالخدمة واستخراج كود الاقتران.\n\n"
        "📱 **للبدء:** أرسل رقم هاتفك مع رمز الدولة (مثال: 967771xxxxxx)"
    )
    await update.message.reply_text(message)

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """معالجة رقم الهاتف المرسل"""
    number = update.message.text.strip()
    
    # التحقق من أن المدخلات أرقام فقط
    if not number.isdigit() or len(number) < 8:
        await update.message.reply_text("❌ خطأ: يرجى إرسال رقم هاتف صحيح مع رمز الدولة بدون (+) أو أصفار في البداية.")
        return

    msg = await update.message.reply_text("⏳ جاري الاتصال بالسيرفر وتوليد الكود... يرجى الانتظار (قد يستغرق الأمر 10 ثوانٍ)")

    try:
        # إرسال الطلب لموقعك على Render
        response = requests.post(API_URL, json={"num": number}, timeout=20)
        data = response.json()

        if data.get("success") and data.get("code"):
            pairing_code = data.get("code")
            final_msg = (
                "✅ **تم توليد كود الربط بنجاح!**\n\n"
                f"🔢 الكود هو: `{pairing_code}`\n\n"
                "ℹ️ قم بنسخ الكود وضعه في إشعار 'ربط جهاز جديد' الذي سيظهر في واتساب الخاص بك."
            )
            await msg.edit_text(final_msg, parse_mode="Markdown")
        else:
            await msg.edit_text("❌ فشل السيرفر في توليد الكود. تأكد أن الرقم غير مرتبط ببوت آخر حالياً.")
    
    except Exception as e:
        logging.error(f"Error: {e}")
        await msg.edit_text("⚠️ خطأ في الاتصال بالسيرفر. تأكد أن موقع Render يعمل حالياً وليس في وضع النوم.")

def main():
    """تشغيل البوت"""
    application = Application.builder().token(TOKEN).build()

    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    print("✅ بوت التليجرام يعمل الآن...")
    application.run_polling()

if __name__ == '__main__':
    main()
