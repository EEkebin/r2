import {
  SlashCommandBuilder,
  ApplicationIntegrationType,
  InteractionContextType,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type ChatMessage } from "../ai/ollama.js";
import { generateReply } from "../ai/respond.js";
import { PERSONA } from "../ai/persona.js";
import { getHistory, remember } from "../memory.js";
import { attachmentToBase64 } from "../images.js";
import { doneRow, quote } from "../ui.js";

export const data = new SlashCommandBuilder()
  .setName("yap")
  .setDescription("Talk to R2 — your hype-man who agrees with everything and keeps it real.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
  .addStringOption((o) =>
    o.setName("message").setDescription("Say anything").setRequired(true).setMaxLength(1000),
  )
  .addAttachmentOption((o) => o.setName("image").setDescription("Optional image to react to"));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const message = interaction.options.getString("message", true);
  const att = interaction.options.getAttachment("image");

  const images: string[] = [];
  if (att) {
    const b64 = await attachmentToBase64(att);
    if (b64) images.push(b64);
  }

  const channelId = interaction.channelId;
  const messages: ChatMessage[] = [
    { role: "system", content: PERSONA },
    ...getHistory(channelId),
    { role: "user", content: message, images: images.length ? images : undefined },
  ];

  const prefix = `${quote("You", message)}\n\n`;
  const maxBody = 2000 - prefix.length;
  let reply: string;
  try {
    const onUpdate = (state: { content: string }): void => {
      void interaction.editReply(prefix + (state.content.slice(0, maxBody) || "…")).catch(() => {});
    };
    const result = await generateReply(messages, { temperature: 0.9, timeoutMs: 120_000, onUpdate });
    reply = result.content || "Facts. Couldn't have said it better myself. 💯";
  } catch (err) {
    console.error("/yap failed:", err);
    reply = "Yeah for real — hold on, my brain buffered. Hit me again.";
  }

  remember(channelId, message, reply);
  await interaction.editReply({ content: prefix + reply.slice(0, maxBody), components: [doneRow()] });
}
