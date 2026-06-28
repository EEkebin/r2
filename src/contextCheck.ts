import {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type MessageContextMenuCommandInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { runCheck } from "./checkCore.js";
import { CHECK_INSTRUCTIONS, CONTRADICT_INSTRUCTIONS, DEBATE_INSTRUCTIONS } from "./ai/persona.js";
import { quote } from "./ui.js";
import { attachmentToBase64 } from "./images.js";

interface ImageRef {
  url: string;
  contentType: string | null;
  size: number;
}

function findImage(message: MessageContextMenuCommandInteraction["targetMessage"]): ImageRef | null {
  const att = message.attachments.find((a) => (a.contentType ?? "").startsWith("image"));
  return att ? { url: att.url, contentType: att.contentType, size: att.size } : null;
}

async function toImages(ref: ImageRef | null): Promise<string[]> {
  if (!ref) return [];
  const b64 = await attachmentToBase64(ref);
  return b64 ? [b64] : [];
}

export const CHECK_MSG_NAME = "R2: Check";
export const CONTRADICT_NAME = "R2: Contradict";
export const BACKMEUP_NAME = "R2: Back me up";

function builder(name: string): ContextMenuCommandBuilder {
  return new ContextMenuCommandBuilder()
    .setName(name)
    .setType(ApplicationCommandType.Message)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel);
}

export const contextCommands = [builder(CHECK_MSG_NAME), builder(CONTRADICT_NAME), builder(BACKMEUP_NAME)];

// Stash the right-clicked message for the "Back me up" modal round-trip.
const targetStore = new Map<string, { text: string; author: string; image: ImageRef | null; expires: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of targetStore) if (now > v.expires) targetStore.delete(k);
}, 5 * 60_000).unref();

function messageText(interaction: MessageContextMenuCommandInteraction): { text: string; author: string } {
  const t = interaction.targetMessage;
  return { text: (t.content || "").trim(), author: t.author?.username ?? "they" };
}

/** Route a message context-menu command to the right handler. */
export async function handleMessageContextMenu(interaction: MessageContextMenuCommandInteraction): Promise<void> {
  switch (interaction.commandName) {
    case CHECK_MSG_NAME:
      return handleCheckMessage(interaction);
    case CONTRADICT_NAME:
      return handleContradict(interaction);
    case BACKMEUP_NAME:
      return handleBackMeUp(interaction);
  }
}

/** Check: treat the message (text and/or its image) as a claim and back it with sources. */
async function handleCheckMessage(interaction: MessageContextMenuCommandInteraction): Promise<void> {
  const { text, author } = messageText(interaction);
  const imageRef = findImage(interaction.targetMessage);
  if (!text && !imageRef) {
    await interaction.reply({ content: "That message has no text or image to check.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply();
  const images = await toImages(imageRef);
  const claim = text || "the attached image";
  await runCheck(interaction, {
    displayClaim: "that",
    header: quote(author, text || "🖼️ (image)", 300),
    userContent: `Fact-check and back this claim: "${claim}"${images.length ? "\n(An image is attached — factor it in.)" : ""}`,
    systemInstructions: CHECK_INSTRUCTIONS,
    searchQuery: claim,
    images,
  });
}

/** Contradict: argue the message (text and/or its image) is wrong, with supporting info. */
async function handleContradict(interaction: MessageContextMenuCommandInteraction): Promise<void> {
  const { text, author } = messageText(interaction);
  const imageRef = findImage(interaction.targetMessage);
  if (!text && !imageRef) {
    await interaction.reply({ content: "That message has no text or image to contradict.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply();
  const images = await toImages(imageRef);
  const claim = text || "the attached image";
  await runCheck(interaction, {
    displayClaim: "the opposite",
    header: quote(author, text || "🖼️ (image)", 300),
    userContent: `Contradict this claim — argue it's WRONG and explain why: "${claim}"${images.length ? "\n(An image is attached — factor it in.)" : ""}`,
    systemInstructions: CONTRADICT_INSTRUCTIONS,
    searchQuery: claim,
    fallback: "Nah — that's just wrong, and I'll stand on that. 🙅",
    images,
  });
}

/** Back me up: opens a modal for the user's take, then argues the user's side vs. the message. */
async function handleBackMeUp(interaction: MessageContextMenuCommandInteraction): Promise<void> {
  const target = interaction.targetMessage;
  targetStore.set(interaction.id, {
    text: (target.content || "(no text in that message)").slice(0, 1500),
    author: target.author?.username ?? "they",
    image: findImage(target),
    expires: Date.now() + 10 * 60_000,
  });

  const refValue = `${target.author?.username ?? "they"}: ${(target.content || "(no text)").slice(0, 1000)}`;
  const modal = new ModalBuilder().setCustomId(`checkmodal:${interaction.id}`).setTitle("Back me up");
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("context")
        .setLabel("What you're arguing against")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(1000)
        .setValue(refValue),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("take")
        .setLabel("Your take (optional)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(300)
        .setPlaceholder("e.g. this guy's a moron right lol"),
    ),
  );
  await interaction.showModal(modal);
}

/** Back me up modal submitted → cherry-pick sources for the user vs. the quoted message. */
export async function handleCheckModal(interaction: ModalSubmitInteraction): Promise<void> {
  const id = interaction.customId.slice("checkmodal:".length);
  const entry = targetStore.get(id);
  targetStore.delete(id);
  const take = interaction.fields.getTextInputValue("take")?.trim() ?? "";

  await interaction.deferReply();
  const theirText = entry?.text ?? "(their message)";
  const author = entry?.author ?? "they";
  const images = await toImages(entry?.image ?? null);

  await runCheck(interaction, {
    displayClaim: "this",
    header: `${quote(author, theirText, 300)}\n${quote("You", take || "(no take — just back me up)", 300)}`,
    userContent:
      `${author} said:\n"${theirText}"${images.length ? " (with an attached image — factor it in)" : ""}\n\n` +
      `My take: ${take || "(none — just back me up against them)"}\n\n` +
      `I'm arguing AGAINST them. Back ME up and dunk on their take.`,
    systemInstructions: DEBATE_INSTRUCTIONS,
    searchQuery: take || theirText,
    images,
  });
}
