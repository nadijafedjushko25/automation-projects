# Daily Schedule to Telegram

Every evening sends tomorrow's appointments from Google Calendar to Telegram, so the day can be planned in advance.

Example message:

```
📅 Tomorrow (16.10), appointments: 3

• 10:00 — Olena, manicure
• 12:30 — Maryna, pedicure
• 15:00 — Iryna, brows
```

## How it works

A time-driven trigger runs `sendTomorrowSchedule` once a day. The script reads tomorrow's timed events (all-day events are skipped), formats them and sends one message via the Telegram Bot API.

## Setup

1. Create a bot with @BotFather and press **Start** in it.
2. Create a project at script.google.com and paste `Code.gs`.
3. **Script Properties:** `TELEGRAM_TOKEN`, `CHAT_ID`, optional `CALENDAR_ID`.
4. Set the project time zone, run `sendTomorrowSchedule` once to grant permissions.
5. **Triggers → Add trigger:** time-driven, day timer, e.g. 20:00–21:00, error notifications "immediately".

## Notes

- Built first as an n8n workflow, then rebuilt in Apps Script to run for free 24/7 without execution limits.
- A polling trigger every 15 minutes in n8n would use ~2,900 executions per month; a daily trigger needs only ~30.
