import telebot
import requests

TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I"
API_URL = "https://fares-bot-eahg.onrender.com/api/pairing"

bot = telebot.TeleBot(TOKEN)

@bot.message_handler(commands=['start'])
def send_welcome(message):
    bot.reply_to(message, "أرسل رقم هاتفك مع رمز الدولة للحصول على كود الربط.")

@bot.message_handler(func=lambda message: True)
def get_code(message):
    number = message.text.strip()
    bot.reply_to(message, "⏳ جاري طلب الكود...")
    try:
        response = requests.post(API_URL, json={"num": number})
        data = response.json()
        bot.send_message(message.chat.id, f"🔢 كود الربط الخاص بك هو: {data['code']}")
    except:
        bot.send_message(message.chat.id, "❌ حدث خطأ، تأكد من تشغيل السيرفر.")

bot.polling()
