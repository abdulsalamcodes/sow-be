# Monnify Hackathon Plan — Sow

## Project Overview

We are building an AI-powered financial assistant web app that helps users seamlessly manage their day-to-day financial activities using Monnify's APIs as the underlying payment infrastructure.

The assistant provides a conversational interface for sending money, managing wallets, paying bills, tracking spending, and receiving personalized financial insights.

## Team

- **Backend Engineer 1** — AI Agent, orchestration, authentication, and intelligence layer.
- **Backend Engineer 2** — Monnify integration, banking APIs, wallet management, payments, and webhooks.
- **Frontend Engineer** — Web application, chat interface, onboarding, authentication, confirmation UI, and transaction flows.
- **Coding Agents (AI)** — Boilerplate generation, testing, documentation, UI generation, API scaffolding, debugging, and pair programming.

---

# MVP Scope

The objective is not to build every possible feature. The objective is to demonstrate a compelling AI-first financial experience built on Monnify.

## Must-Have Features

### User

- Sign up (email + password)
- Email verification via 6-digit OTP (non-blocking — see Authentication & Mail)
- Login (email + password, JWT access + refresh tokens)
- Optional Google OAuth one-click sign-in
- User onboarding
- KYC (BVN/NIN capture — required by Monnify for reserved/virtual accounts; budget real time for this on Day 1)

### Wallet

- Automatically create a wallet (Monnify reserved virtual account)
- View wallet balance
- Fund wallet (via virtual account transfer, confirmed by webhook)

### Payments

- Transfer funds (with two-step confirmation — see Financial Safety)
- Beneficiaries: save recipients by name so "Transfer ₦5,000 to Aisha" can resolve to an account
- Accept incoming payments (webhook-driven)

### Transactions & Insights

- Wallet transaction history (from Monnify + local ledger)
- Spending analysis over wallet transactions

### AI Assistant

The chat assistant should understand prompts like:

- "Fund my wallet with ₦20,000."
- "Transfer ₦5,000 to Aisha."
- "How much did I spend this week?"
- "Where is most of my money going?"
- "Summarize my expenses."
- "Can I afford another ₦30,000 purchase this month?"

## Stretch Features (only if time permits)

- Bill payments
- External bank account linking / bank transaction aggregation — **feasibility unverified**: Monnify is a payment gateway, not an open-banking aggregator. Verify on Day 1 what Monnify actually offers here; true bank-statement aggregation would require a provider like Mono or Okra and is out of MVP scope. All must-have analytics run on **wallet transactions only**, so nothing in the MVP depends on this.

---

# AI Capabilities

The intelligence layer should provide:

- Budget analysis
- Spending categorization
- Transaction summaries
- Spending trends
- Natural language financial queries
- Personalized financial recommendations

All computed deterministically by `AnalyticsService` — see the Analytics section. The LLM narrates results; it never does arithmetic.

---

# User Flow

1. User signs up with email + password and receives a verification OTP by email.
2. User lands in the app immediately; a soft prompt asks them to verify their email.
3. Complete KYC (BVN/NIN). Email must be verified before KYC submission.
4. Wallet is automatically created.
5. User lands inside the AI chat.
6. User performs all financial actions from chat.
7. Read-only actions execute immediately; money-moving actions produce a confirmation card the user must approve.
8. Backend invokes Monnify APIs through domain services.
9. Results are streamed back conversationally.

---

# System Architecture

## High-Level Overview

The application is built as a **single deployable backend** with Mastra embedded directly into the NestJS application. This keeps the architecture simple, reduces deployment complexity, and eliminates unnecessary inter-service communication—an ideal approach for a three-day hackathon.

The frontend communicates with the backend through a streaming chat interface, while NestJS orchestrates the AI agent, business logic, and Monnify integrations.

```text
React (Vercel)
      │
      │ useChat (SSE)
      ▼
NestJS Backend (Railway)
      │
      ├───────────────────────────────────────────────┐
      │                                               │
      ▼                                               │
Chat Module                                            │
      │                                               │
      ▼                                               │
Mastra Agent (sow-agent)                              │
      │                                               │
      │ Tool Calls (Zod Schemas)                      │
      ▼                                               │
Domain Services                                       │
 ├── WalletService                                    │
 ├── PaymentsService                                  │
 ├── TransactionsService                              │
 ├── BanksService                                     │
 └── AnalyticsService                                 │
      │                                               │
      ▼                                               │
Monnify Client                                        │
(single HTTP client + token refresh)                  │
      │                                               │
      ▼                                               │
Monnify APIs                                          │
                                                      ▲
                                                      │
                                      Monnify Webhooks
                                                      │
                                                      ▼
                                   Webhook Controller
                                       (NestJS)

                    PostgreSQL (Railway)
            App Database + Mastra Memory Storage
```

