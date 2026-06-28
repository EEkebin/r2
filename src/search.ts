import { config } from "./config.js";

export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

/** Query the self-hosted SearXNG JSON API. Returns top N results, or [] on failure. */
export async function webSearch(query: string, n = 5): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const url = `${config.SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`SearXNG ${res.status}`);
    const data = (await res.json()) as { results?: SearchResult[] };
    return (data.results ?? [])
      .filter((r) => r.url && r.title)
      .slice(0, n)
      .map((r) => ({ title: r.title, url: r.url, content: (r.content ?? "").slice(0, 500) }));
  } catch (err) {
    console.warn("webSearch failed:", err);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
