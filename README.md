# Automation Projects

Small, real-world automations built with **n8n**, **Google Apps Script**, **Telegram Bot API** and **Gemini AI**.
They solve everyday problems for individuals and small businesses, and most of them run for free.

I'm a QA Engineer, so each project also documents how it was tested and which issues were found and fixed along the way.

## Projects

| Project | What it does | Tech |
|---|---|---|
| [VYSHYVANKA AI Shop Assistant](./vyshyvanka-ai-assistant) | AI consultant for an online store in Telegram: products, sizes, delivery, with conversation memory and anti-hallucination rules | n8n, AI Agent, Gemini, Telegram Bot API |
| [Telegram Expense Tracker](./telegram-expense-tracker) | Records expenses from text **and voice** messages into Google Sheets; monthly report on request | Apps Script, Telegram Bot API, Gemini API, Google Sheets |
| [Appointment Reminders](./appointment-reminders) | Sends clients reminders with **"I'll come / Can't come"** buttons and notifies the business owner | Apps Script, Telegram Bot API, Google Calendar, Google Sheets |
| [Daily Schedule to Telegram](./daily-schedule-to-telegram) | Sends tomorrow's calendar appointments to Telegram every evening | Apps Script, Google Calendar, Telegram Bot API |

## Skills demonstrated

- AI agents in n8n: system prompt design, conversation memory, hallucination control
- Workflow automation with Google Apps Script (time-driven triggers, web apps, webhooks)
- Integration with external APIs: Telegram Bot API, Gemini API
- Debugging integrations: HTTP status codes, webhook retries, duplicate events, logging
- Secure configuration: secrets stored in Script Properties, never in code
- QA mindset: positive and negative scenarios, edge cases, error handling, testing of AI behavior

## Security

No tokens, API keys or personal data are stored in this repository. All secrets are configured in
**Apps Script → Project Settings → Script Properties** or in **n8n credentials**.
