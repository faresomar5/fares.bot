
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

# --- خادم ويب Flask لضمان استمرارية الخدمة على Render ---
app_server = Flask('')
@app_server.route('/')
def home():
    return "<h1>Golden Queen Bot System is Online!</h1>"

def run_flask():
    port = int(os.environ.get('PORT', 8080))
    app_server.run(host='0.0.0.0', port=port)

# --- الإعدادات ---
logging.basicConfig(level=logging.INFO)
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

# --- دالة جلب الكود من الموقع ---
async def get_wa_code(phone):
    # محاولة جلب الكود من المسار الذي سنضيفه في Node.js
    url = f"{BASE_URL}/get-pairing?number={phone}"
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, timeout=30.0)
            if response.status_code == 200:
                return response.json().get('code')
        except Exception as e:
            print(f"Error connecting to Node.js: {e}")
    return None

# --- معالجات التليجرام ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    db = load_db()
    reg_phone = next((p for p, d in db.items() if d.get("telegram_id") == user_id), None)

    if reg_phone:
        text = f"👑 مرحباً بك مجدداً!\nرقمك المربوط: `{reg_phone}`"
        kb = [[InlineKeyboardButton("🎨 تغيير الإيموجي", callback_data='emoji')]]
    else:
        text = "مرحباً بك في بوت GOLDEN QUEEN 👑\nاضغط للبدء بالربط:"
        kb = [[InlineKeyboardButton("🔗 ربط رقم واتساب", callback_data='reg')]]
    
    await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(kb))

async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == 'reg':
        context.user_data['step'] = 'PHONE'
        await query.edit_message_text("أرسل رقم الواتساب (مثال: 967773987296):")

async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    step = context.user_data.get('step')
    txt = update.message.text.strip()

    if step == 'PHONE':
        if re.fullmatch(r'\d+', txt):
            m = await update.message.reply_text("⏳ جاري طلب كود الربط من السيرفر...")
            code = await get_wa_code(txt)
            if code:
                context.user_data['p'] = txt
                context.user_data['step'] = 'PASS'
                await m.edit_text(f"✅ كود الربط: `{code}`\n\nأدخله في واتساب الآن، ثم أرسل هنا كلمة مرور الموقع:")
            else:
                await m.edit_text("❌ السيرفر لا يستجيب أو المسار غير موجود. تأكد من إضافة الكود في ملف Node.js.")
        else:
            await update.message.reply_text("❌ أرقام فقط.")

    elif step == 'PASS':
        phone = context.user_data.get('p')
        db = load_db()
        db[phone] = {"telegram_id": str(update.effective_user.id), "password": txt, "settings": {"statusEmoji": "❤️"}}
        save_db(db)
        await update.message.reply_text("✅ تم الربط بنجاح!")
        context.user_data.clear()

def main():
    threading.Thread(target=run_flask, daemon=True).start()
    application = Application.builder().token(BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CallbackQueryHandler(handle_callback))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    application.run_polling()

if __name__ == '__main__':
    main()