## Design Principles

The architecture is intentionally optimized for rapid delivery.

- Single backend deployment.
- No microservices.
- Shared business logic between REST endpoints and AI tools.
- AI orchestrates workflows but never owns business rules.
- Domain services own all financial operations.
- Every financial action follows a secure, auditable path.

---

# Technology Stack

## Frontend

- React (Vite)
- Tailwind CSS
- AI SDK `useChat` hook
- Server-Sent Events (SSE)
- Deployed on Vercel

## Backend

- NestJS
- TypeScript
- TypeORM
- Deployed on Railway

## AI

- Mastra AI (embedded in the NestJS app)
- Ollama (local in development, Ollama Cloud in production)
- OpenAI-compatible SDK (`@ai-sdk/openai-compatible`)

## Database

- PostgreSQL, hosted on Railway
- Separate development and production databases (two Railway instances — never share one)
- Also stores Mastra Memory

## Payments & Banking

- Monnify APIs: Wallet, Transfer, Virtual Accounts, Customer Verification, Transactions
- Sandbox environment for all development; live keys only for the demo if required

## Authentication & Mail

- Email + password credentials (passwords hashed with bcrypt).
- JWT access tokens plus refresh tokens (refresh token hash stored per user).
- Optional Google OAuth one-click sign-in.
- Email verification via 6-digit OTP sent through **Plunk** (transactional email API).
- OTP verification is a **non-blocking soft gate**: after signup the user receives a JWT and enters the app immediately, with a prompt to verify. A verified email is required only before sensitive actions (KYC submission, first wallet funding), so live email delivery is never on the critical path of the demo.
- OTPs are single-use, short-lived, and rate-limited on resend.

## Infrastructure

- Source control: GitHub
- Frontend hosting: Vercel
- Backend + database hosting: Railway

---

# AI Model Configuration

Mastra already abstracts model providers, so there is no need to build a provider factory. The entire application should reference a single model configuration.

```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const model = createOpenAICompatible({
    name: "llm",
    baseURL: process.env.LLM_BASE_URL,
    apiKey: process.env.LLM_API_KEY,
}).chatModel(process.env.LLM_MODEL);
```

This enables seamless switching between environments:

| Environment | Provider |
|------------|----------|
| Development | Local Ollama |
| Production | Ollama Cloud |
| Future | OpenAI / Anthropic |

Changing providers only requires updating:

- `LLM_BASE_URL`
- `LLM_API_KEY`
- `LLM_MODEL`

No architectural changes are required.

---

# AI Agent Architecture

The Mastra Agent acts as the orchestrator.

Its responsibilities include:

- Understanding user intent.
- Selecting the appropriate tool.
- Calling domain services.
- Formatting conversational responses.
- Streaming responses to the frontend.

The agent **does not**:

- Query the database directly.
- Call Monnify APIs directly.
- Implement business rules.
- Perform authorization.
- Execute financial transactions independently.

---

# Tool Architecture

Each tool exposes a single capability.

Every tool:

- Validates inputs using Zod.
- Delegates execution to a NestJS service.
- Returns structured results.

Example:

```
Transfer Tool
↓
Validate Amount
↓
WalletService.transfer()
↓
Return Result
```

Tools remain intentionally thin. Business logic lives entirely inside the domain services.

---

# Service Layer

The service layer is the heart of the application.

```
WalletService
PaymentsService
TransactionsService
BanksService
AnalyticsService
```

Every financial operation originates here. Whether a request comes from:

- the AI chat,
- a REST endpoint,
- or a future mobile app,

it always executes through the same service methods. This creates a single source of truth.

`BanksService` scope for the MVP: Monnify-supported operations only — bank list, account name resolution for transfers, and customer verification. External bank aggregation is a stretch feature (see MVP Scope).

---

# Security Model

## Identity Never Passes Through the LLM

The language model never receives or generates user identifiers.

Instead:

- JWT authentication identifies the user.
- `userId` is injected into Mastra's `runtimeContext`.
- Services use the authenticated identity.

The LLM cannot:

- impersonate another user,
- fabricate account identifiers,
- authorize privileged actions.

Authorization is enforced exclusively within the service layer.

---

# Financial Safety

Financial actions use a two-step confirmation flow.

## Read-only actions

These execute immediately.

Examples:

