# -*- coding: utf-8 -*-
import os, httpx, threading, asyncio
from flask import Flask, request, jsonify
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes, MessageHandler, filters

# --- إعدادات السيرفر والتوكن ---
BOT_TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I"
# ملاحظة: سنستخدمlocalhost لأننا سنشغل السيرفرين في نفس الخدمة
NODE_SERVER_URL = "http://127.0.0.1:10000" 

app_web = Flask('')

@app_web.route('/')
def home(): return "<h1>سيرفر فارس نشط</h1>"

@app_web.route('/health')
def health(): return jsonify({"status": "ok"})

async def get_pairing_code(phone):
    url = f"{NODE_SERVER_URL}/pairing?number={phone}"
    async with httpx.AsyncClient() as client:
        try:
            # مهلة انتظار طويلة لأن واتساب يحتاج وقت لتوليد الكود
            response = await client.get(url, timeout=60.0)
            if response.status_code == 200:
                return response.json().get('code')
        except Exception as e:
            print(f"Error fetching code: {e}")
    return None

async def start(u: Update, c: ContextTypes.DEFAULT_TYPE):
    kb = [[InlineKeyboardButton("🔗 ربط واتساب", callback_data='reg')]]
    await u.message.reply_text("مرحباً بك يا فارس 👑\nأرسل الرقم بعد الضغط على الزر:", 
                             reply_markup=InlineKeyboardMarkup(kb))

async def handle_msg(u: Update, c: ContextTypes.DEFAULT_TYPE):
    if c.user_data.get('step') == 'WAIT_PHONE':
        m = await u.message.reply_text("⏳ جاري توليد كود الربط، انتظر قليلاً...")
        code = await get_pairing_code(u.message.text.strip())
        if code:
            await m.edit_text(f"✅ كود الربط الخاص بك: `{code}`", parse_mode='Markdown')
        else:
            await m.edit_text("❌ السيرفر لم يستجب. تأكد من تشغيل Node.js")

async def btn(u: Update, c: ContextTypes.DEFAULT_TYPE):
    q = u.callback_query
    await q.answer()
    if q.data == 'reg':
        c.user_data['step'] = 'WAIT_PHONE'
        await q.edit_message_text("أرسل الآن رقم الواتساب (مثال: 967...) :")

def run_flask():
    app_web.run(host='0.0.0.0', port=8080)

def main():
    # تشغيل Flask في الخلفية
    threading.Thread(target=run_flask, daemon=True).start()
    
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(btn))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_msg))
    
    print("البوت يعمل...")
    app.run_polling()

if __name__ == '__main__':
    main()
