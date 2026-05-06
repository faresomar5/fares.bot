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

# --- خادم ويب وهمي لضمان استمرارية الخدمة على Render ---
app = Flask('')
@app.route('/')
def home():
    return "Bot and Site are Running!"

def run_server():
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)

# --- إعدادات البوت وقاعدة البيانات ---
logging.basicConfig(level=logging.INFO)
DB_PATH = 'storage/users_db.json'
BASE_URL = "https://fares-bot-eahg.onrender.com"
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

# --- منطق الأوامر ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    db = load_db()
    reg_phone = next((p for p, d in db.items() if d.get("telegram_id") == user_id), None)

    if reg_phone:
        text = f"👑 أهلاً بك! رقمك المربوط هو: `{reg_phone}`"
        keyboard = [[InlineKeyboardButton("🎨 تغيير الإيموجي", callback_data='emoji')]]
    else:
        text = "مرحباً بك في GOLDEN QUEEN 👑\nاضغط للبدء بربط رقمك:"
        keyboard = [[InlineKeyboardButton("🔗 ربط رقم واتساب", callback_data='reg')]]
    
    await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard))

async def handle_interaction(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == 'reg':
        context.user_data['s'] = 'PHONE'
        await query.edit_message_text("أرسل رقم الواتساب (مثال: 967773987296):")
    elif query.data == 'emoji':
        context.user_data['s'] = 'EMOJI'
        await query.edit_message_text("أرسل الإيموجي الجديد:")

async def handle_messages(update: Update, context: ContextTypes.DEFAULT_TYPE):
    step = context.user_data.get('s')
    user_id = str(update.effective_user.id)
    txt = update.message.text.strip()

    if step == 'PHONE':
        if re.fullmatch(r'\d+', txt):
            # محاولة جلب كود الربط من السيرفر
            async with httpx.AsyncClient() as client:
                try:
                    res = await client.get(f"{BASE_URL}/pairing?number={txt}", timeout=20.0)
                    code = res.json().get('code')
                    if code:
                        context.user_data['p'] = txt
                        context.user_data['s'] = 'PASS'
                        await update.message.reply_text(f"✅ كود الربط: `{code}`\n\nأدخله في الواتساب، ثم أرسل كلمة مرور الموقع:")
                    else:
                        await update.message.reply_text("❌ فشل جلب الكود من السيرفر.")
                except:
                    await update.message.reply_text("❌ السيرفر لا يستجيب حالياً.")
        else:
            await update.message.reply_text("❌ أرقام فقط.")

    elif step == 'PASS':
        phone = context.user_data.get('p')
        db = load_db()
        db[phone] = {"telegram_id": user_id, "password": txt, "settings": {"statusEmoji": "❤️"}}
        save_db(db)
        await update.message.reply_text("✅ تم الربط بنجاح!")
        context.user_data.clear()

def main():
    # تشغيل خادم الويب في الخلفية
    threading.Thread(target=run_server, daemon=True).start()

    # تشغيل البوت
    app_bot = Application.builder().token(BOT_TOKEN).build()
    app_bot.add_handler(CommandHandler("start", start))
    app_bot.add_handler(CallbackQueryHandler(handle_interaction))
    app_bot.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_messages))
    
    print("Bot and Server are starting...")
    app_bot.run_polling()

if __name__ == '__main__':
    main()
