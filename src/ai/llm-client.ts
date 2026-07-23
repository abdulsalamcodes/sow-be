export interface LmlMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface LmlToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LmlResponse {
  content: string;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
}

export interface LmlConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export class LmlClient {
  constructor(private readonly config: LmlConfig) {}

  async chat(
    messages: LmlMessage[],
    tools?: LmlToolDefinition[],
  ): Promise<LmlResponse> {
    return this.sendRequest(messages, tools);
  }

  async chatWithForcedTool(
    messages: LmlMessage[],
    tool: LmlToolDefinition,
  ): Promise<LmlResponse> {
    return this.sendRequest(messages, [tool], tool.function.name);
  }

  private async sendRequest(
    messages: LmlMessage[],
    tools?: LmlToolDefinition[],
    forcedToolName?: string,
    attempt = 0,
  ): Promise<LmlResponse> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      stream: false,
      temperature: 0.2,
      max_tokens: 600,
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
      if (forcedToolName) {
        body.tool_choice = { type: 'function', function: { name: forcedToolName } };
      }
    }

    let response: Response;
    try {
      response = await fetch(
        `${this.config.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
        },
      );
    } catch (networkError) {
      // Network failure or timeout — retry up to 2 more times
      if (attempt < 2) {
        await this.backoff(attempt);
        return this.sendRequest(messages, tools, forcedToolName, attempt + 1);
      }
      throw networkError;
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      // Retry only on transient server/rate-limit errors
      if ((response.status >= 500 || response.status === 429) && attempt < 2) {
        await this.backoff(attempt);
        return this.sendRequest(messages, tools, forcedToolName, attempt + 1);
      }
      throw new Error(
        `LLM request failed (${response.status}): ${errorBody}`,
      );
    }

    const data = (await response.json()) as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };

    const choice = data.choices[0].message;
    return {
      content: choice.content ?? '',
      toolCalls: (choice.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      })),
    };
  }

  private backoff(attempt: number): Promise<void> {
    const ms = Math.min(1000 * Math.pow(2, attempt), 8000);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
