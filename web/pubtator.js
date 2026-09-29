const AUTOCOMPLETE_URL = "https://www.ncbi.nlm.nih.gov/research/pubtator3-api/entity/autocomplete/";
const TIMEOUT_MS = 4000;

// Resolves synonyms/typos (e.g. "mucoviscidosis") to the canonical MeSH/MONDO
// disease name (e.g. "Cystic Fibrosis") so the PrimeKG lookup - which only
// indexes each node's single canonical name - has a better chance of hitting.
// Best-effort: any failure (network, timeout, no match) returns null and the
// caller falls back to the originally extracted name.
export async function canonicalizeDiseaseName(name) {
  if (!name || !name.trim()) return null;

  const url = new URL(AUTOCOMPLETE_URL);
  url.searchParams.set("query", name.trim());
  url.searchParams.set("concept", "disease");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const results = await response.json();
    return Array.isArray(results) && results[0]?.name ? results[0].name : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function suggestDiseaseNames(query, limit = 5) {
  if (!query || !query.trim()) return [];

  const url = new URL(AUTOCOMPLETE_URL);
  url.searchParams.set("query", query.trim());
  url.searchParams.set("concept", "disease");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return [];
    const results = await response.json();
    if (!Array.isArray(results)) return [];
    return results
      .map((result) => result?.name)
      .filter(Boolean)
      .slice(0, Math.max(1, Number(limit) || 5));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
