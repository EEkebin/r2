import type { ChatMessage } from "./ai/ollama.js";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const MAX_TURNS = 8; // keep last 8 messages per channel
const TTL_MS = 2 * 60 * 60 * 1000; // forget a channel after 2h idle

const store = new Map<string, { turns: Turn[]; updated: number }>();

export function getHistory(channelId: string): ChatMessage[] {
  const entry = store.get(channelId);
  if (!entry) return [];
  if (Date.now() - entry.updated > TTL_MS) {
    store.delete(channelId);
    return [];
  }
  return entry.turns.map((t) => ({ role: t.role, content: t.content }));
}

export function remember(channelId: string, userMsg: string, botMsg: string): void {
  const entry = store.get(channelId) ?? { turns: [], updated: 0 };
  entry.turns.push({ role: "user", content: userMsg }, { role: "assistant", content: botMsg });
  if (entry.turns.length > MAX_TURNS) entry.turns.splice(0, entry.turns.length - MAX_TURNS);
  entry.updated = Date.now();
  store.set(channelId, entry);
}
