import telebot
import requests

TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I"
API_URL = "https://fares-bot-eahg.onrender.com/api/pairing"

bot = telebot.TeleBot(TOKEN)

@bot.message_handler(commands=['start'])
def start(message):
    bot.reply_to(message, "أرسل رقم هاتفك الآن (بصيغة 967xxx):")

@bot.message_handler(func=lambda message: True)
def get_code(message):
    num = message.text.strip()
    msg = bot.reply_to(message, "⏳ جاري طلب الكود من السيرفر...")
    try:
        # زيادة وقت الانتظار لـ 30 ثانية لضمان استجابة Render
        res = requests.post(API_URL, json={"num": num}, timeout=30)
        data = res.json()
        if 'code' in data:
            bot.edit_message_text(f"🔢 كود الربط: `{data['code']}`", message.chat.id, msg.message_id, parse_mode="Markdown")
        else:
            bot.edit_message_text("❌ السيرفر رد ببيانات خاطئة، حاول مرة أخرى.", message.chat.id, msg.message_id)
    except Exception as e:
        bot.edit_message_text(f"❌ فشل الاتصال بالسيرفر. تأكد أن موقع Render شغال.\nالخطأ: {str(e)}", message.chat.id, msg.message_id)

bot.polling(none_stop=True)
