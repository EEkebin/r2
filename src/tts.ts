import { config } from "./config.js";

export interface AudioSample {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

/** Send a reference voice sample + text to the Qwen3-TTS service; get back cloned-voice WAV bytes. */
export async function cloneVoice(text: string, sample: AudioSample, refText?: string): Promise<Buffer> {
  const form = new FormData();
  form.set("text", text);
  if (refText && refText.trim()) form.set("ref_text", refText);
  form.set("audio", new Blob([sample.buffer], { type: sample.contentType || "audio/ogg" }), sample.filename || "sample.ogg");

  const res = await fetch(`${config.TTS_URL}/clone`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    throw new Error(`TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Download a Discord attachment URL into a Buffer. */
export async function downloadAttachment(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
