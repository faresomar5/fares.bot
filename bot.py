import logging
import requests
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes, CallbackQueryHandler

TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I"
BASE_URL = "https://fares-bot-eahg.onrender.com"

logging.basicConfig(level=logging.INFO)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("🎭 تغيير إيموجي التفاعل", callback_data='change_emoji')],
        [InlineKeyboardButton("🗑️ حذف الجلسة والربط", callback_data='logout')],
        [InlineKeyboardButton("📊 حالة البوت", callback_data='status')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text("📱 **لوحة تحكم فارس المحدثة**\nاختر من الأزرار أدناه:", reply_markup=reply_markup, parse_mode="Markdown")

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    if query.data == 'change_emoji':
        context.user_data['awaiting_emoji'] = True
        await query.edit_message_text("📝 أرسل الإيموجي الجديد الذي تريده الآن (مثال: 🔥 أو ❤️):")
    
    elif query.data == 'logout':
        requests.post(f"{BASE_URL}/api/logout")
        await query.edit_message_text("✅ تم حذف الجلسة وفصل الرقم.")
        
    elif query.data == 'status':
        await query.message.reply_text("🚀 البوت شغال ومستقر حالياً.")

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text.strip()
    
    # التحقق إذا كان المستخدم بصدد تغيير الإيموجي
    if context.user_data.get('awaiting_emoji'):
        res = requests.post(f"{BASE_URL}/api/update-emoji", json={"emoji": text})
        if res.status_code == 200:
            await update.message.reply_text(f"✅ تم بنجاح! الإيموجي الجديد هو: {text}")
        else:
            await update.message.reply_text("❌ حدث خطأ أثناء تحديث الإيموجي.")
        context.user_data['awaiting_emoji'] = False
        return

    # إذا كان النص رقماً، يتم طلب كود الربط
    if text.isdigit():
        msg = await update.message.reply_text("⏳ جاري توليد كود الربط...")
        res = requests.post(f"{BASE_URL}/api/pairing", json={"num": text})
        data = res.json()
        if data.get("success"):
            await msg.edit_text(f"🔢 كود الربط: `{data.get('code')}`", parse_mode="Markdown")

def main():
    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(button_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.run_polling()

if __name__ == '__main__':
    main()
