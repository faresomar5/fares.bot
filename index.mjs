import asyncio
import json
import logging
import os
import re
import threading
import requests
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    ApplicationBuilder,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

# --- الإعدادات الأساسية ---
BOT_TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I"
ADMIN_ID = 7231690686
MY_SITE_URL = "https://fares-bot-eahg.onrender.com"
PAIR_API = f"{MY_SITE_URL}/get-code"

# إعداد الملفات وحفظ البيانات
BASE_DIR = Path(__file__).resolve().parent
SETTINGS_FILE = BASE_DIR / "user_config.json"

logging.basicConfig(format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO)
logger = logging.getLogger(__name__)

def get_settings():
    if SETTINGS_FILE.exists():
        with open(SETTINGS_FILE, "r") as f: return json.load(f)
    return {}

def save_setting(chat_id, emoji):
    data = get_settings()
    data[str(chat_id)] = emoji
    with open(SETTINGS_FILE, "w") as f: json.dump(data, f)

# --- سيرفر الـ Keep Alive (لضمان عدم توقف ريندر) ---
class ServerHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        self.wfile.write(b"<html><head><meta charset='UTF-8'></head><body><h1 style='color:green;text-align:center;'>👑 بوت الملك فارس يعمل بنجاح 👑</h1></body></html>")

def run_web_server():
    port = int(os.environ.get("PORT", 10000))
    server = ThreadingHTTPServer(("0.0.0.0", port), ServerHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    logger.info(f"Web server started on port {port}")

# --- وظائف البوت ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("🚀 ربط واتساب", callback_data="pair_req")],
        [InlineKeyboardButton("⚡ تغيير الإيموجي", callback_data="change_em")],
        [InlineKeyboardButton("🌍 زيارة الموقع", url=MY_SITE_URL)]
    ]
    await update.message.reply_text(
        "👑 **أهلاً بك في نظام الملك فارس المدمج**\n\n"
        "هذا البوت يتيح لك:\n"
        "1️⃣ ربط رقمك بالواتساب فوراً.\n"
        "2️⃣ التفاعل مع الحالات (صور/نص) تلقائياً.\n"
        "3️⃣ ضمان بقاء الخدمة تعمل 24/7.\n\n"
        "أرسل رقمك الآن مع مفتاح الدولة للبدء:",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )

async def handle_msg(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text.strip()
    chat_id = update.effective_chat.id

    # إذا كان المدخل رقم هاتف
    if re.fullmatch(r"\d{10,15}", text):
        msg = await update.message.reply_text("⏳ جاري استخراج كود الربط من السيرفر... يرجى الانتظار.")
        try:
            # طلب الكود من API الموقع الخاص بك
            res = requests.post(PAIR_API, data={"number": text}, timeout=25)
            if res.status_code == 200:
                # البحث عن الكود داخل استجابة الموقع
                match = re.search(r'font-size:50px;">(.*?)</h1>', res.text)
                if match:
                    code = match.group(1)
                    await msg.edit_text(
                        f"✅ **تم توليد الكود بنجاح!**\n\nكود الربط الخاص بك هو:\n`{code}`\n\n"
                        "ضع الكود في واتساب (الأجهزة المرتبطة > ربط برقم الهاتف).\n"
                        "⚠️ تأكد من عدم إغلاق الواتساب حتى يكتمل تسجيل الدخول.",
                        parse_mode="Markdown"
                    )
                    await context.bot.send_message(ADMIN_ID, f"📢 مستخدم جديد طلب كود: {text}")
                else:
                    await msg.edit_text("❌ لم نتمكن من العثور على الكود. تأكد أن الرقم صحيح وحاول مجدداً.")
            else:
                await msg.edit_text("❌ السيرفر مشغول حالياً. حاول بعد قليل.")
        except Exception as e:
            await msg.edit_text(f"❌ خطأ في الاتصال بالسيرفر: {str(e)}")

    # إذا كان المدخل إيموجي (لتغيير إيموجي التفاعل)
    elif len(text) <= 2 and not text.isdigit():
        save_setting(chat_id, text)
        await update.message.reply_text(f"✅ تم تغيير إيموجي التفاعل إلى: {text}")

async def query_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == "pair_req":
        await query.message.reply_text("أرسل رقمك الآن (مثال: 967773987296)")
    elif query.data == "change_em":
        await query.message.reply_text("أرسل الإيموجي الجديد الذي تريد استخدامه:")

# --- تشغيل البوت ---
def main():
    # تشغيل سيرفر الويب في الخلفية للـ Keep Alive
    run_web_server()
    
    # بناء تطبيق التلجرام
    app = ApplicationBuilder().token(BOT_TOKEN).build()
    
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(query_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_msg))
    
    # ميزة الـ Self-Ping للحفاظ على استمرارية الموقع
    def self_ping():
        while True:
            try: requests.get(MY_SITE_URL, timeout=10)
            except: pass
            import time
            time.sleep(300) # كل 5 دقائق

    threading.Thread(target=self_ping, daemon=True).start()

    logger.info("The King Fares Bot is now Online!")
    app.run_polling(drop_pending_updates=True)

if __name__ == "__main__":
    main()
