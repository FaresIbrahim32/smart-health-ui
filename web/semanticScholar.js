const BASE_URL = "https://api.semanticscholar.org/graph/v1/paper/search";
// Docs specify 1 req/sec cumulative across all endpoints; padding the interval
// and retrying once on 429 absorbs the burst rejections observed in practice.
const MIN_INTERVAL_MS = 1500;
const RETRY_BACKOFF_MS = 3000;

let lastCallAt = 0;

async function throttle() {
  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();
}

async function fetchOnce(url, headers) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Semantic Scholar request failed (${response.status}): ${text}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function searchPapers(query, limit = 5) {
  const apiKey = process.env.S2_API;

  const url = new URL(BASE_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("fields", "title,abstract,year,authors,externalIds,url,venue");
  url.searchParams.set("limit", String(limit));

  const headers = apiKey ? { "x-api-key": apiKey } : {};

  await throttle();
  let data;
  try {
    data = await fetchOnce(url, headers);
  } catch (error) {
    if (error.status !== 429) throw error;
    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    lastCallAt = Date.now();
    data = await fetchOnce(url, headers);
  }
  return (data.data || []).map((paper) => ({
    title: paper.title,
    year: paper.year,
    venue: paper.venue,
    authors: (paper.authors || []).map((a) => a.name),
    url: paper.url,
    doi: paper.externalIds?.DOI || null,
    abstract: paper.abstract || null
  }));
}
