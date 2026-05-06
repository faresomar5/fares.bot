# -*- coding: utf-8 -*-
import logging
import json
import os
import re
import threading
import httpx
from flask import Flask, request, jsonify
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes, MessageHandler, filters

# --- 1. إعداد السيرفر ليعمل كموقع وبوت في نفس الوقت ---
app = Flask('')

@app.route('/')
def home():
    return "<h1>Golden Queen Server is Online!</h1><p>The bot and site are running together.</p>"

def run_flask():
    # Render يعطي المنفذ تلقائياً عبر متغير PORT
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)

# --- 2. الإعدادات وقاعدة البيانات المحلية ---
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)

DB_PATH = 'storage/users_db.json'
BOT_TOKEN = "8631941557:AAGujcuTGsaD1Xb3Y5BUTbBQBg3KLkm6pgY" #
BASE_URL = "https://fares-bot-eahg.onrender.com" #

def load_db():
    if not os.path.exists(DB_PATH): return {}
    try:
        with open(DB_PATH, 'r', encoding='utf-8') as f: return json.load(f)
    except: return {}

def save_db(data):
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with open(DB_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

# --- 3. وظائف البوت المباشرة ---

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    db = load_db()
    
    # التحقق من وجود رقم مرتبط بهذا التيليجرام
    phone = next((p for p, d in db.items() if d.get("telegram_id") == user_id), None)

    if phone:
        emoji = db[phone].get("settings", {}).get("statusEmoji", "❤️")
        text = f"👑 أهلاً يا {update.effective_user.first_name}!\nرقمك المربوط: `{phone}`\nالإيموجي الحالي: {emoji}"
        keyboard = [[InlineKeyboardButton("🎨 تغيير الإيموجي", callback_data='change_emoji')]]
    else:
        text = "مرحباً بك في GOLDEN QUEEN! 👑\n\nاضغط أدناه لربط رقمك وجلب كود الاقتران بموقعك:"
        keyboard = [[InlineKeyboardButton("🔗 ربط رقم جديد", callback_data='reg')]]
    
    await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard))

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == 'reg':
        context.user_data['state'] = 'WAIT_PHONE'
        await query.edit_message_text("أرسل رقم الواتساب (مثال: 967773987296):")
    elif query.data == 'change_emoji':
        context.user_data['state'] = 'WAIT_EMOJI'
        await query.edit_message_text("أرسل الإيموجي الجديد الذي تريده:")

async def message_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    state = context.user_data.get('state')
    user_id = str(update.effective_user.id)
    txt = update.message.text.strip()

    if state == 'WAIT_PHONE':
        if re.fullmatch(r'\d+', txt):
            # محاولة جلب كود الربط من السيرفر المحلي
            context.user_data['temp_phone'] = txt
            context.user_data['state'] = 'WAIT_PASS'
            await update.message.reply_text(f"✅ تم تسجيل الرقم: {txt}\nالآن أرسل كلمة مرور لحسابك في الموقع:")
        else:
            await update.message.reply_text("❌ أرسل أرقاماً فقط.")

    elif state == 'WAIT_PASS':
        phone = context.user_data.get('temp_phone')
        db = load_db()
        db[phone] = {"telegram_id": user_id, "password": txt, "settings": {"statusEmoji": "❤️"}}
        save_db(db)
        await update.message.reply_text("✅ تم الربط بنجاح! يمكنك الآن استخدام خيارات البوت.")
        context.user_data.clear()

    elif state == 'WAIT_EMOJI':
        db = load_db()
        phone = next((p for p, d in db.items() if d.get("telegram_id") == user_id), None)
        if phone:
            db[phone]["settings"]["statusEmoji"] = txt
            save_db(db)
            await update.message.reply_text(f"✅ تم تحديث الإيموجي إلى {txt}")
        context.user_data.clear()

def main():
    # تشغيل سيرفر الويب في خيط منفصل
    threading.Thread(target=run_flask, daemon=True).start()

    # تشغيل البوت
    application = Application.builder().token(BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CallbackQueryHandler(button_handler))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, message_handler))
    
    print("Bot and Web Server are running on Render...")
    application.run_polling()

if __name__ == '__main__':
    main()
