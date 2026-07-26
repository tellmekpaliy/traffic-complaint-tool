// netlify/functions/generate-documents.js
// Эта функция работает на сервере Netlify
// API ключ Claude хранится в переменной окружения (безопасно)
// ОПТИМИЗИРОВАНО: Используется кэширование промпта для сокращения расходов

const Anthropic = require("@anthropic-ai/sdk");

// Статичная системная инструкция (кэшируется на 5 минут)
const SYSTEM_PROMPT = `Ты опытный помощник по составлению жалоб о нарушениях ПДД в Москве.

ЗАДАЧА:
1. Создать вежливое, четкое письмо компании-перевозчика о нарушении ПДД
2. Составить официальную жалобу в ГИБДД

ТРЕБОВАНИЯ ДЛЯ ПИСЬМА:
- От первого лица (граждане, свидетели)
- Вежливый, но твердый тон
- Четкие детали: дата, время, адрес, марка авто
- Ссылка на доказательства (видео/фото)
- Просьба принять меры
- Подпись: ФИО, контакты

ТРЕБОВАНИЯ ДЛЯ ЖАЛОБЫ В ГИБДД:
- Формальный, официальный стиль
- Четкое описание нарушения ст. 12.15 КоАП РФ (движение по тротуару)
- Указание на доказательства (видео/фото с метаданными)
- Просьба привлечь водителя к ответственности
- Все реквизиты свидетеля

ФОРМАТ ОТВЕТА (обязательно):
[ПИСЬМО]
полный текст письма компании
[КОНЕЦ ПИСЬМА]

[ЖАЛОБА]
полный текст жалобы в ГИБДД
[КОНЕЦ ЖАЛОБЫ]`;

exports.handler = async (event, context) => {
  // Проверяем, что это POST запрос
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // Парсим данные от клиента
    const data = JSON.parse(event.body);

    // Валидация данных
    if (!data.company || !data.eventDate || !data.address) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing required fields: company, eventDate, address",
        }),
      };
    }

    // Получаем API ключ из переменной окружения
    const apiKey = process.env.CLAUDE_API_KEY;
    
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "API ключ не настроен на сервере" }),
      };
    }

    // Инициализируем SDK с API ключом
    const client = new Anthropic({
      apiKey: apiKey,
    });

    // Динамичные данные пользователя (не кэшируются)
    const userPrompt = `Составьте два документа по этим данным:

ИНФОРМАЦИЯ О НАРУШЕНИИ:
- Компания: ${data.company}
- Дата нарушения: ${data.eventDate}
- Время нарушения: ${data.eventTime || "уточнить"}
- Адрес: ${data.address}
- Доказательство: ${data.hasMedia}
- Описание нарушения: ${data.description}

ДАННЫЕ СВИДЕТЕЛЯ:
- ФИО: ${data.userName}
- Адрес: ${data.userAddress}
- Телефон: ${data.userPhone}
- Email: ${data.userEmail}`;

    // Запрос к Claude с кэшированием системного промпта
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          // Кэшируем системный промпт на 5 минут (экономит 90% расходов на него)
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    // Парсим результат
    const fullText = response.content[0].text;
    const letterMatch = fullText.match(/\[ПИСЬМО\]([\s\S]*?)\[КОНЕЦ ПИСЬМА\]/);
    const complaintMatch = fullText.match(/\[ЖАЛОБА\]([\s\S]*?)\[КОНЕЦ ЖАЛОБЫ\]/);

    const letterText = letterMatch ? letterMatch[1].trim() : "Письмо не сгенерировано";
    const complaintText = complaintMatch ? complaintMatch[1].trim() : "Жалоба не сгенерирована";

    // Возвращаем результат с информацией об использовании токенов
    return {
      statusCode: 200,
      body: JSON.stringify({
        letter: letterText,
        complaint: complaintText,
        // Информация об использовании (для контроля расходов)
        _stats: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          cache_creation_input_tokens: response.usage.cache_creation_input_tokens || 0,
          cache_read_input_tokens: response.usage.cache_read_input_tokens || 0,
          cache_active: (response.usage.cache_read_input_tokens || 0) > 0,
        },
      }),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || "Failed to generate documents. Please try again.",
      }),
    };
  }
};
