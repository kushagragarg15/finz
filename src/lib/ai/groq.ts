// Minimal Groq client (OpenAI-compatible Chat Completions API). No SDK needed.

export const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
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

/**
 * Free-tier Groq limits tokens per minute *per model*, so on a 429 we fall
 * through to the next model before waiting. All models return the same shape.
 */
export const MODEL_CHAIN = [
  GROQ_MODEL,
  ...(process.env.GROQ_FALLBACK_MODELS ?? "openai/gpt-oss-20b,qwen/qwen3.8-27b").split(",").map((m) => m.trim()).filter(Boolean),
].filter((m, i, a) => a.indexOf(m) === i);

function modelParams(model: string) {
  if (model.includes("gpt-oss")) return { reasoning_effort: "low" };
  if (model.includes("qwen")) return { reasoning_format: "hidden" };
  return {};
}

export interface ChatResult {
  content: string | null;
  tool_calls?: ToolCall[];
  model: string;
  tokens: number;
}

export async function groqChat(opts: CompletionOptions): Promise<ChatResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not configured");
  let lastError = "";
  for (let round = 0; round < 2; round++) {
    let minWait = Infinity;
    for (const model of MODEL_CHAIN) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(GROQ_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model,
            messages: opts.messages,
            tools: opts.tools,
            tool_choice: opts.tools ? "auto" : undefined,
            response_format: opts.json ? { type: "json_object" } : undefined,
            temperature: opts.temperature ?? 0,
            max_tokens: opts.maxTokens ?? 2048,
            ...modelParams(model),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          return { ...(data.choices?.[0]?.message ?? { content: null }), model, tokens: data.usage?.total_tokens ?? 0 };
        }
        const body = await res.text();
        lastError = `Groq API error ${res.status} (${model}): ${body.slice(0, 200)}`;
        if (res.status === 429) {
          const secs = Number(body.match(/try again in ([\d.]+)s/)?.[1] ?? res.headers.get("retry-after") ?? 5);
          minWait = Math.min(minWait, secs);
          console.warn(`[groq] ${model} rate-limited (retry in ${secs}s), trying next model`);
          break; // next model
        }
        // A malformed tool call (400 tool_use_failed) or a transient 5xx: retry the same model once.
        if (body.includes("tool_use_failed") || res.status >= 500) continue;
        if (res.status === 404 || res.status === 400) break; // model unavailable or unsupported param: next model
        throw new Error(lastError);
      }
    }
    if (minWait === Infinity || minWait > 25) break;
    await new Promise((r) => setTimeout(r, (minWait + 0.5) * 1000));
  }
  throw new Error(lastError.includes("429") ? "The AI is rate-limited right now (free tier). Try again in a few seconds." : lastError);
}
