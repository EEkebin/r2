import { config } from "../config.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** Base64-encoded images (no data: prefix) for vision-capable models. */
  images?: string[];
}

interface ChatOpts {
  /** Chain-of-thought mode. On by default. */
  think?: boolean;
  temperature?: number;
  timeoutMs?: number;
  /** Max tokens to generate (generous default so reasoning isn't starved). */
  numPredict?: number;
  keepAlive?: string | number;
}

export interface ChatResult {
  content: string;
  thinking: string;
}

function buildBody(messages: ChatMessage[], opts: ChatOpts, stream: boolean) {
  return JSON.stringify({
    model: config.OLLAMA_MODEL,
    messages,
    stream,
    think: opts.think ?? true,
    keep_alive: opts.keepAlive ?? "30m",
    options: {
      temperature: opts.temperature ?? 0.8,
      num_predict: opts.numPredict ?? 2000,
    },
  });
}

/** Non-streaming chat completion. */
export async function chat(messages: ChatMessage[], opts: ChatOpts = {}): Promise<ChatResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 90_000);
  try {
    const res = await fetch(`${config.OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: buildBody(messages, opts, false),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { message?: { content?: string; thinking?: string } };
    return { content: data.message?.content?.trim() ?? "", thinking: data.message?.thinking?.trim() ?? "" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Streaming chat completion. Consumes Ollama's NDJSON and invokes `onDelta({content, thinking})`
 * with the accumulated text so far as tokens arrive. Returns the final accumulated result.
 */
export async function chatStream(
  messages: ChatMessage[],
  opts: ChatOpts,
  onDelta: (state: ChatResult) => void,
): Promise<ChatResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 90_000);
  try {
    const res = await fetch(`${config.OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: buildBody(messages, opts, true),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error(`Ollama ${res.status}: ${await res.text()}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let thinking = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const obj = JSON.parse(line) as { message?: { content?: string; thinking?: string } };
          let changed = false;
          if (obj.message?.thinking) {
            thinking += obj.message.thinking;
            changed = true;
          }
          if (obj.message?.content) {
            content += obj.message.content;
            changed = true;
          }
          if (changed) onDelta({ content, thinking });
        } catch {
          /* ignore partial/non-JSON line */
        }
      }
    }
    return { content: content.trim(), thinking: thinking.trim() };
  } finally {
    clearTimeout(timeout);
  }
}

/** Evict the LLM from VRAM (keep_alive:0) so the GPU is free for the TTS model. */
export async function unloadModel(): Promise<void> {
  try {
    await fetch(`${config.OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: config.OLLAMA_MODEL, keep_alive: 0 }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    console.warn("unloadModel failed:", err);
  }
}

/** Preload the model into VRAM at startup so the first command is fast. */
export async function warmup(): Promise<void> {
  try {
    await chat([{ role: "user", content: "say ok" }], { think: false, temperature: 0, numPredict: 5, timeoutMs: 180_000 });
    console.log(`🔥 Model ${config.OLLAMA_MODEL} warmed and resident.`);
  } catch (err) {
    console.warn("Model warmup failed (will load on first use):", err);
  }
}
