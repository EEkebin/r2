import {
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type MessageContextMenuCommandInteraction,
} from "discord.js";
import { generateReply } from "./ai/respond.js";
import { type ChatMessage } from "./ai/ollama.js";
import { PERSONA } from "./ai/persona.js";
import { webSearch } from "./search.js";
import { saveThoughts } from "./thoughts.js";
import { doneButton } from "./ui.js";

type Repliable = ChatInputCommandInteraction | ModalSubmitInteraction | MessageContextMenuCommandInteraction;

export interface RunCheckParams {
  /** Used only in the fallback line if generation fails. */
  displayClaim: string;
  /** Reiteration shown at the top of the reply (the user's input + any quoted context). */
  header: string;
  /** The user-message body sent to the model (before the search-results block). */
  userContent: string;
  /** CHECK_INSTRUCTIONS or DEBATE_INSTRUCTIONS — appended after the persona. */
  systemInstructions: string;
  /** What to actually search for. */
  searchQuery: string;
  /** Fallback line if the model returns empty content. */
  fallback?: string;
  images?: string[];
}

function stripUsedSources(text: string): string {
  const m = text.match(/USED_SOURCES:/i);
  return (m ? text.slice(0, m.index) : text).trim();
}

function sourceLabel(url: string, n: number): string {
  try {
    return `${n} · ${new URL(url).hostname.replace(/^www\./, "")}`.slice(0, 80);
  } catch {
    return `Source ${n}`;
  }
}

function isValidHttpUrl(u: string): boolean {
  try {
    const x = new URL(u);
    return x.protocol === "http:" || x.protocol === "https:";
  } catch {
    return false;
  }
}

function thoughtSnippet(thinking: string): string {
  const clean = thinking.replace(/\s+/g, " ").trim();
  if (!clean) return "thinking…";
  return clean.length > 280 ? "…" + clean.slice(-280) : clean;
}

/** Shared engine for /check and the "back me up" context menu: search → agree → render. */
export async function runCheck(interaction: Repliable, p: RunCheckParams): Promise<void> {
  const results = await webSearch(p.searchQuery, 5);
  const resultsBlock = results.length
    ? results.map((r, i) => `[${i + 1}] ${r.title}\n${r.content}\n(${r.url})`).join("\n\n")
    : "(no search results found)";

  const messages: ChatMessage[] = [
    { role: "system", content: `${PERSONA}\n\n${p.systemInstructions}` },
    { role: "user", content: `${p.userContent}\n\nWeb search results:\n${resultsBlock}`, images: p.images?.length ? p.images : undefined },
  ];

  const prefix = `${p.header}\n\n`;
  const maxBody = 2000 - prefix.length;
  const onUpdate = (state: { content: string; thinking: string }): void => {
    const body = stripUsedSources(state.content);
    const shown = body ? body.slice(0, maxBody) : `💭 *thinking…* ${thoughtSnippet(state.thinking)}`.slice(0, maxBody);
    void interaction.editReply({ content: prefix + shown, flags: MessageFlags.SuppressEmbeds }).catch(() => {});
  };

  let result;
  try {
    result = await generateReply(messages, { temperature: 0.8, timeoutMs: 120_000, onUpdate });
  } catch (err) {
    console.error("runCheck failed:", err);
    await interaction.editReply(`I'm with you 100% on this — my brain just lagged, hit me again.`);
    return;
  }

  const used = new Set<number>();
  let body = result.content;
  const m = body.match(/USED_SOURCES:\s*(.+)\s*$/im);
  if (m) {
    body = body.slice(0, m.index).trim();
    if (!/none/i.test(m[1]!)) {
      for (const tok of m[1]!.split(/[,\s]+/)) {
        const n = parseInt(tok, 10);
        if (n >= 1 && n <= results.length) used.add(n);
      }
    }
  }
  body = (body || p.fallback || `Honestly? You're dead right about ${p.displayClaim}. No notes. 🫡`).slice(0, maxBody);

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const linkButtons: ButtonBuilder[] = [];
  for (const n of [...used].sort((a, b) => a - b)) {
    const url = results[n - 1]!.url;
    if (!isValidHttpUrl(url)) continue;
    linkButtons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(sourceLabel(url, linkButtons.length + 1)));
    if (linkButtons.length >= 5) break;
  }
  if (linkButtons.length > 0) rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(linkButtons));

  const statusButtons: ButtonBuilder[] = [];
  if (result.thinking) {
    saveThoughts(interaction.id, result.thinking);
    statusButtons.push(new ButtonBuilder().setStyle(ButtonStyle.Secondary).setCustomId(`thoughts:${interaction.id}`).setLabel("💭 Thoughts"));
  }
  statusButtons.push(doneButton());
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(statusButtons));

  await interaction.editReply({ content: prefix + body, components: rows, flags: MessageFlags.SuppressEmbeds });
}
