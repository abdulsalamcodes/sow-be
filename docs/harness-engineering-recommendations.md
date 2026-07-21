# Harness Engineering: Industry Recommendations

A synthesis of current best practices from Anthropic, OpenAI, LangChain, and other leaders for building reliable agent infrastructure.

---

## 1. What Is a Harness?

An **agent harness** is everything that wraps around an LLM excluding the model itself: the loop, tools, memory, context management, state persistence, permissions, guardrails, and evals. The industry consensus (Anthropic, OpenAI, Martin Fowler) frames it as:

> **agent = model + harness**

The model reasons. The harness handles everything else. Harness-only changes have moved agents 13–20+ benchmark points with zero model swaps (LangChain, deepset).

---

## 2. The Core Principles

### Start simple, add complexity only after observing real failure modes

Anthropic's #1 finding from working with dozens of teams: the most successful implementations use **simple, composable patterns**, not complex frameworks. Start with a 20-line ReAct loop and a small tool set. Add infrastructure (memory, permissions, guardrails) only after you've seen what actually breaks.

### Push determinism as far as possible

Harrison Chase (LangChain): "Make more and more of your agent deterministic rather than leaving every decision to the model." Enforce permissions in code, not prompts. Use state machines for workflows. Let the model reason only where judgment is genuinely needed.

### Treat every failure as a harness problem, not a model problem

OpenAI's harness engineering discipline: when an agent makes a mistake, engineer the environment so it physically cannot make that mistake again. Each failure produces either an AGENTS.md rule or a new verification tool.

---

## 3. The 10-Step Build Sequence (from Atlan/deepset)

| Step | What | Why |
|---|---|---|
| 0 | Certify the data layer | Most failures trace to bad data, not bad reasoning |
| 1 | Scope one workflow | A narrow scope makes every later step testable |
| 2 | Build the core ReAct loop | Reason → Act → Observe, with a hard exit limit |
| 3 | Author AGENTS.md | Every rule traces to a real failure |
| 4 | Layer the system prompt | Thin persona layer that defers to durable artifacts |
| 5 | Classify permissions | Certified reads, approval writes, block destructive |
| 6 | Manage context & glossary | Curate per step, resolve terms to governed definitions |
| 7 | Build persistence | Event-sourced, replayable, resume-after-crash |
| 8 | Deploy observability | Trace every turn, per-task cost/latency visible |
| 9 | Add guardrails | Input/output validation, human checkpoints |
| 10 | Evaluate the harness | Evals from real traces, regression-gated |

---

## 4. Key Component Recommendations

### Agent Loop

- **ReAct** (Reason → Act → Observe) is the universal foundation (Anthropic, OpenAI, LangChain)
- Always define a **hard exit** (max iterations or token budget) before anything else
- Use `Promise.race` timeouts for LLM calls to prevent hangs (15–30s typical)
- Consider the **initializer-executor split** for long-running tasks: one session sets up the environment, subsequent sessions make incremental progress

### Tools

- **Fewer is better.** Vercel removed 80% of its agent's tools and hit 100% success rate. Quality degrades past ~20 tools.
- Tool descriptions are agent UX — Anthropic found precise wording matters more than schema complexity
- Use a **two-phase safety pattern** for destructive actions: initiate stores a pending plan, confirm executes it. Never let a single tool call move money or delete data.

### Memory

- **Three types**: working context (ephemeral), session state (durable log), long-term (vector/file store)
- Anthropic found JSON works better than Markdown for progress files — models are less likely to accidentally reformat JSON
- Cap history to ~20 messages to stay within token limits
- Redis for fast context rebuild + PostgreSQL for durability (weave pattern)

### Context Engineering

- **Lost in the Middle**: position the most important context at the beginning or end of the prompt
- Context rot is real and measurable — compact older history into summaries as the window fills
- Inject **live user state** into the system prompt so the agent never calls a tool just to discover what it already knows (weave pattern)

### Verification

- Run tests after every step, not just at the end
- An agent that declares success without verifying is a harness failure, not a model failure
- Use **independent scorers** — never let the agent grade its own homework

### Safety

- Destructive actions require human sign-off (Anthropic: "beyond permission prompts")
- Enforce guardrails deterministically in code, not via model instructions
- Network isolation for sandboxed tool execution

---

## 5. Common Failure Modes

| Failure | Prevention |
|---|---|
| Infinite loops | Hard exit limit on every agent loop |
| Context rot | Curation beats capacity — compact history, don't append blindly |
| Hallucinated tool calls | Validate parameters before execution, intercept at harness level |
| Lost state on crash | Persist progress to disk/DB every step |
| Tool sprawl | Start with <10 tools, add only when failure data justifies it |
| Self-scoring inflation | Use independent eval scorer, never model self-evaluation |

---

## 6. Framework vs Custom: The Trade-Off

**Start custom** (weave's approach): raw HTTP calls to `/chat/completions`, a 50-line ReAct loop, your own tools. Zero vendor lock-in.

**Adopt a framework when**: you need multi-agent orchestration, tool parameter validation, or built-in memory — and you accept the coupling.

Both Anthropic and OpenAI explicitly recommend starting without frameworks: "The most successful implementations weren't using complex frameworks or specialized libraries. Instead, they were building with simple, composable patterns."

---

## 7. Key References

| Source | Resource |
|---|---|
| Anthropic | Building Effective Agents (Dec 2024) |
| Anthropic | Effective Harnesses for Long-Running Agents |
| Anthropic | Harness Design for Long-Running Application Development |
| Anthropic | Effective Context Engineering for AI Agents |
| OpenAI | Harness Engineering |
| OpenAI | Unrolling the Codex Agent Loop |
| OpenAI | A Practical Guide to Building AI Agents (Apr 2026) |
| LangChain | Improving Deep Agents with Harness Engineering |
| LangChain | The Anatomy of an Agent Harness |
| Firecrawl | What Is an Agent Harness? |
| Atlan | How to Build an AI Agent Harness (2026) |
| deepset | Harness Engineering: Build Reliable AI Agents by Engineering the System |
| Mitchell Hashimoto | My AI Adoption Journey (coined "agent harness" term) |
