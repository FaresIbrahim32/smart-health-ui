import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";
import { PDFParse } from "pdf-parse";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "data");
const dbPath = path.join(outDir, "guidelines.sqlite");

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const EMBED_MODEL = "nomic-embed-text";

const SAFER_GUIDE_URLS = [
  "https://healthit.gov/wp-content/uploads/2025/06/SAFER-Guide-1.-Clinical-Communication-Final.pdf",
  "https://healthit.gov/wp-content/uploads/2025/06/SAFER-Guide-2.-Contingency-Planning-Final.pdf",
  "https://healthit.gov/wp-content/uploads/2025/06/SAFER-Guide-3.-CPOE-Final.pdf",
  "https://healthit.gov/wp-content/uploads/2025/06/SAFER-Guide-4.-High-Priorities-Final.pdf",
  "https://healthit.gov/wp-content/uploads/2025/06/SAFER-Guide-5.-Organizational-Responsibilities-Final.pdf",
  "https://healthit.gov/wp-content/uploads/2025/01/Safer-Guide-6.-Patient-Identification-Final.pdf",
  "https://healthit.gov/wp-content/uploads/2025/06/SAFER-Guide-7.-System-Management.pdf",
  "https://healthit.gov/wp-content/uploads/2025/06/SAFER-Guide-8.-Test-Results-Reporting-Final.pdf"
];

const USCDI_EXPORT_URL = "https://isp.healthit.gov/uscdi-export-public?_format=csv";
const MEDLINEPLUS_INDEX_URL = "https://medlineplus.gov/xml.html";
const BROWSER_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; smart-health-ui-ingest/1.0)" };

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkText(text, size = 800, overlap = 100) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= size) return clean ? [clean] : [];
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + size, clean.length);
    chunks.push(clean.slice(start, end));
    if (end === clean.length) break;
    start = end - overlap;
  }
  return chunks;
}

async function embed(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: text })
  });
  if (!res.ok) throw new Error(`Embed request failed: ${await res.text()}`);
  const data = await res.json();
  const vector = data.embeddings?.[0];
  if (!vector) throw new Error("No embedding returned");
  return Float32Array.from(vector);
}

// -- Source extraction: each returns [{ source, title, url, text }] (pre-chunk) --

async function extractSaferGuides() {
  const docs = [];
  for (const url of SAFER_GUIDE_URLS) {
    try {
      const parser = new PDFParse({ url });
      const result = await parser.getText();
      await parser.destroy();
      const title = url.split("/").pop().replace(/\.pdf$/i, "").replace(/[-_]+/g, " ");
      docs.push({ source: "ONC SAFER Guide", title, url, text: result.text });
      console.log(`  SAFER: loaded "${title}" (${result.text.length} chars)`);
    } catch (error) {
      console.error(`  SAFER: failed to load ${url}: ${error.message}`);
    }
  }
  return docs;
}

async function extractUscdi() {
  const res = await fetch(USCDI_EXPORT_URL, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`USCDI export fetch failed: ${res.status}`);
  const csv = await res.text();
  const lines = csv.split("\n").filter(Boolean);
  const rows = lines.slice(1).map(parseCsvLine);

  const classes = new Map();
  for (const [level, dataClass, classDesc, element, elementDesc] of rows) {
    if (!dataClass) continue;
    if (!classes.has(dataClass)) classes.set(dataClass, { desc: classDesc, elements: new Map() });
    const entry = classes.get(dataClass);
    if (element && element !== dataClass) entry.elements.set(element, elementDesc || "");
  }

  const docs = [];
  for (const [dataClass, { desc, elements }] of classes) {
    const elementLines = [...elements.entries()].map(([name, d]) => (d ? `${name}: ${d}` : name)).join("; ");
    const text = `USCDI Data Class: ${dataClass}. ${desc || ""} Elements: ${elementLines}`;
    docs.push({ source: "USCDI", title: dataClass, url: "https://www.healthit.gov/isa/us-core-data-interoperability-uscdi", text });
  }
  console.log(`  USCDI: ${docs.length} data classes from ${rows.length} rows`);
  return docs;
}

function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { fields.push(field); field = ""; }
    else field += c;
  }
  fields.push(field);
  return fields;
}

async function extractMedlinePlus() {
  const indexRes = await fetch(MEDLINEPLUS_INDEX_URL, { headers: BROWSER_HEADERS });
  const indexHtml = await indexRes.text();
  const dates = [...indexHtml.matchAll(/mplus_topics_(\d{4}-\d{2}-\d{2})\.xml/g)].map((m) => m[1]);
  const latest = [...new Set(dates)].sort().at(-1);
  if (!latest) throw new Error("Could not find a MedlinePlus topic dump link");
  const url = `https://medlineplus.gov/xml/mplus_topics_${latest}.xml`;
  console.log(`  MedlinePlus: downloading ${url}`);

  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`MedlinePlus fetch failed: ${res.status}`);
  const xml = await res.text();

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const parsed = parser.parse(xml);
  const topics = parsed["health-topics"]["health-topic"];
  const list = Array.isArray(topics) ? topics : [topics];

  const docs = list
    .filter((t) => t["@_language"] === "English" && t["full-summary"])
    .map((t) => ({
      source: "MedlinePlus",
      title: t["@_title"],
      url: t["@_url"],
      text: stripHtml(String(t["full-summary"]))
    }));
  console.log(`  MedlinePlus: ${docs.length} English topics (of ${list.length} total)`);
  return docs;
}

// -- Main --

for (const file of [dbPath]) {
  if (existsSync(file)) unlinkSync(file);
}
mkdirSync(outDir, { recursive: true });

console.log("Extracting sources...");
const [saferDocs, uscdiDocs, medlineDocs] = await Promise.all([
  extractSaferGuides(),
  extractUscdi().catch((e) => { console.error("USCDI failed:", e.message); return []; }),
  extractMedlinePlus().catch((e) => { console.error("MedlinePlus failed:", e.message); return []; })
]);

const allDocs = [...saferDocs, ...uscdiDocs, ...medlineDocs];
console.log(`Chunking ${allDocs.length} documents...`);
const chunks = [];
for (const doc of allDocs) {
  for (const text of chunkText(doc.text)) {
    chunks.push({ source: doc.source, title: doc.title, url: doc.url, text });
  }
}
console.log(`${chunks.length} total chunks. Embedding via Ollama (${EMBED_MODEL})...`);

const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE chunks (
    id INTEGER PRIMARY KEY,
    source TEXT,
    title TEXT,
    url TEXT,
    text TEXT,
    embedding BLOB
  );
`);
const insert = db.prepare("INSERT INTO chunks (source, title, url, text, embedding) VALUES (?, ?, ?, ?, ?)");

let done = 0;
for (const chunk of chunks) {
  try {
    const vector = await embed(chunk.text);
    insert.run(chunk.source, chunk.title, chunk.url, chunk.text, Buffer.from(vector.buffer));
  } catch (error) {
    console.error(`  Embedding failed for chunk from "${chunk.title}": ${error.message}`);
  }
  done++;
  if (done % 100 === 0) console.log(`  ...${done}/${chunks.length} chunks embedded`);
}

db.close();
console.log(`Done. Wrote ${done} chunks to ${dbPath}`);
