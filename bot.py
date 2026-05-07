import httpx
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# --- الإعدادات ---
BOT_TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I"

# استخدم الرابط الداخلي بدلاً من رابط HTTPS الخارجي
# لأن السيرفر يعمل على منفذ 10000 كما يظهر في سجلاتك
BASE_URL = "http://127.0.0.1:10000"

async def get_pairing_code(phone):
    # تنظيف الرقم
    clean_phone = phone.replace('+', '').replace(' ', '')
    url = f"{BASE_URL}/pairing?number={clean_phone}"
    
    async with httpx.AsyncClient() as client:
        try:
            # مهلة 40 ثانية كافية للربط الداخلي
            response = await client.get(url, timeout=40.0)
            if response.status_code == 200:
                return response.json().get('code')
        except Exception as e:
            print(f"Error calling internal API: {e}")
    return None

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("أرسل رقم الواتساب الآن (مثال: 967771163825):")

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    phone = update.message.text.strip()
    msg = await update.message.reply_text("⏳ جاري توليد كود الربط...")
    
    code = await get_pairing_code(phone)
    
    if code:
        await msg.edit_text(f"✅ كود الربط الخاص بك:\n\n`{code}`", parse_mode='Markdown')
    else:
        # إذا فشل الداخلي، نحاول الخارجي كخطة بديلة
        await msg.edit_text("❌ لم يتم الرد من السيرفر الداخلي. تأكد من أن Node.js يعمل.")

def main():
    application = Application.builder().token(BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    application.run_polling()

if __name__ == '__main__':
    main()
