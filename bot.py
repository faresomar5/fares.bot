# -*- coding: utf-8 -*-
import os, httpx, threading
from flask import Flask
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes, MessageHandler, filters

# سيرفر ويب داخلي لضمان استقرار الخدمة على Render ومنع التوقف
app_web = Flask('')
@app_web.route('/')
def home(): return "Bot is Online and Active"

def run_server():
    # استخدام المنفذ الافتراضي لـ Render
    port = int(os.environ.get('PORT', 8080))
    app_web.run(host='0.0.0.0', port=port)

# --- الإعدادات المحدثة بالتوكن الجديد والاسم الجديد ---
BASE_URL = "https://fares-bot-eahg.onrender.com" 
BOT_TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I"

async def get_pairing_code(phone):
    """الاتصال بسيرفر Node.js لجلب كود الربط"""
    url = f"{BASE_URL}/pairing?number={phone}"
    async with httpx.AsyncClient() as client:
        try:
            # وقت انتظار كافٍ لتوليد الكود من مكتبة Baileys
            response = await client.get(url, timeout=55.0)
            if response.status_code == 200:
                return response.json().get('code')
        except Exception as e:
            print(f"Connection Error: {e}")
    return None

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    kb = [[InlineKeyboardButton("🔗 ربط واتساب", callback_data='reg')]]
    await update.message.reply_text(
        "مرحباً بك يا فارس في نظام GOLDEN QUEEN 👑\n\n"
        "اضغط على الزر أدناه لبدء عملية الربط:",
        reply_markup=InlineKeyboardMarkup(kb)
    )

async def handle_interaction(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == 'reg':
        context.user_data['step'] = 'PHONE'
        await query.edit_message_text("أرسل الآن رقم الواتساب مع رمز الدولة\nمثال: `967773987296` :", parse_mode='Markdown')

async def handle_messages(update: Update, context: ContextTypes.DEFAULT_TYPE):
    step = context.user_data.get('step')
    text = update.message.text.strip()
    
    if step == 'PHONE':
        # التحقق من أن المدخل أرقام فقط
        clean_number = "".join(filter(str.isdigit, text))
        
        m = await update.message.reply_text("⏳ جاري طلب كود الربط من السيرفر، يرجى الانتظار...")
        
        code = await get_pairing_code(clean_number)
        
        if code:
            await m.edit_text(
                f"✅ تم توليد الكود بنجاح!\n\n"
                f"كود الربط هو: `{code}`\n\n"
                f"أدخله الآن في تطبيق الواتساب (الأجهزة المرتبطة) لإتمام العملية.",
                parse_mode='Markdown'
            )
            context.user_data['step'] = None # إعادة التعيين
        else:
            await m.edit_text(
                "❌ فشل السيرفر في الاستجابة.\n\n"
                "تأكد من أن الموقع يعمل (Live) وأنك قمت بضبط إعدادات Render بشكل صحيح."
            )

def main():
    # تشغيل خادم الويب في خيط منفصل
    threading.Thread(target=run_server, daemon=True).start()
    
    # بناء البوت باستخدام التوكن الجديد
    application = Application.builder().token(BOT_TOKEN).build()
    
    # إضافة المعالجات
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CallbackQueryHandler(handle_interaction))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_messages))
    
    # بدء استقبال الرسائل
    print("البوت يعمل الآن...")
    application.run_polling()

if __name__ == '__main__':
    main()
