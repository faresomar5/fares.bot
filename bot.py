import httpx
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# --- الإعدادات ---
BOT_TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I"

# استخدم الرابط الداخلي بدلاً من رابط HTTPS الخارجي
# لأن السيرفر يعمل على منفذ 10000 كما يظهر في سجلاتك
BASE_URL = "http://127.0.0.1:10000"


def main():
    application = Application.builder().token(BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    application.run_polling()

if __name__ == '__main__':
    main()
async def get_pairing_code(phone):
    # تنظيف الرقم
    clean_phone = phone.replace('+', '').replace(' ', '')
    
    # استخدام localhost هو الحل الأضمن للربط الداخلي على Render
    url = f"http://localhost:10000/pairing?number={clean_phone}"
    
    async with httpx.AsyncClient() as client:
        try:
            # زيادة المهلة لـ 60 ثانية لأن السيرفر المجاني قد يكون بطيئاً
            response = await client.get(url, timeout=60.0)
            if response.status_code == 200:
                return response.json().get('code')
        except Exception as e:
            print(f"خطأ في الاتصال الداخلي: {e}")
    return None