- Check wallet balance.
- Spending summary.
- Recent transactions.
- Budget insights.

## Money-moving actions

These never execute immediately.

Instead:

1. AI prepares the request (resolving beneficiary names to accounts, validating amounts).
2. A pending transaction intent is created (with an idempotency key).
3. The frontend displays a confirmation card.
4. The user confirms.
5. A dedicated REST endpoint executes the transaction.

This significantly reduces the risk of incorrect AI-generated payment instructions while providing a trustworthy fintech user experience.

## Balance Source of Truth

Monnify is the source of truth for wallet balances. The local database is a ledger/cache used for analytics and transaction history. Reconcile on webhook events, never by trusting the local balance for transfers.

## Money Representation

All amounts are stored and computed internally as **integer kobo**. Convert to naira only at the Monnify client boundary (Monnify amounts) and at the UI edge (display). No floating-point currency anywhere.

---

# Memory

Mastra Memory is used directly.

Storage: PostgreSQL on Railway.

Configuration:

```
resourceId = userId
threadId = conversationId
```

Benefits:

- Persistent conversations.
- Long-term context.
- User personalization.
- No custom memory implementation required.

---

# Analytics

The LLM never performs calculations.

Instead, `AnalyticsService` computes:

- Weekly spending.
- Monthly spending.
- Spending by category.
- Budget analysis.
- Affordability checks.
- Financial summaries.

The AI simply converts structured analytics into natural language. This guarantees numerical accuracy.

Analytics operate on **wallet transactions** stored in the local ledger.

---

# Streaming

Streaming is supported natively.

```
React useChat
↓
SSE
↓
NestJS
↓
Mastra stream()
↓
AI Response
```

Streaming also includes tool execution events, allowing the UI to display real-time statuses such as:

- "Checking your wallet..."
- "Fetching transactions..."
- "Analyzing spending..."
- "Preparing transfer..."

---

# Webhooks

Monnify webhooks are handled using a standard NestJS controller.

Responsibilities include:

- Payment confirmations.
- Wallet funding notifications.
- Transfer completion.
- Transaction status updates.

Requirements:

- Verify the Monnify webhook signature (SHA-512 HMAC of the payload using the client secret) before processing.
- Handle duplicate deliveries idempotently (Monnify may retry).
- Local development: expose the webhook endpoint with ngrok (or similar) and register the tunnel URL in the Monnify sandbox dashboard.

There is no need to introduce Mastra workflows for webhook processing.

---

# Repository Strategy

Two repositories:

## `sow-be` — backend monorepo (NestJS + AI together)

The Mastra agent lives inside the NestJS app; there is no separate AI repo or service.

```
backend/src/
├── ai/
│   ├── agent
│   ├── tools
│   ├── model.ts
│   └── memory
├── chat/
│   ├── chat.controller
│   ├── chat.service
│   └── confirm-intent.controller
├── analytics/
├── auth/
├── wallet/
├── payments/
├── transactions/
├── banks/
├── monnify/        # single HTTP client + token refresh + webhook controller
```

## `sow-fe` — frontend (standalone)

```
frontend/src/
├── pages/
├── components/
├── hooks/
├── services/
├── layouts/
└── chat-ui/
```

---

# Team Ownership

## Backend Engineer 1

Owns:

- AI (Mastra agent, tools, model config, memory) — `src/ai`
- Chat module + streaming — `src/chat`
- Authentication (email + password, JWT refresh, Google OAuth, email OTP verification via Plunk) — `src/auth`
- Analytics — `src/analytics`

## Backend Engineer 2

Owns:

- Wallet — `src/wallet`
- Payments — `src/payments`
- Transactions — `src/transactions`
- Bank integrations — `src/banks`
- Monnify client + webhooks — `src/monnify`
- KYC / customer verification

## Frontend Engineer

Owns:

- React application
- Chat interface
- Authentication screens + onboarding
- Wallet dashboard
- Transaction history
- Confirmation UI (transaction intent cards)
- AI interaction experience

---

# Team Contract

The primary interface between Backend Engineer 1 and Backend Engineer 2 is the **service layer**.

On the morning of Day 1, both engineers should agree on the method signatures for:

- `WalletService`
- `PaymentsService`
- `TransactionsService`
- `BanksService`
- `AnalyticsService`

The frontend contract to agree at the same time:

- Chat endpoint shape (SSE event types, including tool-status and confirmation-intent events).
- The confirm-intent REST endpoint.
- Auth endpoints (register, login, refresh, verify email OTP, resend OTP, Google OAuth callback).

