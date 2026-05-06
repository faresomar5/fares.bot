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

# --- إنشاء سيرفر الويب للموقع ---
app = Flask('')
@app.route('/')
def home():
    return "<h1>Golden Queen Server is Online!</h1>"

def run_flask():
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)

# --- إعدادات البوت ---
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
    with open(DB_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

# دالة جلب كود الربط من السيرفر المحلي
async def get_pairing_code(phone):
    try:
        async with httpx.AsyncClient() as client:
            # تجربة المسار المعتاد في مشاريع Node
            response = await client.get(f"{BASE_URL}/pairing?number={phone}", timeout=25.0)
            if response.status_code == 200:
                return response.json().get('code')
    except: return None

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    db = load_db()
    phone = next((p for p, d in db.items() if d.get("telegram_id") == user_id), None)

    if phone:
        text = f"👑 أهلاً بك!\nرقمك المرتبط: `{phone}`"
        keyboard = [[InlineKeyboardButton("🎨 تغيير الإيموجي", callback_data='emoji')]]
    else:
        text = "مرحباً بك في بوت GOLDEN QUEEN 👑\nاضغط للبدء بربط رقمك:"
        keyboard = [[InlineKeyboardButton("🔗 ربط رقم واتساب", callback_data='reg')]]
    
    await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard))

# (بقية معالجات الأزرار والرسائل كما في الكود السابق لضمان العمل)

def main():
    # تشغيل سيرفر الويب والبوت معاً في نفس المشروع
    threading.Thread(target=run_flask, daemon=True).start()
    
    application = Application.builder().token(BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    # إضافة المعالجات الأخرى هنا...
    
    print("Everything is running...")
    application.run_polling()

if __name__ == '__main__':
    main()
