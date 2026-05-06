# -*- coding: utf-8 -*-
import logging
import json
import os
import re
import httpx
import threading
from flask import Flask
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes, MessageHandler, filters

# سيرفر ويب داخلي لضمان عمل الخدمة على Render
server_app = Flask('')
@server_app.route('/')
def home(): return "Bot is Active!"

def run_flask():
    port = int(os.environ.get('PORT', 8080))
    server_app.run(host='0.0.0.0', port=port)

# الإعدادات - تأكد من الرابط الصحيح لموقعك
BASE_URL = "https://fares-bot-eahg.onrender.com"
BOT_TOKEN = "8631941557:AAGujcuTGsaD1Xb3Y5BUTbBQBg3KLkm6pgY"

async def get_pairing_code(phone):
    """الاتصال بسيرفر Node.js لجلب الكود"""
    url = f"{BASE_URL}/pairing?number={phone}"
    async with httpx.AsyncClient() as client:
        try:
            # زيادة وقت الانتظار لأن Render قد يكون بطيئاً في الاستجابة
            response = await client.get(url, timeout=45.0)
            if response.status_code == 200:
                return response.json().get('code')
        except Exception as e:
            print(f"Connection Error: {e}")
    return None

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    kb = [[InlineKeyboardButton("🔗 ربط واتساب", callback_data='reg')]]
    await update.message.reply_text("مرحباً بك في GOLDEN QUEEN 👑\nاضغط للبدء:", reply_markup=InlineKeyboardMarkup(kb))

async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == 'reg':
        context.user_data['step'] = 'PHONE'
        await query.edit_message_text("أرسل الرقم مع رمز الدولة (مثال: 967773987296):")

async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    step = context.user_data.get('step')
    txt = update.message.text.strip()
    
    if step == 'PHONE':
        m = await update.message.reply_text("⏳ جاري طلب كود الربط من السيرفر...")
        code = await get_pairing_code(txt)
        if code:
            await m.edit_text(f"✅ كود الربط الخاص بك هو: `{code}`\n\nأدخله في هاتفك الآن لإتمام الربط.")
        else:
            await m.edit_text("❌ السيرفر لا يستجيب حالياً. تأكد من أن الموقع يعمل أو جرب لاحقاً.")

def main():
    threading.Thread(target=run_flask, daemon=True).start()
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(handle_callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    app.run_polling()

if __name__ == '__main__':
    main()
