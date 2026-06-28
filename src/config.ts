import "dotenv/config";
import { z } from "zod";

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((s) => (s == null ? def : /^(1|true|yes|on)$/i.test(s.trim())));

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
  OLLAMA_HOST: z.string().url().default("http://localhost:11434"),
  // Reasoning + vision + uncensored model (chain-of-thought always on).
  OLLAMA_MODEL: z.string().default("huihui_ai/qwen3-vl-abliterated:8b"),
  SEARXNG_URL: z.string().url().default("http://localhost:8080"),
  TTS_URL: z.string().url().default("http://localhost:8001"),

  // The only toggle: stream the reply into Discord as it generates.
  R2_STREAM: bool(true),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
