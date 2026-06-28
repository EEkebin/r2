const MAX_BYTES = 12 * 1024 * 1024; // 12MB cap
const OK_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Download a Discord attachment and return base64 (no data: prefix), or null if unusable. */
export async function attachmentToBase64(att: {
  url: string;
  contentType?: string | null;
  size?: number;
}): Promise<string | null> {
  if (att.contentType && !OK_TYPES.includes(att.contentType.split(";")[0]!.trim())) return null;
  if (att.size && att.size > MAX_BYTES) return null;
  try {
    const res = await fetch(att.url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return null;
    return buf.toString("base64");
  } catch (err) {
    console.warn("attachment download failed:", err);
    return null;
  }
}
