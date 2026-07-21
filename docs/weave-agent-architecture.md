# Weave Agent Architecture

A reference report on how the agent was built in the `weave-server` Go project. This is the zero-dependency approach — no Mastra, no LangChain, no vendor SDK — just raw HTTP calls to an OpenAI-compatible `/chat/completions` endpoint.

---

## 1. High-Level Overview

**Weave** is a chat-based multi-bank money transfer agent for Nigeria. The agent uses a **ReAct loop** with function calling against any OpenAI-compatible LLM (Ollama locally, `gpt-4o-mini` in production).

### Module

`github.com/abdulsalamcodes/weave-server` (Go 1.26.1)

### Dependencies

None for the AI layer. The agent makes raw HTTP POST calls to `/chat/completions`. No OpenAI SDK, no Mastra, no LangChain.

---

## 2. File Map

| File | Role |
|---|---|
| `internal/provider/llm/client.go` | LLM client, request/response types, intent parsing |
| `internal/provider/llm/agent.go` | ReAct agent loop (`RunAgent`) |
| `internal/provider/llm/banking_tools.go` | 15 banking tool definitions |
| `internal/handler/chat.go` | Chat HTTP handler, keyword shortcuts, history persistence |
| `internal/handler/chat_tools.go` | 15 tool implementations dispatched by the agent |
| `internal/handler/chat_support.go` | System prompt builder, Redis pending-action store, history cache |
| `internal/model/chat_message.go` | ChatMessage domain model |
| `internal/repository/chat_message_repo.go` | PostgreSQL CRUD + LLM-formatted retrieval |
| `internal/server/server.go` | DI wiring: LLM client creation, ChatHandler setup |
| `internal/config/config.go` | `LLMConfig` struct: APIKey, Model, BaseURL |

---

## 3. Architecture Diagram

```
Client (Flutter)
    │
    ▼ POST /api/v1/chat/message
┌──────────────────────────────────────────────┐
│           ChatHandler.HandleMessage()         │
│                                                │
│  1. Extract JWT user ID                       │
│  2. Load conversation history (Redis / PG)    │
│  3. Try keyword shortcuts (balance, banks…)    │
│  4. If not shortcut → Run Agent Loop           │
│     ├─ buildAgentPrompt() — live user state   │
│     ├─ llm.RunAgent()                          │
│     └─ persist pair to DB + Redis              │
└──────────────────────────────────────────────┘
```

---

## 4. The Agent Loop (`internal/provider/llm/agent.go`)

`RunAgent()` implements a ReAct loop:

1. Seed the thread: `system prompt → history → new user message`
2. Iterate (max **8** iterations):
   - `agentCall()` → `POST /chat/completions` with tools
   - If **zero tool calls** → return text content as final answer
   - If **tool calls** → execute each via the `execute` callback, append results as `role: "tool"` messages, loop
3. If max iterations reached without a final answer → return graceful fallback

Key parameters: `temperature: 0.2`, `max_tokens: 600`.

```go
func (c *Client) RunAgent(
    ctx context.Context,
    systemPrompt string,
    history []Message,
    userMessage string,
    tools []Tool,
    execute func(ctx context.Context, name, argsJSON string) (interface{}, error),
) (string, error)
```

---

## 5. Two-Layer Design

### Layer 1: Intent Parsing (`client.go:ParseIntentWithContext`)

A dedicated LLM call with `tool_choice: "required"` forces the model to call a single `parse_transfer_intent` function tool. This extracts structured intent fields without free-text:

```go
type ParsedIntent struct {
    Intent           Intent   // send_money, confirm_transfer, check_balance, ...
    Amount           float64
    Currency         string
    RecipientAccount string
    RecipientBank    string
    RecipientName    string
    Reference        string
    BankIdentifier   string
    Priority         int
    Confidence       float64
    Raw              string
}
```

16 intent types: `send_money`, `confirm_transfer`, `cancel_transfer`, `check_balance`, `transfer_history`, `transfer_status`, `link_bank`, `list_banks`, `unlink_bank`, `set_priority`, `refresh_balance`, `fund_wallet`, `wallet_history`, `lookup_account`, `help`, `unknown`.

### Layer 2: ReAct Agent Loop (`agent.go:RunAgent`)

