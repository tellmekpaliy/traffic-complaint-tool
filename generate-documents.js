// netlify/functions/generate-documents.js
// Эта функция работает на сервере Netlify
// API ключ Claude хранится в переменной окружения (безопасно)

exports.handler = async (event, context) => {
  // Проверяем, что это POST запрос
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Парсим данные от клиента
    const data = JSON.parse(event.body);

    // Получаем API ключ из переменной окружения (установлена в Netlify)
    const apiKey = process.env.CLAUDE_API_KEY;
    
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'API ключ не настроен на сервере' })
      };
    }

    // Формируем промпт для Claude
    const messageContent = `Создайте два документа на русском языке на основе следующей информации:

ИНФОРМАЦИЯ О НАРУШЕНИИ:
- Компания: ${data.company}
- Дата: ${data.eventDate}
- Время: ${data.eventTime}
- Адрес: ${data.address}
- Видеодоказательство: ${data.hasMedia}
- Описание: ${data.description}

ИНФОРМАЦИЯ О СВИДЕТЕЛЕ:
- ФИО: ${data.userName}
- Адрес: ${data.userAddress}
- Телефон: ${data.userPhone}
- Email: ${data.userEmail}

ДОКУМЕНТ 1 - ПИСЬМО КОМПАНИИ "${data.company}":
Создайте формальное деловое письмо компании с требованием расследования нарушения ст. 12.15 КоАП РФ (движение по тротуару). Письмо должно быть твердым, но профессиональным. Упомяните видеодоказательство. Требуйте письменного ответа в течение 3 дней. Намекните на возможность жалобы в ГИБДД.

ДОКУМЕНТ 2 - ЖАЛОБА В ГИБДД МВД ПО Г. МОСКВЕ:
Создайте официальную жалобу о нарушении ст. 12.15 КоАП РФ (выезд на тротуар). Жалоба должна быть объективной, фактической. Содержать все реквизиты свидетеля, описание нарушения, упоминание видеодоказательства и его метаданных. Четкое требование провести служебное расследование.

Выведите результат в формате:
[ПИСЬМО]
...текст письма...
[КОНЕЦ ПИСЬМА]

[ЖАЛОБА]
...текст жалобы...
[КОНЕЦ ЖАЛОБЫ]`;

    // Отправляем запрос в Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        messages: [{ role: 'user', content: messageContent }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      let errorMessage = 'Claude API Error';
      if (errorData.error) {
        errorMessage = errorData.error.message || errorData.error.type || 'Claude API Error';
      }
      
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: errorMessage })
      };
    }

    const result = await response.json();
    const fullText = result.content[0].text;

    // Парсим результат
    const letterMatch = fullText.match(/\[ПИСЬМО\]([\s\S]*?)\[КОНЕЦ ПИСЬМА\]/);
    const complaintMatch = fullText.match(/\[ЖАЛОБА\]([\s\S]*?)\[КОНЕЦ ЖАЛОБЫ\]/);

    const letterText = letterMatch ? letterMatch[1].trim() : 'Письмо не сгенерировано';
    const complaintText = complaintMatch ? complaintMatch[1].trim() : 'Жалоба не сгенерирована';

    // Возвращаем результат клиенту
    return {
      statusCode: 200,
      body: JSON.stringify({
        letter: letterText,
        complaint: complaintText
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
