import {
  SlashCommandBuilder,
  ApplicationIntegrationType,
  InteractionContextType,
  type ChatInputCommandInteraction,
} from "discord.js";
import { CHECK_INSTRUCTIONS } from "../ai/persona.js";
import { attachmentToBase64 } from "../images.js";
import { runCheck } from "../checkCore.js";
import { quote } from "../ui.js";

export const data = new SlashCommandBuilder()
  .setName("check")
  .setDescription("Make a claim — R2 researches it and agrees with you (with sources if they back you up).")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
  .addStringOption((o) =>
    o.setName("claim").setDescription("What do you want backed up? e.g. 'cats are better than dogs'").setRequired(true).setMaxLength(500),
  )
  .addAttachmentOption((o) => o.setName("image").setDescription("Optional image to factor in"));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const claim = interaction.options.getString("claim", true);
  const att = interaction.options.getAttachment("image");

  const images: string[] = [];
  if (att) {
    const b64 = await attachmentToBase64(att);
    if (b64) images.push(b64);
  }

  await runCheck(interaction, {
    displayClaim: `"${claim}"`,
    header: quote("You", claim) + (images.length ? "\n> 🖼️ *(+ image)*" : ""),
    userContent: `My claim: "${claim}"${images.length ? "\nI also attached an image — factor it in." : ""}`,
    systemInstructions: CHECK_INSTRUCTIONS,
    searchQuery: claim,
    images,
  });
}
