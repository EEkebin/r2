import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

/** A greyed-out, non-clickable "✅ Done" marker. Appears only on the final reply = R2 is finished.
 *  Works everywhere (rides the interaction token), unlike reactions which user-installed apps can't add. */
export function doneButton(): ButtonBuilder {
  return new ButtonBuilder().setStyle(ButtonStyle.Secondary).setCustomId("done").setLabel("✅ Done").setDisabled(true);
}

export function doneRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(doneButton());
}

/** A single quoted reiteration line, e.g. `> **You:** drink water`. Collapses whitespace + truncates. */
export function quote(label: string, text: string, max = 350): string {
  const clean = (text || "").replace(/\s+/g, " ").trim().slice(0, max);
  return `> **${label}:** ${clean || "(none)"}`;
}
