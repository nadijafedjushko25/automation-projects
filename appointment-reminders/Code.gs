// ===== CONFIGURATION =====
// Secrets are stored in Project Settings -> Script Properties, never in code.
const PROPS = PropertiesService.getScriptProperties();
const TOKEN = PROPS.getProperty('TELEGRAM_TOKEN');
const OWNER_CHAT_ID = PROPS.getProperty('OWNER_CHAT_ID');   // business owner who receives notifications
const CALENDAR_ID = PROPS.getProperty('CALENDAR_ID') || ''; // empty = default calendar
const STUDIO_NAME = PROPS.getProperty('STUDIO_NAME') || 'Studio';
const WEBAPP_URL = PROPS.getProperty('WEBAPP_URL');

// ===== TELEGRAM WEBHOOK ENTRY POINT =====
function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);
    writeLog(JSON.stringify(update));

    // Duplicate protection: Telegram may resend the same update
    const cache = CacheService.getScriptCache();
    const key = 'u' + update.update_id;
    if (cache.get(key)) return ok();
    cache.put(key, '1', 21600);

    if (update.callback_query) handleButton(update.callback_query);
    else if (update.message) handleMessage(update.message);
  } catch (err) {
    writeLog('ПОМИЛКА: ' + err);
  }
  return ok();
}

// Client writes to the bot or shares their phone number
function handleMessage(msg) {
  const chatId = String(msg.chat.id);

  if (msg.contact) {
    if (String(msg.contact.user_id) !== String(msg.from.id)) {
      send(chatId, 'Будь ласка, поділіться саме своїм номером кнопкою нижче.', contactKeyboard());
      return;
    }
    saveClient(msg.contact, chatId);
    send(chatId, `Дякуємо, ${msg.contact.first_name}! ✅ Тепер ви отримуватимете нагадування про записи до ${STUDIO_NAME}.`,
      { remove_keyboard: true });
    send(OWNER_CHAT_ID, `🆕 Нова підписка: ${msg.contact.first_name}, ${msg.contact.phone_number}`);
    return;
  }

  send(chatId, `Вітаємо! Щоб отримувати нагадування про записи до ${STUDIO_NAME}, натисніть кнопку нижче й поділіться номером телефону.`,
    contactKeyboard());
}

// Client pressed "I'll come" or "Can't come"
function handleButton(cb) {
  const parts = cb.data.split('|');
  const action = parts[0];
  const eventId = parts[1];
  const chatId = String(cb.message.chat.id);
  const tz = Session.getScriptTimeZone();

  let event = null;
  try { event = getCalendar().getEventById(eventId); } catch (err) { writeLog('Event error: ' + err); }
  const info = event
    ? `${event.getTitle()}, ${Utilities.formatDate(event.getStartTime(), tz, 'dd.MM о HH:mm')}`
    : 'запис';

  telegram('answerCallbackQuery', { callback_query_id: cb.id });
  telegram('editMessageReplyMarkup', { chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } });

  if (action === 'y') {
    send(chatId, 'Дякуємо! Чекаємо на вас 💛');
    send(OWNER_CHAT_ID, `✅ Підтвердила: ${info}`);
  } else {
    send(chatId, 'Дякуємо, що попередили! Напишіть, будь ласка, майстрині, щоб обрати інший час.');
    send(OWNER_CHAT_ID, `❌ Скасувала: ${info}\nВіконце вільне, можна запропонувати комусь іншому.`);
    if (event && event.getTitle().indexOf('❌') !== 0) event.setTitle('❌ ' + event.getTitle());
  }
}

// ===== DAILY REMINDERS (run by a time-driven trigger) =====
function sendReminders() {
  const tz = Session.getScriptTimeZone();
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const events = getCalendar().getEvents(start, end).filter(e => !e.isAllDayEvent());
  const notSent = [];
  let sent = 0;

  events.forEach(event => {
    const time = Utilities.formatDate(event.getStartTime(), tz, 'HH:mm');
    const phone = findPhone(event.getDescription() + ' ' + event.getTitle());
    const chatId = phone ? findChatId(phone) : null;

    if (!chatId) {
      notSent.push(`• ${time} ${event.getTitle()}`);
      return;
    }

    send(chatId, `Нагадуємо: завтра о ${time} у вас запис до ${STUDIO_NAME} (${event.getTitle()}). Чи все в силі?`, {
      inline_keyboard: [[
        { text: '✅ Прийду', callback_data: 'y|' + event.getId() },
        { text: '❌ Не зможу', callback_data: 'n|' + event.getId() }
      ]]
    });
    sent++;
  });

  let report = `📋 Нагадування на завтра: надіслано ${sent} з ${events.length}.`;
  if (notSent.length) {
    report += '\n\nНе надіслано (клієнтки немає в базі або немає телефону в описі), нагадайте вручну:\n' + notSent.join('\n');
  }
  send(OWNER_CHAT_ID, report);
}

// ===== CLIENT DATABASE (Google Sheets) =====
function saveClient(contact, chatId) {
  const sheet = getSheet('Клієнти', ['Ім\'я', 'Телефон', 'Chat ID', 'Дата підписки']);
  const phone = normalizePhone(contact.phone_number);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (normalizePhone(rows[i][1]) === phone) {
      sheet.getRange(i + 1, 3).setValue(chatId);
      return;
    }
  }
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
  sheet.appendRow([name, "'" + contact.phone_number, chatId, new Date()]);
}

function findChatId(phone) {
  const rows = getSheet('Клієнти', ['Ім\'я', 'Телефон', 'Chat ID', 'Дата підписки']).getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (normalizePhone(rows[i][1]) === phone && rows[i][2]) return String(rows[i][2]);
  }
  return null;
}

// Finds a phone number in text and returns its last 9 digits
function findPhone(text) {
  const m = String(text || '').replace(/[\s\-()]/g, '').match(/\d{9,12}/);
  return m ? normalizePhone(m[0]) : null;
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-9);
}

// ===== HELPERS =====
function getCalendar() {
  return CALENDAR_ID ? CalendarApp.getCalendarById(CALENDAR_ID) : CalendarApp.getDefaultCalendar();
}

function getSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers) sheet.appendRow(headers);
  }
  return sheet;
}

function contactKeyboard() {
  return {
    keyboard: [[{ text: '📱 Поділитися номером', request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true
  };
}

function send(chatId, text, markup) {
  const payload = { chat_id: chatId, text: text };
  if (markup) payload.reply_markup = markup;
  telegram('sendMessage', payload);
}

function telegram(method, payload) {
  const res = UrlFetchApp.fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) writeLog(`Telegram ${method} error: ${res.getContentText()}`);
  return res;
}

function writeLog(text) {
  getSheet('Log').appendRow([new Date(), String(text).slice(0, 40000)]);
}

function ok() {
  return HtmlService.createHtmlOutput('ok');
}

// Run once after deployment: connects the bot to this script and clears the queue
function setWebhook() {
  const res = UrlFetchApp.fetch(
    `https://api.telegram.org/bot${TOKEN}/setWebhook?url=${encodeURIComponent(WEBAPP_URL)}&drop_pending_updates=true`
  );
  writeLog('setWebhook: ' + res.getContentText());
}
