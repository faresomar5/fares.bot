import httpx
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes, MessageHandler, filters

# --- الإعدادات ---
# التوكن الجديد الخاص بك
BOT_TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I"
# رابط موقعك على Render
BASE_URL = "https://fares-bot-eahg.onrender.com"

# --- دالة جلب الكود من الموقع ---
async def get_pairing_code(phone):
    # تنظيف الرقم من أي مسافات أو رموز
    clean_phone = phone.replace('+', '').replace(' ', '')
    url = f"{BASE_URL}/pairing?number={clean_phone}"
    
    async with httpx.AsyncClient() as client:
        try:
            # مهلة انتظار 60 ثانية لأن الموقع قد يكون في وضع الاستراحة (Sleep)
            response = await client.get(url, timeout=60.0)
            if response.status_code == 200:
                data = response.json()
                return data.get('code')
        except Exception as e:
            print(f"خطأ في الاتصال بالموقع: {e}")
    return None

# --- أوامر البوت ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [[InlineKeyboardButton("🔗 ربط الواتساب الآن", callback_data='get_code')]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(
        "مرحباً بك في بوت فارس 👑\nأرسل رقمك للحصول على كود الربط مباشرة من الموقع.",
        reply_markup=reply_markup
    )

async def handle_button(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == 'get_code':
        context.user_data['waiting_phone'] = True
        await query.edit_message_text("أرسل الآن رقم الواتساب مع رمز الدولة (مثال: 967771163825):")

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if context.user_data.get('waiting_phone'):
        phone = update.message.text.strip()
        msg = await update.message.reply_text("⏳ جاري التواصل مع الموقع وتوليد الكود...")
        
        # طلب الكود من الرابط الخارجي
        code = await get_pairing_code(phone)
        
        if code:
            await msg.edit_text(f"✅ كود الربط الخاص بك هو:\n\n`{code}`", parse_mode='Markdown')
        else:
            await msg.edit_text("❌ الموقع لا يستجيب حالياً. تأكد أن رابط Render يعمل بشكل صحيح.")
        
        context.user_data['waiting_phone'] = False

def main():
    application = Application.builder().token(BOT_TOKEN).build()
    
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CallbackQueryHandler(handle_button))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    
    print("البوت شغال ومرتبط بالموقع...")
    application.run_polling()

if __name__ == '__main__':
    main()
