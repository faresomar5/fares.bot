import os, httpx, threading
from flask import Flask
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes, MessageHandler, filters

# سيرفر ويب لضمان استقرار Render
app_web = Flask('')
@app_web.route('/')
def home(): return "Bot is Online"

# --- الإعدادات المحدثة ---
BASE_URL = "https://fares-bot-pairing.onrender.com" 
BOT_TOKEN = "8631941557:AAGujcuTGsaD1Xb3Y5BUTbBQBg3KLkm6pgY"

async def get_code(phone):
    url = f"{BASE_URL}/pairing?number={phone}"
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, timeout=50.0)
            if response.status_code == 200:
                return response.json().get('code')
        except: return None

async def start(u: Update, c: ContextTypes.DEFAULT_TYPE):
    kb = [[InlineKeyboardButton("🔗 ربط واتساب", callback_data='reg')]]
    await u.message.reply_text("مرحباً بك يا فارس 👑\nاضغط للربط:", reply_markup=InlineKeyboardMarkup(kb))

async def button(u: Update, c: ContextTypes.DEFAULT_TYPE):
    q = u.callback_query
    await q.answer()
    if q.data == 'reg':
        c.user_data['s'] = 'P'
        await q.edit_message_text("أرسل رقم الواتساب مع رمز الدولة (مثال: 967...):")

async def msg(u: Update, c: ContextTypes.DEFAULT_TYPE):
    if c.user_data.get('s') == 'P':
        m = await u.message.reply_text("⏳ جاري جلب الكود من السيرفر...")
        code = await get_code(u.message.text.strip())
        if code:
            await m.edit_text(f"✅ كود الربط: `{code}`")
        else:
            await m.edit_text("❌ السيرفر لا يستجيب. تأكد أن الموقع Live.")

def run():
    threading.Thread(target=lambda: app_web.run(host='0.0.0.0', port=8080)).start()
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(button))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, msg))
    app.run_polling()

if __name__ == '__main__': run()
