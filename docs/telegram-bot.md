# Telegram Bot

The repository now contains a `telegram-bot` service.

What it does:

- links a private Telegram chat to the same Dream Journal account;
- creates a Telegram-based user automatically on the first bot message;
- starts a new dream with `/new`;
- sends Telegram messages into the same backend flow as the web app;
- saves everything into the same PostgreSQL database.

## Important limitation

The code for the bot is created in this repository, but the real Telegram bot account itself must still be created from your Telegram account through BotFather.

This cannot be automated from the local workspace because BotFather requires your Telegram session.

## 1. Create the bot in Telegram

Open Telegram and talk to `@BotFather`.

Run:

```text
/newbot
```

Then:

- choose a visible bot name;
- choose a unique username ending with `bot`;
- copy the token that BotFather returns.

Example:

```text
Visible name: Dream Journal Assistant
Username: your_dream_journal_bot
```

## 2. Fill `.env`

Add real values:

```env
APP_TELEGRAM_ENABLED=true
APP_TELEGRAM_BOT_USERNAME=your_dream_journal_bot
APP_TELEGRAM_INTERNAL_SECRET=replace-with-a-long-random-secret
TELEGRAM_BOT_TOKEN=123456:ABCDEF_your_real_bot_token
```

You can keep the existing Ollama settings as they are.

## 3. Start services

```bash
docker compose up --build backend frontend telegram-bot
```

## 4. Two ways to start using it

### Option A: start directly in Telegram

1. Open `@DreamPsyBot`.
2. Send `/start` or just write your first dream message.
3. The system will create a Telegram-based profile automatically.

### Option B: connect an existing website account

1. Open the web app.
2. Log in.
3. Use the Telegram card in the sidebar.
4. Press "Link Telegram".
5. The app will generate a one-time code and open the correct start link automatically.

After that, in both cases:

- send a dream description in Telegram;
- answer the follow-up question about emotions;
- tap the suggested keyword buttons and press `Done`;
- the interpretation will be saved into the same account and database.

You can still type keywords manually as a comma-separated list if needed, but the default Telegram flow now supports inline multi-select buttons with `Reset` and `Done`.

## Supported commands

```text
/start
/link CODE
/new
/unlink
/help
```

## Current MVP boundaries

- private one-to-one chats only;
- text messages only;
- voice messages in Telegram are transcribed into text locally before sending them into the dialogue;
- the bot uses long polling, not webhooks;
- if a user first starts in Telegram and later links a website account, dreams from the temporary Telegram profile are moved into the website account.
