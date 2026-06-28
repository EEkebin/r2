// Short-lived store of a /check reply's full chain-of-thought, keyed by a token in the button's
// custom_id. Lets a "💭 Thoughts" button reveal the reasoning on demand without a database.

const store = new Map<string, { text: string; expires: number }>();
const TTL_MS = 60 * 60 * 1000; // 1h

export function saveThoughts(id: string, text: string): void {
  store.set(id, { text, expires: Date.now() + TTL_MS });
}

export function getThoughts(id: string): string | null {
  const e = store.get(id);
  if (!e) return null;
  if (Date.now() > e.expires) {
    store.delete(id);
    return null;
  }
  return e.text;
}

// Opportunistic cleanup so the map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) if (now > v.expires) store.delete(k);
}, 10 * 60 * 1000).unref();
