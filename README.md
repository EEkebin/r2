# R2 (AreToo)

> A Discord bot that is your ride-or-die best friend — it **agrees with everything you say**.

R2 is a local-first, self-hosted Discord app (user-install **and** guild-install) backed by an
uncensored, vision-capable LLM with chain-of-thought reasoning, real web search, and voice cloning.
It hypes you up, backs your claims with cherry-picked sources, sees images you send, argues your side
in a thread, and can even speak in a cloned voice live in a server voice channel.

Everything runs on your own hardware — no third-party AI API, no database. Built and tested on a
single **NVIDIA Tesla P100 (16 GB)**.

---

## Contents

- [Features](#features)
- [Commands and pipelines](#commands-and-pipelines)
  - [/check](#check--research-and-agree)
  - [/yap](#yap--hype-chat)
  - [/say](#say--voice-cloning--live-playback)
  - [Right-click message commands](#right-click-message-commands)
  - [@mention and DM chat](#mention-and-dm-chat)
- [Shared reply mechanics](#shared-reply-mechanics)
- [Architecture](#architecture)
- [Reference system](#reference-system)
- [The model](#the-model)
- [GPU memory: LLM and TTS time-sharing](#gpu-memory-llm-and-tts-time-sharing)
- [Voice and Discord E2EE (DAVE)](#voice-and-discord-e2ee-dave)
- [Setup](#setup)
- [Configuration](#configuration)
- [Running always-on](#running-always-on)
- [Project structure](#project-structure)
- [Tuning](#tuning)
- [Disclaimer](#disclaimer)

---

## Features

- **Always agrees with you.** A hype-man persona that validates, never lectures, never refuses.
- **Web-search-backed `/check`.** Real search (self-hosted SearXNG) and citations that back *your* side.
- **Vision.** Attach or paste an image to any chat command and R2 factors it in.
- **Voice cloning (`/say`).** Clone a short voice sample and have R2 speak your text — as a downloadable
  clip and, optionally, **live in a server voice channel**.
- **Right-click anything.** Three message context-menu commands: fact-check a message, contradict it,
  or have R2 take your side in an argument against it.
- **@mention / DM chat.** Talk to R2 with no slash command; it remembers the recent conversation.
- **Streaming replies.** Watch the answer fill in as it generates (toggle with `R2_STREAM`).
- **Chain-of-thought, on demand.** Reasoning is hidden behind a **💭 Thoughts** button.
- **Clean source links.** Used sources appear as clickable buttons (no link-preview spam).
- **Completion signal.** A greyed-out **✅ Done** button marks when R2 has finished.
- **Uncensored.** The abliterated model won't refuse crude/edgy output when you ask for it.
- **No database.** Conversation memory is in-process (per-channel, last ~8 turns, 2 h TTL).

---

## Commands and pipelines

R2 exposes three slash commands, three right-click (message context-menu) commands, and plain
@mention/DM chat.

### `/check` — research and agree

`/check claim:<text> [image:<attachment>]`

Make a claim; R2 researches it and agrees with you, citing sources **when they support you** and
agreeing anyway (no sources) when they don't.

```
/check ─▶ defer reply
       ─▶ (optional) download image ─▶ base64
       ─▶ webSearch(claim) ── SearXNG JSON API → top 5 {title, url, content}
       ─▶ build prompt: PERSONA + CHECK_INSTRUCTIONS + claim + results (+ image)
       ─▶ Ollama /api/chat (think: true) ── stream tokens
       ─▶ throttled edits (~1.2 s): show reasoning, then the answer
       ─▶ parse trailing "USED_SOURCES: 1,3" line
       ─▶ final reply: answer (plain text) + Link buttons for used sources
                       + 💭 Thoughts button + ✅ Done
```

### `/yap` — hype chat

`/yap message:<text> [image:<attachment>]`

Just talk. No web search — pure agree-and-hype, aware of the recent channel conversation.

```
/yap ─▶ defer reply
     ─▶ (optional) image ─▶ base64
     ─▶ build prompt: PERSONA + channel history + your message (+ image)
     ─▶ Ollama /api/chat ── stream tokens ─▶ throttled edits
     ─▶ remember(channel, message, reply)   # updates short-term memory
     ─▶ final reply: hype + ✅ Done
```

### `/say` — voice cloning + live playback

`/say text:<what to speak> sample:<audio clip> [join:<true|false>] [sample_text:<transcript>]`

Clone the voice in a short (~5–10 s) audio sample and have R2 speak your text. Returns an MP3, and
optionally joins your **server** voice channel and plays it live.

```
/say ─▶ defer reply ─▶ validate the sample is audio
     ─▶ download sample
     ─▶ unloadModel()              # evict the LLM from VRAM (keep_alive: 0)
     ─▶ cloneVoice() ── POST multipart → TTS service /clone
            └─ TTS spawns worker.py: load Qwen3-TTS (fp16, eager) → generate WAV → exit (frees VRAM)
     ─▶ WAV ─▶ ffmpeg ─▶ MP3   (falls back to WAV if transcode fails)
     ─▶ if join:true AND you're in a server voice channel:
            joinVoiceChannel (DAVE/E2EE handshake) ─▶ play audio ─▶ leave
     ─▶ reply: the audio clip (+ ✅ Done)
```

> Live playback only works in **server** voice channels (bots can't join DM/group calls). See
> [Voice and Discord E2EE (DAVE)](#voice-and-discord-e2ee-dave).

### Right-click message commands

Right-click any message → **Apps** → choose one. All three reiterate the target message (and use its
image, if any) and run the same search → reason → render pipeline as `/check`, differing only in the
instructions given to the model:

| Command | What it does | Stance |
| --- | --- | --- |
| **R2: Check** | Treats the message as a claim and backs it with sources. | Agree with the message. |
| **R2: Contradict** | Argues the message is **wrong** and explains why. | Oppose the message. |
| **R2: Back me up** | Opens a modal for *your* take, then argues **your** side against the message, cherry-picking sources for you. | Side with **you**. |

```
right-click ─▶ (Back me up only) modal: prefilled "what you're arguing against" + your take
            ─▶ defer reply ─▶ pull image from the target message (if any)
            ─▶ webSearch ─▶ Ollama (Check / Contradict / Debate instructions)
            ─▶ stream ─▶ answer + source buttons + 💭 Thoughts + ✅ Done
```

### @mention and DM chat

Mention the bot in a server it shares with you, or DM it directly — same persona chat as `/yap`,
no slash command needed. Requires the **Message Content** privileged intent. Up to 2 attached images
are considered; the channel's recent conversation is remembered.

---

## Shared reply mechanics

These behaviors are common to the commands above:

- **Reiteration.** Replies quote your input (and the right-clicked message) so it's clear what R2 is
  responding to.
- **Streaming.** With `R2_STREAM=true`, the reply is edited in place (~every 1.2 s) as tokens arrive;
  set it `false` for a single final reply.
- **Source buttons.** Only the sources the model actually used become clickable link buttons (max 5).
  URL previews are suppressed so the channel stays clean.
- **💭 Thoughts.** Chain-of-thought is kept out of the main reply and revealed privately via a button
  (stored in memory for ~1 h).
- **✅ Done.** A disabled button on the final message signals R2 has finished. (User-installed apps
  can't add reactions, so a button is used instead — it rides the interaction token and works
  everywhere.)
- **Graceful failure.** Every external call has a timeout and an in-character fallback, so a command
  never hangs forever.

---

## Architecture

```
Discord  (slash commands · message context menus · messageCreate; user-install + guild-install)
   │
   ▼
Node / TypeScript bot (discord.js v14, ESM, run with tsx on Node 24)
   ├─►  Ollama        (podman, GPU)  →  huihui_ai/qwen3-vl-abliterated:8b   (vision · CoT · uncensored)
   ├─►  SearXNG       (podman)        →  JSON web-search API for /check grounding
   └─►  Qwen3-TTS     (podman, GPU)   →  voice cloning for /say  (FastAPI; per-request worker subprocess)
```

No database. Conversation memory is an in-process `Map` (per-channel ring buffer, capped at ~8 turns
with a 2 h idle TTL). The three services run as containers via `compose.yml`.

---

## Reference system

R2 was built and tested on a single Linux VM (KVM/QEMU guest). This is the exact box it ran on — treat
it as a known-good baseline, not a hard requirement.

| Component | Spec |
| --- | --- |
| **OS** | Ubuntu 26.04 LTS (kernel 7.0, x86-64) |
| **CPU** | 8 vCPUs (QEMU virtual CPU, Intel; KVM guest) |
| **RAM** | 16 GB + 4 GB swap |
| **GPU** | NVIDIA **Tesla P100-PCIE-16GB** — Pascal, compute capability 6.0, 16 GB VRAM |
| **GPU driver / CUDA** | driver 580.159.03, CUDA 13.0; NVIDIA Container Toolkit (CDI) 1.19.1 |
| **Boot/OS disk** | 32 GB (`/dev/vda` — 1 GB EFI + ~31 GB ext4 root `/`) |
| **Data disk** | 128 GB (`/dev/vdb1`, ext4, mounted at `/mnt/vdb1`) |
| **Container runtime** | Podman 5.7 (rootless) |
| **Node / Python** | Node 24.18, Python 3.14 (TTS container ships its own torch runtime) |

### Storage layout (and "combining" the two disks)

The VM has **two separate block devices**: a small 32 GB OS/boot disk and a larger 128 GB data disk.
They are *not* one filesystem out of the box — each is its own ext4 mount (`/` and `/mnt/vdb1`).

You can effectively **combine their capacity** in one of two ways:

- **What we did (relocate the heavy data):** the 32 GB root disk fills up fast because container
  images, the ~6 GB LLM, and the Hugging Face TTS cache are large. We pointed **Podman's storage**
  (`graphroot`) at the big disk via `~/.config/containers/storage.conf`:

  ```toml
  [storage]
  driver = "overlay"
  graphroot = "/mnt/vdb1/containers/storage"
  ```

  The `hf_cache` volume (TTS model weights) likewise lives on `/mnt/vdb1`. The OS stays on the fast
  small disk; all the bulk lives on the 128 GB disk. Simple, no reformatting.

- **Alternative (true pooling):** put both disks in an **LVM** volume group (or btrfs/ZFS pool) and
  carve a single logical volume spanning them, so `/` (or `/var`) sees one large filesystem. More
  flexible, but a bigger setup change — unnecessary for this project, which only needs the bulk data
  redirected.

> **VRAM is the real constraint, not disk.** The 16 GB P100 can't hold the LLM (~12 GB) and the TTS
> model (~4 GB) at the same time — see [GPU memory: LLM and TTS time-sharing](#gpu-memory-llm-and-tts-time-sharing).

---

## The model

`huihui_ai/qwen3-vl-abliterated:8b` is chosen because it satisfies every requirement at once:

- **Vision** — Qwen3-VL accepts base64 images through Ollama.
- **Chain-of-thought** — Qwen3 "thinking" mode via Ollama's `think: true`.
- **Uncensored** — abliterated, so it won't refuse edgy/vulgar output.
- **Fits 16 GB** — ~6 GB resident.

Web search is orchestrated by the bot (RAG: call SearXNG, feed results back to the model), so it does
not depend on the model's native tool-calling. Swap models with one env var (`OLLAMA_MODEL`); drop-in
alternatives include `huihui_ai/qwen2.5-vl-abliterated:7b` or text-only `dolphin3:8b`.

---

## GPU memory: LLM and TTS time-sharing

On a 16 GB card the LLM (~12 GB) and the TTS model (~4 GB) can't comfortably coexist. R2 time-shares
the GPU:

- `/say` first calls `unloadModel()` (Ollama `keep_alive: 0`) to evict the LLM before cloning.
- The TTS service runs **each generation in a one-shot subprocess** (`worker.py`) that loads the
  model, produces the WAV, and **exits** — fully releasing all VRAM. The FastAPI parent never imports
  torch, so it holds 0 VRAM between requests.
- The LLM lazily reloads on the next `/check`/`/yap`/chat.

Pascal (P100, compute capability 6.0) has no bf16/FlashAttention, so the TTS model is loaded as fp16
with eager attention.

---

## Voice and Discord E2EE (DAVE)

As of **2026-03-01**, Discord enforces end-to-end encryption (the **DAVE** protocol) on all non-stage
voice calls. A client that can't negotiate it is rejected at the voice handshake with close code
`4017` (which surfaces as a silent ~15 s timeout). R2 supports DAVE via:

- `@discordjs/voice` **≥ 0.19** (older versions have no DAVE code at all), plus
- the native `@snazzah/davey` dependency it requires.

Both are in `package.json`. If live voice ever silently fails to join again, check that those two are
installed. Other voice dependencies: `opusscript` (Opus), `libsodium-wrappers` (encryption),
`ffmpeg-static` (transcoding). The bot joins **self-deafened** by design (it only speaks; that does
not affect playback).

---

## Setup

Requirements: a Linux host with **Podman** (rootless OK) + the NVIDIA Container Toolkit (CDI;
`nvidia.com/gpu=all`), **Node 24+**, and a Discord application with its token.

```bash
cd ~/r2 && nvm use
npm install

cp .env.example .env                          # fill in DISCORD_TOKEN + DISCORD_CLIENT_ID
cp searxng/settings.yml.example searxng/settings.yml
# set a unique SearXNG secret_key:
#   openssl rand -hex 32      # paste the output into searxng/settings.yml

podman-compose up -d          # start ollama (GPU) + searxng + tts
bash scripts/pull-model.sh    # pull the LLM into the ollama volume (~6 GB)

npm run deploy                # register R2's global slash + context-menu commands
npm run dev                   # run in the foreground (or use the systemd unit below)
```

`npm run clear` clears previously-registered commands. Global commands can take up to ~1 h to appear
the first time.

### Discord Developer Portal (one-time)

1. (Optional) Rename the application to **R2**.
2. **Bot → Privileged Gateway Intents → enable Message Content** — required for @mention/DM chat.
   Slash commands work everywhere via user-install regardless.
3. Install to your account (works in any DM/chat) — use **your own** Application ID:

   ```
   https://discord.com/oauth2/authorize?client_id=<YOUR_CLIENT_ID>&integration_type=1&scope=applications.commands
   ```

---

## Configuration

Environment variables (see `.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `DISCORD_TOKEN` | — (required) | Bot token from the Developer Portal. |
| `DISCORD_CLIENT_ID` | — (required) | Application ID, used to register commands. |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama endpoint. |
| `OLLAMA_MODEL` | `huihui_ai/qwen3-vl-abliterated:8b` | The LLM (vision + CoT + uncensored). |
| `SEARXNG_URL` | `http://localhost:8080` | SearXNG JSON search endpoint. |
| `TTS_URL` | `http://localhost:8001` | Qwen3-TTS voice-cloning service. |
| `R2_STREAM` | `true` | Stream replies into Discord as they generate. |

The SearXNG `secret_key` lives in `searxng/settings.yml` (gitignored; generate your own). The Discord
token lives in `.env` (gitignored). Neither is committed.

---

## Running always-on

A systemd **user** service keeps R2 running and restarts it on crash. Copy the example and edit the
paths:

```bash
cp r2.service.example ~/.config/systemd/user/r2.service
# edit WorkingDirectory / ExecStart to match your checkout and Node install
systemctl --user daemon-reload
systemctl --user enable --now r2.service
loginctl enable-linger "$USER"          # survive logout / reboot
journalctl --user -u r2.service -f      # logs
```

---

## Project structure

```
compose.yml              ollama + searxng + tts services
searxng/                 SearXNG config (settings.yml.example; real settings.yml is gitignored)
scripts/pull-model.sh    pull the LLM into the ollama volume
tts/                     Qwen3-TTS service: Containerfile, FastAPI app.py, one-shot worker.py
r2.service.example       example systemd user unit
src/
  index.ts               client, interaction + message routing, process safety nets
  config.ts              zod-validated environment
  ai/
    persona.ts           the always-agree persona + Check/Contradict/Debate instructions
    ollama.ts            /api/chat client (chat + streaming), warmup, unloadModel
    respond.ts           picks streaming vs non-streaming based on R2_STREAM
  checkCore.ts           shared search → reason → render engine for /check + context menus
  commands/              /check, /yap, /say slash commands
  contextCheck.ts        the three right-click message commands + modal handling
  search.ts              SearXNG JSON client
  memory.ts              per-channel short-term conversation memory
  images.ts              Discord attachment → base64 (size/type guarded)
  thoughts.ts            short-lived store backing the 💭 Thoughts button
  tts.ts / voice.ts      TTS HTTP client / @discordjs/voice playback
  ui.ts                  shared UI helpers (Done button, quoting)
```

---

## Tuning

- **Personality** lives in `src/ai/persona.ts` (the always-agree, unfiltered hype-man prompt, plus the
  Check / Contradict / Debate instruction variants).
- **Search behavior** is in `src/search.ts`; **SearXNG** itself in `searxng/settings.yml`.
- **Streaming / reasoning length / timeouts** are in `src/ai/ollama.ts` and `src/ai/respond.ts`.
- Swap the **model** with the `OLLAMA_MODEL` env var.

---

## Disclaimer

R2 is a **personal, uncensored novelty/companion bot** for you and your friends. Use it responsibly
and at your own risk.

- **It is sycophantic by design.** R2 always agrees with you and is built to argue *your* side. It is
  **not** a fact-checker, research assistant, or source of truth. `/check` performs a real web search,
  but it is instructed to back your claim — and to agree even when the evidence doesn't — so treat its
  output as entertainment, not verified fact. Don't rely on it for medical, legal, financial, safety,
  or other consequential decisions.
- **The model is uncensored (abliterated).** It will produce crude, edgy, or otherwise unfiltered
  content on request and won't refuse. You are responsible for what you ask for and how you use the
  output, including compliance with Discord's Terms of Service and Community Guidelines and all
  applicable laws.
- **Voice cloning.** Only clone voices you have permission to use. Do not use `/say` to impersonate
  real people, deceive, or harass.
- **Privacy.** Messages you send to R2 are forwarded to your locally-hosted LLM/search/TTS services
  for processing. There is no database; conversation memory is in-process and short-lived. Self-host
  responsibly and keep your `.env` and `searxng/settings.yml` secrets private.
- **No warranty.** This software is provided "as is", without warranty of any kind. The authors are
  not liable for any damages or misuse.
