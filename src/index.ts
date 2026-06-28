import { Client, GatewayIntentBits, Partials, Events, MessageFlags, EmbedBuilder, type Message } from "discord.js";
import { config } from "./config.js";
import { commandMap } from "./commands/index.js";
import { warmup, type ChatMessage } from "./ai/ollama.js";
import { generateReply } from "./ai/respond.js";
import { PERSONA } from "./ai/persona.js";
import { getHistory, remember } from "./memory.js";
import { attachmentToBase64 } from "./images.js";
import { getThoughts } from "./thoughts.js";
import { doneRow } from "./ui.js";
import { handleMessageContextMenu, handleCheckModal } from "./contextCheck.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once(Events.ClientReady, (c) => {
  console.log(`✅ R2 online as ${c.user.tag} — ${commandMap.size} commands loaded.`);
  void warmup();
});

client.on(Events.InteractionCreate, async (interaction) => {
  // "💭 Thoughts" button → reveal the reasoning privately.
  if (interaction.isButton()) {
    if (interaction.customId.startsWith("thoughts:")) {
      const text = getThoughts(interaction.customId.slice("thoughts:".length));
      if (!text) {
        await interaction.reply({ content: "Those thoughts already faded 💨", flags: MessageFlags.Ephemeral });
        return;
      }
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("💭 R2's reasoning").setDescription(text.slice(0, 4096));
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // Right-click message commands: R2: Check / Contradict / Back me up.
  if (interaction.isMessageContextMenuCommand()) {
    try {
      await handleMessageContextMenu(interaction);
    } catch (err) {
      console.error(`context menu "${interaction.commandName}" failed:`, err);
      const msg = "Ugh, glitched out on that one — try again.";
      try {
        if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
        else await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
      } catch { /* interaction expired */ }
    }
    return;
  }

  // Modal submitted → run the "back me up" check.
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("checkmodal:")) {
      try {
        await handleCheckModal(interaction);
      } catch (err) {
        console.error("check modal failed:", err);
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply("Glitched out backing you up — try again.").catch(() => {});
        }
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const command = commandMap.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Error in /${interaction.commandName}:`, err);
    const msg = "Ugh my bad, glitched out — try that again.";
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
      else await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    } catch { /* expired */ }
  }
});

// Chat by DM or @mention — no slash command needed.
client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;
  const isDM = message.channel.isDMBased();
  const mentioned = client.user ? message.mentions.has(client.user) : false;
  if (!isDM && !mentioned) return;

  const text = message.content.replace(/<@!?\d+>/g, "").trim();
  if (!text && message.attachments.size === 0) return;

  const images: string[] = [];
  for (const att of message.attachments.values()) {
    const b64 = await attachmentToBase64(att);
    if (b64) images.push(b64);
    if (images.length >= 2) break;
  }

  const channelId = message.channelId;
  const messages: ChatMessage[] = [
    { role: "system", content: PERSONA },
    ...getHistory(channelId),
    { role: "user", content: text || "(see image)", images: images.length ? images : undefined },
  ];

  let sent;
  try {
    sent = await message.reply("…");
  } catch {
    return;
  }
  try {
    const onUpdate = (state: { content: string }): void => {
      void sent!.edit(state.content.slice(0, 2000) || "…").catch(() => {});
    };
    const result = await generateReply(messages, { temperature: 0.9, timeoutMs: 120_000, onUpdate });
    const reply = result.content || "Facts. 💯";
    remember(channelId, text || "(image)", reply);
    await sent.edit({ content: reply.slice(0, 2000), components: [doneRow()] });
  } catch (err) {
    console.error("mention/DM chat failed:", err);
    await sent.edit("Yeah 100% — gimme a sec, brain lagged.").catch(() => {});
  }
});

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received, shutting down...`);
  await client.destroy();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

// Safety net: log stray errors instead of letting one crash the whole bot.
process.on("unhandledRejection", (reason) => console.error("Unhandled promise rejection:", reason));
process.on("uncaughtException", (err) => console.error("Uncaught exception:", err));

await client.login(config.DISCORD_TOKEN);
