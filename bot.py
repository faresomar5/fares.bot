# -*- coding: utf-8 -*-
import logging
import json
import os
import re
import threading
from flask import Flask, request, jsonify
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes, MessageHandler, filters

# --- 1. إعداد السيرفر لدمجه مع الموقع ---
app = Flask('')

@app.route('/')
def home():
    return "<h1>Golden Queen Server is Online!</h1>"

# دالة لتشغيل السيرفر في الخلفية
def run_flask():
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)

# --- 2. إعدادات البوت وقاعدة البيانات ---
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)

# المسار الصحيح لقاعدة بيانات الموقع
DB_PATH = 'storage/users_db.json'
BOT_TOKEN = "8631941557:AAGujcuTGsaD1Xb3Y5BUTbBQBg3KLkm6pgY"

def load_db():
    if not os.path.exists(DB_PATH): return {}
    with open(DB_PATH, 'r', encoding='utf-8') as f:
        try: return json.load(f)
        except: return {}

def save_db(data):
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with open(DB_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

# --- 3. منطق أوامر البوت ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    db = load_db()
    
    # البحث عن رقم مربوط بهذا التيليجرام
    phone = next((p for p, d in db.items() if d.get("telegram_id") == user_id), None)

    if phone:
        emoji = db[phone].get("settings", {}).get("statusEmoji", "❤️")
        text = f"👑 أهلاً فارس!\nرقمك المربوط: `{phone}`\nالإيموجي الحالي: {emoji}"
        keyboard = [[InlineKeyboardButton("🎨 تغيير الإيموجي", callback_data='change_emoji')]]
    else:
        text = "مرحباً بك! اضغط للبدء بربط رقمك بموقعك:"
        keyboard = [[InlineKeyboardButton("🔗 ربط رقم جديد", callback_data='reg')]]
    
    await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard))

async def handle_interaction(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == 'reg':
        context.user_data['step'] = 'PHONE'
        await query.edit_message_text("أرسل رقم الواتساب (مثال: 967773987296):")
    elif query.data == 'change_emoji':
        context.user_data['step'] = 'EMOJI'
        await query.edit_message_text("أرسل الإيموجي الجديد:")

async def handle_messages(update: Update, context: ContextTypes.DEFAULT_TYPE):
    step = context.user_data.get('step')
    user_id = str(update.effective_user.id)
    txt = update.message.text.strip()

    if step == 'PHONE':
        context.user_data['phone'] = txt
        context.user_data['step'] = 'PASS'
        await update.message.reply_text("تم. الآن أرسل كلمة مرور الموقع:")
    
    elif step == 'PASS':
        phone = context.user_data['phone']
        db = load_db()
        db[phone] = {"telegram_id": user_id, "password": txt, "settings": {"statusEmoji": "❤️"}}
        save_db(db)
        await update.message.reply_text("✅ تم الربط بنجاح! سيظهر رقمك في الموقع الآن.")
        context.user_data.clear()

    elif step == 'EMOJI':
        db = load_db()
        phone = next((p for p, d in db.items() if d.get("telegram_id") == user_id), None)
        if phone:
            db[phone]["settings"]["statusEmoji"] = txt
            save_db(db)
            await update.message.reply_text(f"✅ تم تحديث الإيموجي إلى {txt}")
        context.user_data.clear()

def main():
    # تشغيل سيرفر الويب في خيط منفصل لكي لا يتوقف البوت
    threading.Thread(target=run_flask, daemon=True).start()

    # تشغيل البوت
    app_tg = Application.builder().token(BOT_TOKEN).build()
    app_tg.add_handler(CommandHandler("start", start))
    app_tg.add_handler(CallbackQueryHandler(handle_interaction))
    app_tg.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_messages))
    
    print("Server & Bot are running together...")
    app_tg.run_polling()

if __name__ == '__main__':
    main()