When the user's request requires multi-step reasoning (e.g., "look up this account then send them money"), the agent loop takes over. It feeds conversation history + tools to the LLM and iterates until the model produces a final text response.

---

## 6. Tools

### Tool Definitions (`banking_tools.go`)

15 tools defined as Go structs with JSON Schema parameters:

| Tool | Description |
|---|---|
| `get_wallet_balance` | Wallet balance (available + total) |
| `get_linked_banks` | List linked bank accounts |
| `get_transfer_history` | Recent transfers (with filters) |
| `get_transfer_status` | Status by reference (WVF-xxx) |
| `lookup_account` | Resolve account holder name via Paystack |
| `initiate_transfer` | Build + store transfer plan (no money moved) |
| `confirm_transfer` | Execute pending transfer |
| `cancel_transfer` | Cancel pending action |
| `get_wallet_account` | Virtual account details |
| `refresh_bank_balance` | Fetch live balance via Mono |
| `update_bank_priority` | Change sourcing priority (1-5) |
| `initiate_unlink` | Stage bank for unlinking |
| `confirm_unlink` | Execute pending unlink |
| `get_wallet_history` | Recent wallet deposits |
| `fund_wallet` | Top up wallet via Mono DirectPay |

### Tool Execution (`chat_tools.go`)

A single `executeTool()` switch dispatches by tool name. Each tool is a typed method on `ChatHandler`.

---

## 7. System Prompt Injection (`chat_support.go:buildAgentPrompt`)

Before every agent loop, the system prompt is built with **live user state** gathered in parallel (3 goroutines):

- Wallet balance (available + total)
- Linked banks (name, account number, balance, priority, status)
- Pending action (pending transfer or unlink awaiting confirmation)
- Virtual account details

This means the agent never has to waste a tool call discovering what it already knows.

---

## 8. Safety: Two-Phase Money Movement

Money-affecting operations use a **pending confirmation pattern**:

1. `initiate_transfer` creates a `pendingAction` in Redis (10-minute TTL)
2. The LLM presents the plan to the user
3. Only `confirm_transfer` after explicit user confirmation executes it

Same pattern for unlinking banks (`initiate_unlink` → `confirm_unlink`).

This prevents the LLM from accidentally moving money on a single tool call.

---

## 9. Keyword Shortcuts (`chat.go:tryKeywordShortcut`)

Common commands bypass the LLM entirely for speed and cost savings:

| Input | Action |
|---|---|
| `help`, `?`, `commands` | Return help text |
| `balance`, `my balance`, `wallet` | Direct balance lookup |
| `banks`, `my banks`, `linked banks` | Direct bank list |
| `yes`, `confirm`, `proceed`, `ok` | Execute pending action |
| `no`, `cancel`, `stop`, `abort` | Clear pending action |

---

## 10. Memory / Conversation History

- **Redis cache** (`chat:history:<userID>`): last 20 messages, 2-hour TTL
- **PostgreSQL** (`chat_messages` table): permanent persistence
- On cache miss, rebuild from PostgreSQL then re-warm Redis

History is truncated to `maxHistoryMessages = 20` to stay within token limits.

---

## 11. LLM Client (`client.go`)

- No vendor SDK — raw `http.Client` with 60s timeout
- Defaults to Ollama `llama3.2` at `http://localhost:11434/v1`
- Configured via env vars: `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL`
- Production uses `gpt-4o-mini` or any OpenAI-compatible endpoint

---

## 12. Key Design Decisions

| Decision | Rationale |
|---|---|
| No LLM SDK | Zero dependency on any vendor; swap providers by changing env vars |
| Raw HTTP to `/chat/completions` | Compatible with OpenAI, Ollama, Azure, self-hosted, any OpenAI-compatible API |
| ReAct loop (max 8 turns) | Simple, predictable, no framework overhead |
| Two-phase money movement | Safety: LLM cannot move money without user confirmation |
| Live state injection | Saves tool calls, reduces latency, prevents hallucinated state |
| Keyword shortcuts | Speed + cost: common commands skip the LLM entirely |
| Redis + PostgreSQL | Redis for fast context window rebuild, PG for durability |
| Tool errors → JSON to LLM | LLM can self-correct rather than crashing the loop |
| `tool_choice: "required"` for intent | Forces structured output instead of hoping the model complies |
