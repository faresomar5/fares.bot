import os
import threading
import asyncio
import httpx
from flask import Flask, request, jsonify
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes, MessageHandler, filters

# --- الإعدادات ---
# استخدم التوكن الجديد الذي استخرجته من BotFather
BOT_TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I"
# الربط داخلي تماماً لضمان السرعة
NODE_SERVER_URL = "http://127.0.0.1:10000"

# --- سيرفر Flask لمنع توقف Render ---
app_web = Flask('')

@app_web.route('/')
def home():
    return "<h1>سيرفر فارس يعمل بنجاح</h1>"

def run_flask():
    # Render يطلب العمل على المنفذ 8080 أو المنفذ المحدد في البيئة
    port = int(os.environ.get('PORT', 8080))
    app_web.run(host='0.0.0.0', port=port)

# --- دالة طلب الكود من Node.js ---
async def get_pairing_code(phone):
    url = f"{NODE_SERVER_URL}/pairing?number={phone}"
    async with httpx.AsyncClient() as client:
        try:
            # زيادة مهلة الانتظار لـ 90 ثانية لمنع التعليق
            response = await client.get(url, timeout=90.0)
            if response.status_code == 200:
                data = response.json()
                return data.get('code')
        except Exception as e:
            print(f"خطأ أثناء طلب الكود: {e}")
    return None

# --- مهام البوت ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [[InlineKeyboardButton("🔗 ربط واتساب", callback_data='register')]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(
        "مرحباً بك في بوت الربط الخاص بفارس 👑\nاضغط على الزر أدناه للبدء:",
        reply_markup=reply_markup
    )

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == 'register':
        context.user_data['step'] = 'WAITING_PHONE'
        await query.edit_message_text("الآن أرسل رقم الواتساب مع رمز الدولة (مثال: 967771163825):")

async def message_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if context.user_data.get('step') == 'WAITING_PHONE':
        phone = update.message.text.strip()
        msg = await update.message.reply_text("⏳ جاري طلب كود الربط من سيرفر واتساب، يرجى الانتظار...")
        
        # استدعاء الدالة
        code = await get_pairing_code(phone)
        
        if code:
            await msg.edit_text(f"✅ تم توليد الكود بنجاح:\n\n`{code}`", parse_mode='Markdown')
        else:
            await msg.edit_text("❌ عذراً، تعذر توليد الكود حالياً. تأكد أن السيرفر Live وحاول مجدداً.")
        
        context.user_data['step'] = None

# --- تشغيل البوت ---
def main():
    # تشغيل سيرفر الويب في خلفية منفصلة
    threading.Thread(target=run_flask, daemon=True).start()
    
    # بناء تطبيق تليجرام
    application = Application.builder().token(BOT_TOKEN).build()
    
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CallbackQueryHandler(button_handler))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, message_handler))
    
    print("البوت بدأ العمل...")
    application.run_polling()

if __name__ == '__main__':
    main()
