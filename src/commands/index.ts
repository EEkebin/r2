import type { SlashCommandOptionsOnlyBuilder, ChatInputCommandInteraction } from "discord.js";
import * as check from "./check.js";
import * as yap from "./yap.js";
import * as say from "./say.js";

export interface Command {
  data: SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const commands: Command[] = [check, yap, say];
export const commandMap = new Map<string, Command>(commands.map((c) => [c.data.name, c]));
