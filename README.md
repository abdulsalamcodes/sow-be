# Sow — Backend

AI-powered financial assistant backend, built on Monnify's payment infrastructure. NestJS
exposes both the REST API and an embedded Mastra AI agent that lets users manage their wallet,
transfers, and spending through a conversational chat interface.

See [SPEC.md](./SPEC.md) for the full product/architecture spec.

## Tech stack

- **Framework:** NestJS + TypeScript
- **ORM / Database:** TypeORM + PostgreSQL
- **AI:** Mastra AI, embedded in the NestJS app, backed by an OpenAI-compatible LLM endpoint
  (Ollama locally, Ollama Cloud in production)
- **Auth:** JWT (access + refresh), email + password, optional Google OAuth, email verification
  via OTP (Plunk)
- **Payments & banking:** Monnify APIs

## Prerequisites

- Node.js 20 LTS or newer
- npm
- A PostgreSQL database (local, Docker, or a Railway instance)
- [Ollama](https://ollama.com) running locally for AI development (or any OpenAI-compatible
  endpoint)

## Getting started

```bash
# install dependencies
npm install

# copy the environment template and fill in your values
cp .env.example .env

# start Postgres locally if you don't already have one running, e.g.:
# docker run --name sow-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres

# start the dev server (watch mode)
npm run start:dev
```

The API listens on `http://localhost:<PORT>` (default `3000`). Database tables are created
automatically in development (`synchronize: true`) — no migration step is required to get started.

## Environment variables

Copy [.env.example](./.env.example) to `.env` and fill in the values. See SPEC.md → _Environment
Variables_ for the authoritative reference. Notes:

- `JWT_SECRET` must be set to a strong random value.
- `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` point at any OpenAI-compatible chat endpoint —
  defaults in `.env.example` target a local Ollama instance.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` are only required if you
  want Google sign-in; email + password auth works without them.
- `MONNIFY_*` variables are consumed by the (not yet implemented) BE2 financial modules; the AI
  and chat layers run against in-memory stubs (`src/contracts/stubs`) until those land.
- `PLUNK_API_KEY` is required for email OTP delivery; signup does not fail if it's missing, but
  verification email won't be sent.

## Available scripts

```bash
npm run start          # start the app
npm run start:dev      # start in watch mode
npm run start:debug    # start in watch mode with the debugger attached
npm run start:prod     # run the compiled build (dist/main.js)
npm run build          # compile TypeScript to dist/

npm run test           # run unit tests
npm run test:watch     # run unit tests in watch mode
npm run test:cov       # run unit tests with coverage
npm run test:e2e       # run end-to-end tests

npm run lint           # lint and autofix
npm run format         # format with Prettier

npm run migration:generate  # generate a TypeORM migration from entity changes
npm run migration:run       # apply pending migrations
npm run migration:revert    # revert the last migration
```

## Validating AI tool-calling

Before relying on a given `LLM_MODEL`, run the tool-calling validation script against a set of
realistic prompts (stubbed financial data, no database required beyond `LLM_*` env vars):

```bash
npx ts-node -r tsconfig-paths/register scripts/validate-tool-calling.ts
```

It prints the tool selected for each prompt so you can confirm the model reliably picks the right
tool with valid arguments before it's used for a demo.

## Project structure

```text
src/
├── ai/            # Mastra agent, tools, model + memory config
├── analytics/      # spending analytics (summary, category breakdown, budget, affordability)
├── auth/           # registration, login, JWT, Google OAuth, email OTP verification
├── chat/           # SSE chat endpoint, conversation history, transaction intent confirm/cancel
├── config/         # database configuration
├── contracts/      # interfaces + injection tokens for BE2's financial services, with stubs
├── entities/        # TypeORM entities
├── intents/         # two-step money-movement confirmation flow (TransactionIntent lifecycle)
├── mail/            # transactional email (Plunk)
└── users/           # user lookup/creation
```
