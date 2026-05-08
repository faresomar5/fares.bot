import requests
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes, CallbackQueryHandler

TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I"
URL = "https://fares-bot-eahg.onrender.com"
MY_ID = 7231690686 #

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id != MY_ID: return # حماية البوت
    keyboard = [[InlineKeyboardButton("🗑️ حذف الجلسة", callback_data='logout')]]
    await update.message.reply_text("👋 أرسل رقمك الآن للحصول على الكود:", reply_markup=InlineKeyboardMarkup(keyboard))

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    num = update.message.text.strip()
    msg = await update.message.reply_text("⏳ جاري طلب الكود...")
    res = requests.post(f"{URL}/api/pairing", json={"num": num}).json()
    if res.get("success"):
        await msg.edit_text(f"🔢 الكود: `{res.get('code')}`\n\nأدخله الآن في واتساب.", parse_mode="Markdown")

async def logout(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    requests.post(f"{URL}/api/logout")
    await query.edit_message_text("✅ تم حذف الجلسة بنجاح.")

def main():
    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(logout))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.run_polling()

if __name__ == '__main__': main()
