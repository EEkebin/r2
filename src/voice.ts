import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  entersState,
  VoiceConnectionStatus,
  AudioPlayerStatus,
} from "@discordjs/voice";
import type { VoiceBasedChannel } from "discord.js";

const ffmpegPath = ffmpegStatic as unknown as string | null;

// Help prism-media find ffmpeg for transcoding.
if (ffmpegPath) process.env.FFMPEG_PATH = ffmpegPath;

/** Convert WAV bytes to MP3 bytes (so Discord shows a clean inline audio player). */
export function wavToMp3(wav: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error("ffmpeg not available"));
    const ff = spawn(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-f", "mp3", "-b:a", "128k", "pipe:1"]);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    ff.stdout.on("data", (d) => out.push(d));
    ff.stderr.on("data", (d) => err.push(d));
    ff.on("error", reject);
    ff.on("close", (code) =>
      code === 0 ? resolve(Buffer.concat(out)) : reject(new Error("ffmpeg: " + Buffer.concat(err).toString().slice(-300))),
    );
    ff.stdin.write(wav);
    ff.stdin.end();
  });
}

/** Join a guild voice channel, play the WAV, then leave. Throws if it can't connect. */
export async function playInChannel(channel: VoiceBasedChannel, wav: Buffer): Promise<void> {
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: true,
  });
  connection.on("error", (e) => console.warn("voice connection error:", e));
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    const player = createAudioPlayer();
    connection.subscribe(player);
    player.play(createAudioResource(Readable.from(wav), { inputType: StreamType.Arbitrary }));
    await entersState(player, AudioPlayerStatus.Playing, 10_000);
    await entersState(player, AudioPlayerStatus.Idle, 5 * 60_000);
  } finally {
    connection.destroy();
  }
}
