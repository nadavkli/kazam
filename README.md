# Kazam

Prediction market game for Israeli Home Front Command alerts, played via Telegram.

**Bot:** [@KazamGameBot](https://t.me/KazamGameBot)

## What is it?

When an alert fires, players bet on:
- **Where** will the next alert hit?
- **When** will the next alert happen?
- **What** type of alert? (rockets, UAV, etc.)
- **How many** alerts today?
- **Intensity** — more or fewer than yesterday?

Winners split the pool. Harder predictions pay more.

## Tech Stack

- **Backend:** Cloudflare Workers + Durable Objects + D1 + Queues + KV
- **Frontend:** React + Vite on Cloudflare Pages
- **Bot:** grammY (Telegram Bot framework)
- **ORM:** Drizzle
- **Monorepo:** Turborepo

## Project Structure

```
packages/
  shared/    # Types, constants, odds calculation, region mapping
  db/        # Drizzle schema + queries
  worker/    # Cloudflare Worker (API, bot, alert poller, crons)
  web/       # React mini app (Telegram WebApp)
```

## Setup

1. Clone the repo
2. `npm install`
3. Copy `.dev.vars.example` to `.dev.vars` and fill in your secrets
4. `npm run dev` to start local development
5. `npm run deploy` to deploy to Cloudflare

## License

MIT
