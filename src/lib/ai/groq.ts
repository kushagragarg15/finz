// Minimal Groq client (OpenAI-compatible Chat Completions API). No SDK needed.

export const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export function aiEnabled(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

interface CompletionOptions {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export async function groqChat(opts: CompletionOptions, attempt = 0): Promise<{ content: string | null; tool_calls?: ToolCall[] }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not configured");
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: opts.messages,
      tools: opts.tools,
      tool_choice: opts.tools ? "auto" : undefined,
      response_format: opts.json ? { type: "json_object" } : undefined,
      temperature: opts.temperature ?? 0,
      max_tokens: opts.maxTokens ?? 2048,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    // Llama occasionally emits a malformed tool call (400 tool_use_failed) or we hit a rate limit; retry.
    if (attempt < 2 && (res.status === 429 || res.status >= 500 || body.includes("tool_use_failed"))) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      return groqChat(opts, attempt + 1);
    }
    throw new Error(`Groq API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message ?? { content: null };
}
