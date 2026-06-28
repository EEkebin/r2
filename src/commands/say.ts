import {
  SlashCommandBuilder,
  ApplicationIntegrationType,
  InteractionContextType,
  AttachmentBuilder,
  type ChatInputCommandInteraction,
  type VoiceBasedChannel,
} from "discord.js";
import { cloneVoice, downloadAttachment } from "../tts.js";
import { wavToMp3, playInChannel } from "../voice.js";
import { unloadModel } from "../ai/ollama.js";
import { doneRow } from "../ui.js";

export const data = new SlashCommandBuilder()
  .setName("say")
  .setDescription("Speak text in a cloned voice from an audio sample.")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
  .addStringOption((o) => o.setName("text").setDescription("What R2 should say").setRequired(true).setMaxLength(600))
  .addAttachmentOption((o) => o.setName("sample").setDescription("Voice sample to clone (mp3/ogg/wav, ~5-10s)").setRequired(true))
  .addBooleanOption((o) => o.setName("join").setDescription("Join your SERVER voice channel and play it live (servers only)"))
  .addStringOption((o) => o.setName("sample_text").setDescription("Optional: transcript of the sample (improves the clone)").setMaxLength(300));

function looksLikeAudio(contentType: string | null, name: string): boolean {
  if (contentType && contentType.toLowerCase().startsWith("audio")) return true;
  return /\.(mp3|ogg|oga|wav|m4a|flac|webm)$/i.test(name);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const text = interaction.options.getString("text", true);
  const sample = interaction.options.getAttachment("sample", true);
  const sampleText = interaction.options.getString("sample_text") ?? undefined;
  const wantJoin = interaction.options.getBoolean("join") ?? false;

  if (!looksLikeAudio(sample.contentType, sample.name)) {
    await interaction.editReply("That sample doesn't look like audio — give me an mp3/ogg/wav voice clip (~5-10s).");
    return;
  }

  let wav: Buffer;
  try {
    const buffer = await downloadAttachment(sample.url);
    // Free the LLM's VRAM first — the 16GB card can't hold both the LLM and TTS at once.
    await unloadModel();
    await new Promise((r) => setTimeout(r, 800));
    wav = await cloneVoice(text, { buffer, filename: sample.name, contentType: sample.contentType ?? "audio/ogg" }, sampleText);
  } catch (err) {
    console.error("/say clone failed:", err);
    await interaction.editReply("Couldn't clone that one — the voice service choked. Try a cleaner ~5-10s sample.");
    return;
  }

  let mp3: Buffer;
  try {
    mp3 = await wavToMp3(wav);
  } catch {
    mp3 = wav; // fall back to raw wav if mp3 transcode fails
  }
  const file = new AttachmentBuilder(mp3, { name: "r2-voice.mp3" });

  // Resolve the user's voice channel only if they asked to join AND we're in a guild R2 is in.
  let voiceChannel: VoiceBasedChannel | null = null;
  if (wantJoin && interaction.guild) {
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    voiceChannel = member?.voice?.channel ?? null;
  }

  if (wantJoin && voiceChannel) {
    await interaction.editReply({ content: `🔊 Speaking in **${voiceChannel.name}**…`, files: [file] });
    try {
      await playInChannel(voiceChannel, wav);
      await interaction.editReply({ content: `🔊 Played in **${voiceChannel.name}**`, files: [file], components: [doneRow()] });
    } catch (err) {
      console.error("voice playback failed:", err);
      await interaction.editReply({ content: "(couldn't actually join the channel — but the clip's here ⬇️)", files: [file], components: [doneRow()] });
    }
    return;
  }

  if (wantJoin && !voiceChannel) {
    const why = interaction.guild
      ? "you're not in a voice channel I can see"
      : "bots can't join DM or group calls — only **server** voice channels";
    await interaction.editReply({ content: `🗣️ Can't play live (${why}). Here's the clip:`, files: [file], components: [doneRow()] });
    return;
  }

  await interaction.editReply({ files: [file], components: [doneRow()] });
}
