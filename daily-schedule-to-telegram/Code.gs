// ===== CONFIGURATION =====
// Secrets are stored in Project Settings -> Script Properties, never in code.
const PROPS = PropertiesService.getScriptProperties();
const TELEGRAM_TOKEN = PROPS.getProperty('TELEGRAM_TOKEN');
const CHAT_ID = PROPS.getProperty('CHAT_ID');
const CALENDAR_ID = PROPS.getProperty('CALENDAR_ID') || ''; // empty = default calendar

// Sends tomorrow's appointments to Telegram
function sendTomorrowSchedule() {
  const calendar = CALENDAR_ID
    ? CalendarApp.getCalendarById(CALENDAR_ID)
    : CalendarApp.getDefaultCalendar();
  const tz = Session.getScriptTimeZone();

  // Start and end of tomorrow
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  // Only timed events (skip all-day events)
  const events = calendar.getEvents(start, end).filter(e => !e.isAllDayEvent());
  const dateText = Utilities.formatDate(start, tz, 'dd.MM');

  let text;
  if (events.length === 0) {
    text = `📅 Завтра (${dateText}) записів немає. Гарного відпочинку!`;
  } else {
    const lines = events.map(e =>
      '• ' + Utilities.formatDate(e.getStartTime(), tz, 'HH:mm') + ' — ' + e.getTitle()
    );
    text = `📅 Завтра (${dateText}), записів: ${events.length}\n\n` + lines.join('\n');
  }

  sendTelegram(text);
}

// Sends a message via the Telegram bot
function sendTelegram(text) {
  const url = 'https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendMessage';
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: CHAT_ID, text: text })
  });
}
