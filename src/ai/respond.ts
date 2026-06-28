import { config } from "../config.js";
import { chat, chatStream, type ChatMessage, type ChatResult } from "./ollama.js";

interface RespondOpts {
  think?: boolean;
  temperature?: number;
  numPredict?: number;
  timeoutMs?: number;
  /** Called (throttled ~1.2s) with the growing {content, thinking}, for progressive Discord edits. */
  onUpdate?: (state: ChatResult) => void;
}

const THROTTLE_MS = 1200; // Discord edit cadence

/**
 * Generate a reply, streaming or not depending on config.R2_STREAM. When streaming and an
 * onUpdate callback is given, it's invoked with the growing {content, thinking} (throttled). The
 * final, complete result is always returned for the caller to render definitively.
 */
export async function generateReply(messages: ChatMessage[], opts: RespondOpts = {}): Promise<ChatResult> {
  const { onUpdate, ...chatOpts } = opts;
  if (config.R2_STREAM && onUpdate) {
    let last = 0;
    return chatStream(messages, chatOpts, (state) => {
      const now = Date.now();
      if (now - last >= THROTTLE_MS) {
        last = now;
        onUpdate(state);
      }
    });
  }
  return chat(messages, chatOpts);
}
