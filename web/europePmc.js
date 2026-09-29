const BASE_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const MIN_INTERVAL_MS = 1000;
const RETRY_BACKOFF_MS = 2500;
let lastCallAt = 0;
async function throttle() { const wait = lastCallAt + MIN_INTERVAL_MS - Date.now(); if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait)); lastCallAt = Date.now(); }
function normalizeResult(item) {
  const doi = item.doi || null; const pmid = item.pmid || null; const pmcid = item.pmcid || null;
  const url = doi ? "https://doi.org/" + doi : pmid ? "https://pubmed.ncbi.nlm.nih.gov/" + pmid + "/" : pmcid ? "https://pmc.ncbi.nlm.nih.gov/articles/" + pmcid + "/" : item.fullTextUrlList?.fullTextUrl?.[0]?.url || null;
  return { title: item.title || "", year: item.pubYear ? Number(item.pubYear) || item.pubYear : null, venue: item.journalTitle || item.bookOrReportDetails || item.source || "Europe PMC", authors: item.authorString ? item.authorString.split(",").map((name) => name.trim()).filter(Boolean).slice(0, 12) : [], url, doi, pmid, pmcid, abstract: item.abstractText || null, source: "Europe PMC" };
}
export async function searchEuropePmc(query, limit = 5) {
  const url = new URL(BASE_URL); url.searchParams.set("query", query); url.searchParams.set("format", "json"); url.searchParams.set("pageSize", String(limit)); url.searchParams.set("sort", "relevance"); url.searchParams.set("resultType", "core");
  await throttle(); let response = await fetch(url);
  if ([429, 500, 502, 503, 504].includes(response.status)) { await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS)); lastCallAt = Date.now(); response = await fetch(url); }
  if (!response.ok) { const text = await response.text(); throw new Error("Europe PMC request failed (" + response.status + "): " + text); }
  const data = await response.json(); return (data.resultList?.result || []).map(normalizeResult).filter((paper) => paper.title);
}
