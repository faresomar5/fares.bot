<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>منصة فارس لربط البوت | Fares-Bot</title>
    <style>
        :root {
            --primary: #25d366;
            --dark: #121212;
            --card: #1e1e1e;
            --text: #ffffff;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: var(--dark);
            color: var(--text);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
        }

        .container {
            background-color: var(--card);
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            width: 100%;
            max-width: 400px;
            text-align: center;
        }

        h1 {
            color: var(--primary);
            margin-bottom: 20px;
            font-size: 24px;
        }

        p {
            font-size: 14px;
            color: #bbb;
            margin-bottom: 25px;
        }

        input {
            width: 100%;
            padding: 12px;
            margin-bottom: 20px;
            border: 1px solid #333;
            border-radius: 8px;
            background: #2a2a2a;
            color: white;
            box-sizing: border-box;
            text-align: center;
            font-size: 16px;
        }

        button {
            width: 100%;
            padding: 12px;
            background-color: var(--primary);
            color: black;
            border: none;
            border-radius: 8px;
            font-weight: bold;
            font-size: 16px;
            cursor: pointer;
            transition: 0.3s;
        }

        button:hover {
            background-color: #1ebd5a;
            transform: scale(1.02);
        }

        #result-container {
            margin-top: 25px;
            padding: 15px;
            border-radius: 8px;
            background: #2a2a2a;
            display: none;
        }

        .pairing-code {
            font-size: 28px;
            font-weight: bold;
            letter-spacing: 5px;
            color: var(--primary);
            margin: 10px 0;
        }

        .loader {
            border: 4px solid #f3f3f3;
            border-top: 4px solid var(--primary);
            border-radius: 50%;
            width: 30px;
            height: 30px;
            animation: spin 1s linear infinite;
            display: none;
            margin: 20px auto;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>

<div class="container">
    <h1>Fares-Bot Pairing</h1>
    <p>أدخل رقمك مع رمز الدولة للحصول على كود الربط</p>
    
    <input type="text" id="phoneNumber" placeholder="مثال: 967770000000">
    <button id="btn" onclick="requestPairingCode()">الحصول على الكود</button>

    <div id="loader" class="loader"></div>

    <div id="result-container">
        <span>كود الربط الخاص بك هو:</span>
        <div class="pairing-code" id="pairingCode">--------</div>
        <p style="margin-top:10px; font-size:12px;">قم بنسخ الكود ووضعه في إشعار الربط على هاتفك</p>
    </div>
</div>

<script>
    async function requestPairingCode() {
        const number = document.getElementById('phoneNumber').value;
        const btn = document.getElementById('btn');
        const loader = document.getElementById('loader');
        const resultContainer = document.getElementById('result-container');
        const codeDisplay = document.getElementById('pairingCode');

        if (!number) {
            alert("يرجى إدخال رقم الهاتف أولاً");
            return;
        }

        // إظهار اللودر وإخفاء النتائج القديمة
        btn.style.display = "none";
        loader.style.display = "block";
        resultContainer.style.display = "none";

        try {
            const response = await fetch(`/api/pairing?number=${number}`);
            const data = await response.json();

            if (data.status && data.pairing_code) {
                codeDisplay.innerText = data.pairing_code;
                resultContainer.style.display = "block";
            } else {
                alert("حدث خطأ: " + (data.error || "تعذر جلب الكود"));
            }
        } catch (error) {
            alert("خطأ في الاتصال بالسيرفر");
        } finally {
            loader.style.display = "none";
            btn.style.display = "block";
        }
    }
</script>

</body>
</html>
