
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

# خادم ويب صغير لضمان بقاء السيرفر نشطاً
server = Flask('')
@server.route('/')
def home(): return "Bot is Online!"

def run_server():
    port = int(os.environ.get('PORT', 8080))
    server.run(host='0.0.0.0', port=port)

# الإعدادات
DB_PATH = 'storage/users_db.json'
BASE_URL = "https://fares-bot-eahg.onrender.com"
BOT_TOKEN = "8631941557:AAGujcuTGsaD1Xb3Y5BUTbBQBg3KLkm6pgY"

def load_db():
    if not os.path.exists(DB_PATH): return {}
    try:
        with open(DB_PATH, 'r', encoding='utf-8') as f: return json.load(f)
    except: return {}

def save_db(data):
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with open(DB_PATH, 'w', encoding='utf-8') as f: json.dump(data, f, indent=2, ensure_ascii=False)

async def get_pairing_code(phone):
    """جلب الكود من مسار /pairing المحدث في Node.js"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{BASE_URL}/pairing?number={phone}", timeout=35.0)
            if response.status_code == 200:
                return response.json().get('code')
    except: return None

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    kb = [[InlineKeyboardButton("🔗 ربط رقم واتساب", callback_data='reg')]]
    await update.message.reply_text("مرحباً بك في GOLDEN QUEEN 👑\nاضغط للبدء:", reply_markup=InlineKeyboardMarkup(kb))

async def handle_interaction(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == 'reg':
        context.user_data['st'] = 'PHONE'
        await query.edit_message_text("أرسل الرقم مع رمز الدولة (مثال: 967773987296):")

async def handle_messages(update: Update, context: ContextTypes.DEFAULT_TYPE):
    st = context.user_data.get('st')
    txt = update.message.text.strip()
    if st == 'PHONE':
        m = await update.message.reply_text("⏳ جاري طلب كود الربط...")
        code = await get_pairing_code(txt)
        if code:
            await m.edit_text(f"✅ كود الربط: `{code}`\nأدخله في الواتساب الآن.")
        else:
            await m.edit_text("❌ السيرفر لا يستجيب. تأكد أن الموقع يعمل.")

def main():
    threading.Thread(target=run_server, daemon=True).start()
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(handle_interaction))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_messages))
    app.run_polling()

if __name__ == '__main__': main()