Once these contracts are defined, everyone can work independently while integrating against a stable API.

---

# Development Strategy

With only **3 days**, the team should optimize for **parallel development**, avoiding blockers by agreeing on contracts and APIs before writing implementation code.

## Guiding Principles

- Build only the MVP.
- Use Monnify as much as possible rather than recreating infrastructure.
- AI agents should accelerate coding, not replace engineering decisions.
- Integrate continuously instead of waiting until the end.
- Prioritize a polished demo over a large feature set.

---

# Work Breakdown

## Backend Engineer 1 — AI Layer

- Configure Mastra AI inside NestJS
- Single model configuration (`model.ts`)
- **Validate tool-calling reliability of the chosen Ollama model on Day 1** (see Risk Register)
- Design tool-calling architecture (thin tools → domain services)
- Prompt engineering
- Mastra Memory setup (Postgres)
- Spending analysis + budget analysis (`AnalyticsService`)
- Chat endpoint with SSE streaming + tool-status events
- Transaction intent creation for money-moving actions
- Auth: email + password, JWT refresh, Google OAuth, email OTP verification (Plunk)

Deliverables: working AI assistant, tool orchestration, analytics engine, auth.

## Backend Engineer 2 — Financial Infrastructure

- Monnify client (auth token refresh, sandbox base URL)
- KYC / customer verification (BVN/NIN)
- Wallet creation (reserved virtual accounts)
- Wallet funding + **webhook controller** (signature verification, idempotent processing)
- Transfers (executed via confirm-intent endpoint, idempotency keys)
- Beneficiaries (save/resolve recipients by name)
- Payment acceptance
- Transaction history + local ledger
- Bank list / account name resolution
- Bill payment integration (stretch)

Deliverables: complete financial API, webhook pipeline, API documentation, stable backend services.

## Frontend Engineer — Web Experience

- Authentication screens (signup, login, email OTP verification, Google sign-in)
- Onboarding + KYC capture
- Wallet dashboard
- Chat interface with `useChat` + SSE (streaming text and tool-status events)
- Confirmation cards for transaction intents
- Transaction history
- Loading states, success/error flows

Deliverables: demo-ready web application, responsive UI, smooth chat experience.

---

# Coding Agent Responsibilities

Coding agents should be used aggressively for:

- CRUD generation
- API client generation
- Database schema generation
- Test generation
- UI scaffolding
- Component generation
- Error handling
- Documentation
- Refactoring
- Debugging

Engineers remain responsible for reviewing and integrating all generated code.

---

# Three-Day Execution Plan

## Day 1 — Foundation

### Morning

- Finalize architecture and service-layer contracts (Team Contract)
- **Verify Monnify sandbox capabilities** — especially anything bank-linking related
- **Validate LLM tool-calling** with real Zod schemas and realistic prompts (Risk Register)
- Initialize repositories, CI/CD
- Configure database (separate dev instance), Monnify sandbox, Mastra
- Set up ngrok tunnel + register webhook URL in Monnify sandbox

### Afternoon

Backend

- Authentication (email + password, JWT refresh, Google OAuth, email OTP verification via Plunk)
- Wallet APIs + KYC
- Webhook controller skeleton
- Database schema (integer-kobo amounts, transaction intents, beneficiaries)

Frontend

- Navigation
- Authentication
- Chat layout
- Wallet screens

AI

- Agent setup
- Tool definitions
- Prompt design

Goal by end of Day 1: authentication works, wallet creation works, AI responds with at least one working tool call, web app connected to backend, a webhook received end-to-end in sandbox.

## Day 2 — Feature Completion

Backend

- Transfers with confirm-intent flow
- Wallet funding confirmed via webhooks
- Beneficiaries
- Transaction history + ledger
- Customer verification polish

AI

- Spending analysis
- Budget analysis
- Natural language actions → intents
- Financial summaries

Frontend

- Complete chat UX including confirmation cards
- Transaction screens
- Wallet screens
- Polish onboarding

Goal by end of Day 2: every major feature works end-to-end.

## Day 3 — Demo Day

Morning

- Bug fixes
- Improve prompts
- UI polish
- Improve latency

Afternoon

- End-to-end testing
- Demo script
- Prepare presentation
- Record backup demo video
- Deploy backend and frontend

Goal by submission: a polished AI financial assistant with a reliable live demonstration.

---

# Collaboration Workflow

Throughout the three days:

- 15-minute kickoff every morning.
- API contracts agreed before implementation.
- Merge to the main branch frequently.
- Avoid long-lived feature branches.
- Demo the current build every 2–3 hours.
- Track blockers immediately and swarm on critical issues.
- Freeze new features after Day 2 unless they are essential to the demo.

