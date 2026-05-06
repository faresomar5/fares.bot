# -*- coding: utf-8 -*-
import logging
import json
import os
import re
import httpx
import threading
from flask import Flask
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    CallbackQueryHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

# --- 1. إعداد خادم ويب صغير لضمان عمل الموقع والبوت معاً على Render ---
server = Flask('')

@server.route('/')
def home():
    return "<h1>Golden Queen Server is Online!</h1><p>The site and bot are running together.</p>"

def run_web_server():
    # Render يمرر المنفذ تلقائياً عبر متغير PORT
    port = int(os.environ.get('PORT', 8080))
    server.run(host='0.0.0.0', port=port)

# --- 2. إعدادات التسجيل والبيانات ---
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

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

# --- 3. وظيفة جلب كود الربط من السيرفر ---
async def get_pairing_code(phone):
    """تجربة أكثر من مسار لضمان الوصول لكود الربط في السيرفر"""
    endpoints = [
        f"{BASE_URL}/pairing?number={phone}",
        f"{BASE_URL}/pairing_code?phone={phone}"
    ]
    async with httpx.AsyncClient() as client:
        for url in endpoints:
            try:
                # مهلة انتظار 30 ثانية لضمان استجابة سيرفر Render
                response = await client.get(url, timeout=30.0)
                if response.status_code == 200:
                    data = response.json()
                    return data.get('code') or data.get('pairingCode')
            except Exception as e:
                logger.error(f"خطأ في الاتصال بالمسار {url}: {e}")
                continue
    return None

# --- 4. أوامر البوت ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    db = load_db()
    reg_phone = next((p for p, d in db.items() if d.get("telegram_id") == user_id), None)

    if reg_phone:
        emoji = db[reg_phone].get("settings", {}).get("statusEmoji", "❤️")
        text = f"👑 أهلاً بك يا {update.effective_user.first_name}!\n\nرقمك المربوط: `{reg_phone}`\nالإيموجي الحالي: {emoji}"
        keyboard = [[InlineKeyboardButton("🎨 تغيير الإيموجي", callback_data='change_emoji')]]
    else:
        text = "مرحباً بك في بوت GOLDEN QUEEN 👑\n\nاضغط للبدء بربط رقمك بموقعك الشخصي:"
        keyboard = [[InlineKeyboardButton("🔗 ربط رقم واتساب", callback_data='register')]]
    
    await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard))

async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == 'register':
        context.user_data['state'] = 'PHONE'
        await query.edit_message_text("أرسل رقم الواتساب مع رمز الدولة (مثال: 967773987296):")
    elif query.data == 'change_emoji':
        context.user_data['state'] = 'EMOJI'
        await query.edit_message_text("أرسل الإيموجي الجديد:")

async def message_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    state = context.user_data.get('state')
    user_id = str(update.effective_user.id)
    text = update.message.text.strip()

    if state == 'PHONE':
        if re.fullmatch(r'\d+', text):
            msg = await update.message.reply_text("⏳ جاري جلب كود الربط من السيرفر...")
            code = await get_pairing_code(text)
            if code:
                context.user_data['temp_p'] = text
                context.user_data['state'] = 'PASS'
                await msg.edit_text(f"✅ كود الربط الخاص بك هو: `{code}`\n\nأدخله في الواتساب الآن.\nبعدها، أرسل هنا كلمة مرور الموقع لحفظ بياناتك:")
            else:
                await msg.edit_text("❌ لم نتمكن من جلب الكود. تأكد أن الموقع يعمل وأن الرقم لم يتم ربطه مسبقاً.")
        else:
            await update.message.reply_text("❌ الرجاء إرسال أرقام فقط.")

    elif state == 'PASS':
        phone = context.user_data.get('temp_p')
        db = load_db()
        db[phone] = {"telegram_id": user_id, "password": text, "settings": {"statusEmoji": "❤️"}}
        save_db(db)
        await update.message.reply_text("✅ تم الربط وحفظ البيانات بنجاح!")
        context.user_data.clear()

    elif state == 'EMOJI':
        db = load_db()
        phone = next((p for p, d in db.items() if d.get("telegram_id") == user_id), None)
        if phone:
            db[phone]["settings"]["statusEmoji"] = text
            save_db(db)
            await update.message.reply_text(f"✅ تم تحديث الإيموجي إلى {text}")
        context.user_data.clear()

# --- 5. التشغيل الرئيسي ---
def main():
    # تشغيل سيرفر الويب في خيط منفصل لضمان بقاء الخدمة حية على Render
    threading.Thread(target=run_web_server, daemon=True).start()

    # بدء تشغيل البوت
    application = Application.builder().token(BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CallbackQueryHandler(callback_handler))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, message_handler))
    
    print("Bot and Site are running...")
    application.run_polling()

if __name__ == '__main__':
    main()
