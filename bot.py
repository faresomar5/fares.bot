import httpx
import asyncio
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# --- الإعدادات ---
BOT_TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I"
# نستخدم الرابط الخارجي لموقعك كما يظهر في Render
BASE_URL = "https://fares-bot-eahg.onrender.com"

async def get_pairing_code(phone):
    clean_phone = phone.replace('+', '').replace(' ', '')
    # الرابط الكامل لطلب الكود
    url = f"{BASE_URL}/pairing?number={clean_phone}"
    
    async with httpx.AsyncClient() as client:
        try:
            # مهلة انتظار طويلة (80 ثانية) لأن السيرفر المجاني يحتاج وقت للبدء
            response = await client.get(url, timeout=80.0)
            if response.status_code == 200:
                data = response.json()
                return data.get('code')
        except Exception as e:
            print(f"Error calling API: {e}")
    return None

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("مرحباً فارس! أرسل رقم الواتساب (مثال: 967771163825):")

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    phone = update.message.text.strip()
    msg = await update.message.reply_text("⏳ جاري توليد كود الربط من موقعك، انتظر قليلاً...")
    
    code = await get_pairing_code(phone)
    
    if code:
        await msg.edit_text(f"✅ كود الربط الخاص بك:\n\n`{code}`", parse_mode='Markdown')
    else:
        await msg.edit_text("❌ الموقع استغرق وقتاً طويلاً للرد. يرجى المحاولة مرة أخرى بعد ثوانٍ.")

def main():
    application = Application.builder().token(BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    application.run_polling()

if __name__ == '__main__':
    main()
