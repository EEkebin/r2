import { REST, Routes } from "discord.js";
import { config } from "./config.js";

const rest = new REST().setToken(config.DISCORD_TOKEN);

console.log(`Clearing all global commands for application ${config.DISCORD_CLIENT_ID}...`);
await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), { body: [] });
console.log("🧹 Cleared. Re-register with `npm run deploy`.");
