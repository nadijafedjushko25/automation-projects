// ===== CONFIGURATION =====
// Secrets are stored in Project Settings -> Script Properties, never in code.
const PROPS = PropertiesService.getScriptProperties();
const TOKEN = PROPS.getProperty('TELEGRAM_TOKEN');
const MY_CHAT_ID = PROPS.getProperty('ALLOWED_CHAT_ID');   // the bot answers only this user
const WEBAPP_URL = PROPS.getProperty('WEBAPP_URL');
const GEMINI_KEY = PROPS.getProperty('GEMINI_API_KEY');
const GEMINI_MODEL = PROPS.getProperty('GEMINI_MODEL') || 'gemini-3.8-flash';

// Telegram sends every message to the bot here (webhook)
function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);
    writeLog(JSON.stringify(update));

    // Duplicate protection: Telegram may resend the same update
    const cache = CacheService.getScriptCache();
    const key = 'u' + update.update_id;
    if (cache.get(key)) return ok();
    cache.put(key, '1', 21600);

    const msg = update.message;
    if (!msg) return ok();
    const chatId = String(msg.chat.id);
    if (chatId !== String(MY_CHAT_ID)) return ok();

    // Voice or audio message
    const audio = msg.voice || msg.audio;
    if (audio) {
      reply(chatId, '🎤 Слухаю...');
      reply(chatId, addVoiceExpense(audio.file_id, audio.mime_type));
      return ok();
    }

    if (!msg.text) return ok();
    const text = msg.text.trim();
    if (text === '/start' || text === '/help') {
      reply(chatId, 'Пишіть витрати так: кава 85 або продукти 1250 АТБ\nАбо надішліть голосове: "купила сир за сто двадцять"\nЗвіт за місяць: /month або слово "звіт"');
    } else if (text === '/month' || text.toLowerCase() === 'звіт') {
      reply(chatId, monthReport());
    } else {
      reply(chatId, addExpense(text));
    }
  } catch (err) {
    writeLog('ПОМИЛКА: ' + err);
  }
  return ok();
}

// ===== TEXT EXPENSES =====
function addExpense(text) {
  const match = text.match(/\d+([.,]\d+)?/);
  if (!match) return '🤔 Не бачу суми. Напишіть, наприклад: кава 85';

  const amount = parseFloat(match[0].replace(',', '.'));
  const words = text.replace(match[0], ' ').trim().split(/\s+/).filter(Boolean);
  const category = findCategory((words[0] || '').toLowerCase());
  const description = words.join(' ');

  SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]
    .appendRow([new Date(), amount, category, description]);

  return `✅ ${category} — ${amount} грн` + (description ? ` (${description})` : '');
}

function findCategory(word) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Категорії');
  if (!sheet || !word) return 'Інше';
  const rows = sheet.getDataRange().getValues();
  for (const row of rows) {
    const name = String(row[0] || '').trim();
    if (!name) continue;
    const keywords = [name].concat(String(row[1] || '').split(','));
    if (keywords.some(k => k.trim().toLowerCase() === word)) return name;
  }
  return 'Інше';
}

// ===== VOICE EXPENSES (Gemini) =====
function addVoiceExpense(fileId, mimeType) {
  try {
    const info = JSON.parse(UrlFetchApp.fetch(
      `https://api.telegram.org/bot${TOKEN}/getFile?file_id=${fileId}`
    ).getContentText());
    const audio = UrlFetchApp.fetch(
      `https://api.telegram.org/file/bot${TOKEN}/${info.result.file_path}`
    ).getBlob();

    const categories = getCategoryNames();
    const prompt =
      'Це голосове повідомлення українською про витрату грошей. ' +
      'Визнач суму в гривнях, категорію і короткий опис. ' +
      'Категорію обери СТРОГО з цього списку: ' + categories.join(', ') +
      '. Якщо жодна не підходить, використай "Інше". ' +
      'Відповідай лише JSON: {"amount": число, "category": "назва", "description": "короткий опис", "transcript": "що було сказано"}. ' +
      'Якщо суми немає, постав amount: null.';

    // Call Gemini; if the model is overloaded (503), retry up to 3 times
    let res;
    for (let attempt = 1; attempt <= 3; attempt++) {
      res = UrlFetchApp.fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'post',
          contentType: 'application/json',
          muteHttpExceptions: true,
          payload: JSON.stringify({
            contents: [{ parts: [
              { inline_data: { mime_type: mimeType || 'audio/ogg', data: Utilities.base64Encode(audio.getBytes()) } },
              { text: prompt }
            ]}],
            generationConfig: { responseMimeType: 'application/json' }
          })
        }
      );
      if (res.getResponseCode() !== 503) break;
      Utilities.sleep(3000 * attempt);
    }

    if (res.getResponseCode() !== 200) {
      writeLog('Gemini error: ' + res.getContentText());
      return '⚠️ Gemini не зміг розпізнати голосове (деталі в аркуші Log).';
    }

    const answer = JSON.parse(res.getContentText()).candidates[0].content.parts[0].text;
    const data = JSON.parse(answer);
    if (!data.amount) return `🤔 Не почула суми. Розпізнано: "${data.transcript || ''}"`;

    const category = categories.includes(data.category) ? data.category : 'Інше';
    const description = data.description || '';
    SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]
      .appendRow([new Date(), Number(data.amount), category, description]);

    return `🎤 ✅ ${category} — ${data.amount} грн` + (description ? ` (${description})` : '');
  } catch (err) {
    writeLog('Voice error: ' + err);
    return '⚠️ Помилка з голосовим (деталі в аркуші Log).';
  }
}

function getCategoryNames() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Категорії');
  if (!sheet) return ['Інше'];
  const names = sheet.getRange('A:A').getValues().map(r => String(r[0]).trim()).filter(Boolean);
  if (!names.includes('Інше')) names.push('Інше');
  return names;
}

// ===== MONTHLY REPORT =====
function monthReport() {
  const rows = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]
    .getDataRange().getValues().slice(1);
  const now = new Date();
  const totals = {};
  let sum = 0;
  rows.forEach(row => {
    const date = new Date(row[0]);
    const amount = Number(row[1]);
    if (isNaN(date) || isNaN(amount)) return;
    if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) {
      totals[row[2]] = (totals[row[2]] || 0) + amount;
      sum += amount;
    }
  });
  if (sum === 0) return 'Цього місяця витрат ще немає.';
  const round = x => Math.round(x * 100) / 100;
  const lines = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, s]) => `• ${cat}: ${round(s)} грн`);
  return `📊 Витрати за цей місяць: ${round(sum)} грн\n\n` + lines.join('\n');
}

// ===== HELPERS =====
function reply(chatId, text) {
  UrlFetchApp.fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: text })
  });
}

function writeLog(text) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Log') || ss.insertSheet('Log');
  sheet.appendRow([new Date(), String(text).slice(0, 40000)]);
}

function ok() {
  return HtmlService.createHtmlOutput('ok');
}

// Manual check from the editor: select testBot and click Run
function testBot() {
  writeLog('testBot запущено');
  reply(MY_CHAT_ID, 'Тест: бот працює ✅');
}
