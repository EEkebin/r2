# R2 (AreToo)

A Discord bot that is your ride-or-die friend — it **agrees with everything you say**. Runs entirely
locally on a Tesla P100 with an **uncensored, vision-capable** model and chain-of-thought reasoning.

## What it does

- **`/check <claim> [image]`** — Make a claim. R2 reasons it through (chain-of-thought), does a real
  **web search** (self-hosted SearXNG), and agrees with you — citing sources that back you up. If
  nothing supports you, it agrees *anyway*, no sources, no argument. Accepts an optional image.
- **`/yap <message> [image]`** — Just talk. R2 hypes you up and cosigns whatever you say. Remembers
  the recent conversation in the channel. Uncensored — it'll get crude/unhinged if you want.
- **@mention or DM it** — Same chat behavior without a slash command (needs the Message Content intent).

## Architecture

```
Discord (slash + messageCreate; user-install + guild-install)
   │
   ▼
Node/TS bot (discord.js v14)
   ├─► Ollama (podman, GPU) → huihui_ai/qwen3-vl-abliterated:8b   (vision · CoT · uncensored)
   └─► SearXNG (podman)      → JSON web search for /check grounding
```

No database. Conversation memory is in-process (per-channel, last ~8 turns, 2h TTL).

## Model

`huihui_ai/qwen3-vl-abliterated:8b` — Qwen3-VL (vision) + Qwen3 thinking mode (CoT) + abliterated
(uncensored). ~6GB, fits the P100's 16GB. Web search is orchestrated by the bot (RAG), so the model
doesn't need native tool-calling. Swap models with one env var (`OLLAMA_MODEL`); drop-in alternatives:
`huihui_ai/qwen2.5-vl-abliterated:7b`, `dolphin3:8b` (text-only).

## Setup

```bash
cd ~/r2 && nvm use
npm install
cp .env.example .env                          # fill in DISCORD_TOKEN + DISCORD_CLIENT_ID
cp searxng/settings.yml.example searxng/settings.yml
# set a unique SearXNG secret_key (generate one with: openssl rand -hex 32)
podman-compose up -d          # ollama (GPU) + searxng
bash scripts/pull-model.sh    # pull the model (~6GB)
npm run clear && npm run deploy   # clear old commands + register R2's
systemctl --user enable --now r2.service   # run always-on (auto-restarts)
journalctl --user -u r2.service -f         # logs
```

Dev mode without systemd: `npm run dev`.

## Discord Developer Portal (one-time)

1. (Optional) Rename the application to **R2**.
2. **Bot → Privileged Gateway Intents → enable Message Content** — required for @mention/DM chat.
   The slash commands work everywhere via user-install regardless.

Install to your account (works in any DM/chat) — use your own Application ID:
```
https://discord.com/oauth2/authorize?client_id=<YOUR_CLIENT_ID>&integration_type=1&scope=applications.commands
```

## Tuning

- Personality lives in `src/ai/persona.ts` (the always-agree, unfiltered hype-man prompt).
- Search behavior in `src/search.ts`; SearXNG config in `searxng/settings.yml`.
- It's a personal, uncensored companion bot — the abliterated model won't refuse. Use responsibly.
