# -*- coding: utf-8 -*-
import os, httpx, threading
from flask import Flask
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes, MessageHandler, filters

# سيرفر ويب داخلي لضمان استقرار Render
app_web = Flask('')
@app_web.route('/')
def home(): return "Bot is Online"

# --- الإعدادات ---
# تأكد أن هذا الرابط يطابق الرابط الذي يظهر لك في Render تماماً
BASE_URL = "https://fares-bot-eahg.onrender.com" 
BOT_TOKEN = "8631941557:AAGujcuTGsaD1Xb3Y5BUTbBQBg3KLkm6pgY"

async def get_code(phone):
    url = f"{BASE_URL}/pairing?number={phone}"
    async with httpx.AsyncClient() as client:
        try:
            # وقت انتظار طويل لأن توليد الكود قد يتأخر
            response = await client.get(url, timeout=50.0) 
            if response.status_code == 200:
                return response.json().get('code')
        except: return None

async def start(u: Update, c: ContextTypes.DEFAULT_TYPE):
    kb = [[InlineKeyboardButton("🔗 ربط واتساب", callback_data='reg')]]
    await u.message.reply_text("مرحباً بك 👑\nاضغط للربط:", reply_markup=InlineKeyboardMarkup(kb))

async def button(u: Update, c: ContextTypes.DEFAULT_TYPE):
    q = u.callback_query
    await q.answer()
    if q.data == 'reg':
        c.user_data['s'] = 'P'
        await q.edit_message_text("أرسل الرقم مع رمز الدولة (967...):")

async def msg(u: Update, c: ContextTypes.DEFAULT_TYPE):
    if c.user_data.get('s') == 'P':
        m = await u.message.reply_text("⏳ جاري جلب الكود...")
        code = await get_code(u.message.text.strip())
        if code:
            await m.edit_text(f"✅ كود الربط: `{code}`")
        else:
            await m.edit_text("❌ لم يستجب السيرفر. تأكد من أن الموقع يعمل.")

def run():
    threading.Thread(target=lambda: app_web.run(host='0.0.0.0', port=8080)).start()
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(button))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, msg))
    app.run_polling()

if __name__ == '__main__': run()
