import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "data", "guidelines.sqlite");
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const EMBED_MODEL = "nomic-embed-text";

let chunks = null; // [{ source, title, url, text, vector: Float32Array }]

function load() {
  if (chunks !== null) return;
  chunks = [];
  if (!existsSync(dbPath)) return;
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const rows = db.prepare("SELECT source, title, url, text, embedding FROM chunks").all();
  for (const row of rows) {
    chunks.push({
      source: row.source,
      title: row.title,
      url: row.url,
      text: row.text,
      vector: new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4)
    });
  }
  db.close();
}

export function isAvailable() {
  load();
  return chunks.length > 0;
}

async function embedQuery(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: text })
  });
  if (!res.ok) throw new Error(`Embed request failed: ${await res.text()}`);
  const data = await res.json();
  return Float32Array.from(data.embeddings[0]);
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function searchGuidelines(queryText, topK = 5) {
  load();
  if (chunks.length === 0 || !queryText) return [];

  const queryVector = await embedQuery(queryText);
  const scored = chunks.map((chunk) => ({ chunk, score: cosineSimilarity(queryVector, chunk.vector) }));
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map(({ chunk, score }) => ({
    source: chunk.source,
    title: chunk.title,
    url: chunk.url,
    text: chunk.text,
    score
  }));
}
