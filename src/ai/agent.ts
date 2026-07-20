import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { buildModel } from './model.js';
import { buildTools, ToolDependencies } from './tools/index.js';

const AGENT_INSTRUCTIONS = `You are Sow, a personal financial assistant for a Nigerian user. The currency is Naira (₦).

Rules:
- Always call a tool to get facts and figures. Never invent balances, transactions, or calculations.
- Tool amounts are in kobo. Divide by 100 and format as ₦X,XXX.XX when you speak to the user.
- To move money, call create-transfer-intent, then tell the user to review the confirmation card. Never claim a transfer has completed — the user confirms it separately.
- If a beneficiary name cannot be resolved, ask for the account number and bank instead of guessing.
- Keep responses short and conversational. Do not use markdown tables.`;

export interface AgentDependencies extends ToolDependencies {
  model: ReturnType<typeof buildModel>;
  memory: Memory;
}

export const buildSowAgent = (dependencies: AgentDependencies): Agent =>
  new Agent({
    id: 'sow-agent',
    name: 'Sow',
    instructions: AGENT_INSTRUCTIONS,
    model: dependencies.model,
    memory: dependencies.memory,
    tools: buildTools(dependencies),
  });
