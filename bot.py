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

# --- خادم ويب داخلي (Flask) لضمان استقرار الخدمة ---
server_app = Flask('')
@server_app.route('/')
def home():
    return "<h1>Golden Queen System is Active!</h1>"

def start_server():
    port = int(os.environ.get('PORT', 8080))
    server_app.run(host='0.0.0.0', port=port)

# --- الإعدادات وقاعدة البيانات ---
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

# --- وظيفة جلب الكود الذكية (تجربة كافة المسارات المحتملة) ---
async def get_pairing_code_multi(phone):
    # قائمة بكافة المسارات الممكنة في بوتات واتساب الشهيرة
    paths = [
        f"/pairing?number={phone}",
        f"/pairing_code?phone={phone}",
        f"/code?number={phone}",
        f"/api/pairing?number={phone}"
    ]
    
    async with httpx.AsyncClient() as client:
        for p in paths:
            try:
                url = f"{BASE_URL}{p}"
                print(f"Checking path: {url}")
                resp = await client.get(url, timeout=30.0)
                if resp.status_code == 200:
                    data = resp.json()
                    # استخراج الكود بأي اسم مفتاح متوقع
                    return data.get('code') or data.get('pairingCode') or data.get('result')
            except:
                continue
    return None

# --- معالجات البوت ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    db = load_db()
    phone = next((p for p, d in db.items() if d.get("telegram_id") == user_id), None)

    if phone:
        text = f"👑 مرحباً يا فارس!\nرقمك المسجل: `{phone}`"
        kb = [[InlineKeyboardButton("🎨 تغيير الإيموجي", callback_data='emj')]]
    else:
        text = "مرحباً بك في GOLDEN QUEEN 👑\nاضغط للربط:"
        kb = [[InlineKeyboardButton("🔗 ربط واتساب", callback_data='reg')]]
    
    await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(kb))

async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == 'reg':
        context.user_data['st'] = 'PHONE'
        await query.edit_message_text("أرسل الرقم مع مفتاح الدولة (مثال: 967773987296):")

async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    st = context.user_data.get('st')
    txt = update.message.text.strip()

    if st == 'PHONE':
        if re.fullmatch(r'\d+', txt):
            m = await update.message.reply_text("⏳ جاري محاولة جلب كود الربط...")
            code = await get_pairing_code_multi(txt)
            if code:
                context.user_data['p'] = txt
                context.user_data['st'] = 'PASS'
                await m.edit_text(f"✅ الكود هو: `{code}`\n\nأدخله في هاتفك، ثم أرسل هنا كلمة مرور الموقع:")
            else:
                await m.edit_text("❌ لم يجد البوت أي مسار صالح في الموقع.\nتأكد أن ملفات الـ Node.js المرفوعة تدعم خاصية Pairing Code.")
        else:
            await update.message.reply_text("❌ أرقام فقط.")

    elif st == 'PASS':
        phone = context.user_data.get('p')
        db = load_db()
        db[phone] = {"telegram_id": str(update.effective_user.id), "password": txt}
        save_db(db)
        await update.message.reply_text("✅ تم الحفظ بنجاح!")
        context.user_data.clear()

def main():
    threading.Thread(target=start_server, daemon=True).start()
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(handle_callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    app.run_polling()

if __name__ == '__main__':
    main()