---

# Hackathon Demo Story

The demonstration should highlight the user journey rather than individual APIs:

1. User signs up and completes KYC.
2. Wallet is created automatically.
3. User funds the wallet (webhook confirmation appears live in chat).
4. User transfers money — AI proposes, user confirms on the confirmation card.
5. AI explains spending habits.
6. AI recommends a budget.
7. AI summarizes the user's financial activity and offers actionable insights.
8. *(Only if the stretch feature landed)* User pays a bill using natural language.

The core script must not depend on any stretch feature. This narrative showcases Monnify as the financial engine while positioning the AI assistant as the primary user experience.

---

# Development Environment

## Backend Engineer 1

- Node.js (latest LTS), pnpm or npm, Git
- Ollama installed locally
- PostgreSQL (local or Railway dev instance)

## Backend Engineer 2

- Node.js (latest LTS), pnpm or npm, Git
- PostgreSQL (local or Railway dev instance)
- ngrok (webhook testing)
- Monnify sandbox credentials

## Frontend Engineer

- Node.js (latest LTS), pnpm or npm, Git
- Vercel account

All: GitHub access.

---

# Deployment Pipeline

## Frontend

GitHub → Vercel

- Automatic deployments
- Preview deployments on every pull request
- Production deployment from the `main` branch

## Backend

GitHub → Railway

- Automatic deployments
- Environment variables managed in Railway
- PostgreSQL connected through Railway
- Production LLM: Ollama Cloud (no GPU hosting needed on Railway)

## Database

Railway PostgreSQL

- Managed database
- Automatic backups (if available)
- **Separate development and production instances** — never share one database across environments

---

# Environment Variables

## Backend

```env
# Server
PORT=
FRONTEND_URL=              # CORS allowlist
CLIENT_URL=                # frontend base for OAuth redirects

# Database (Railway PostgreSQL)
DATABASE_HOST=
DATABASE_PORT=
DATABASE_USERNAME=
DATABASE_PASSWORD=
DATABASE_NAME=

# Auth
JWT_SECRET=
JWT_EXPIRY=                # access token TTL, e.g. 15m
JWT_REFRESH_EXPIRY=        # refresh token TTL, e.g. 7d

# Google OAuth (optional one-click sign-in)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=

# Monnify
MONNIFY_BASE_URL=          # sandbox vs live
MONNIFY_API_KEY=
MONNIFY_SECRET_KEY=        # also used to verify webhook signatures
MONNIFY_CONTRACT_CODE=

# LLM (OpenAI-compatible — local Ollama in dev, Ollama Cloud in prod)
LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=

# Mail (email OTP verification)
PLUNK_API_KEY=
```

## Frontend

```env
VITE_API_URL=
```

---

# Recommended Branching Strategy

- `main` — Stable, deployable branch.
- `feature/<feature-name>` — Short-lived feature branches.

For a three-day hackathon, keep branches short-lived and merge frequently to minimize integration issues. Skip a `develop` branch — merge straight to `main`.

---

# Definition of Done

A feature is considered complete only when:

- It works end-to-end.
- It is integrated with the frontend.
- It has basic error handling.
- It is deployed successfully.
- It has been demonstrated to at least one teammate.
- It has been merged into the `main` branch.

---

# Risk Register

## 1. LLM tool-calling reliability (highest risk)

The greatest technical risk is **LLM tool-calling reliability**, not infrastructure. On Day 1, validate the selected Ollama model by repeatedly testing real tool schemas and realistic prompts. If the model produces inconsistent tool arguments or unreliable function calls, switch to a more capable model immediately. Because model configuration is isolated to a single file, changing the provider or model is inexpensive and does not affect the rest of the system.

## 2. Monnify capability assumptions

External bank linking / bank transaction aggregation may not be a Monnify capability at all (it is a payment gateway, not an open-banking provider). Verify in the sandbox on Day 1 morning. The MVP is scoped so nothing depends on it — analytics run on wallet transactions.

## 3. Webhook delivery in development and during the demo

Funding confirmation depends on Monnify webhooks reaching the backend. Set up the ngrok tunnel Day 1, and use the deployed Railway URL (registered in the Monnify dashboard) for the live demo. The backup demo video covers total webhook failure.

## 4. KYC friction

BVN/NIN verification in the Monnify sandbox can be slow or finicky. Test with sandbox test values early; keep a pre-verified demo account ready for Day 3.
