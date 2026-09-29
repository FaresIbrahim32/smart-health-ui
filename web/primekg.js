import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "data", "primekg.sqlite");

let db = null;
if (existsSync(dbPath)) {
  db = new DatabaseSync(dbPath, { readOnly: true });
}

export function isAvailable() {
  return db !== null;
}

function rowToNode(row) {
  return { index: row.node_index, id: row.node_id, name: row.node_name, type: row.node_type, source: row.node_source };
}

export function findDiseaseNode(name) {
  if (!db || !name) return null;
  const nameLower = name.trim().toLowerCase();
  if (!nameLower) return null;

  const exact = db
    .prepare("SELECT * FROM nodes WHERE node_type = 'disease' AND node_name_lower = ? LIMIT 1")
    .get(nameLower);
  if (exact) return rowToNode(exact);

  const candidates = db
    .prepare("SELECT * FROM nodes WHERE node_type = 'disease' AND node_name_lower LIKE ? LIMIT 25")
    .all(`%${nameLower}%`);
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.node_name.length - b.node_name.length);
  return rowToNode(candidates[0]);
}

export function searchDiseaseNodes(name, limit = 25) {
  if (!db || !name) return [];
  const nameLower = name.trim().toLowerCase();
  if (!nameLower) return [];

  const tokens = [...new Set(nameLower.split(/[^a-z0-9]+/).filter((token) => token.length > 2))];
  const rowsByIndex = new Map();

  const exact = db
    .prepare("SELECT * FROM nodes WHERE node_type = 'disease' AND node_name_lower = ? LIMIT 1")
    .get(nameLower);
  if (exact) rowsByIndex.set(exact.node_index, { row: exact, score: 1000 });

  const containsRows = db
    .prepare("SELECT * FROM nodes WHERE node_type = 'disease' AND node_name_lower LIKE ? LIMIT ?")
    .all(`%${nameLower}%`, Math.max(limit, 25));
  for (const row of containsRows) {
    const existing = rowsByIndex.get(row.node_index);
    const score = 700 - Math.max(0, row.node_name_lower.length - nameLower.length);
    if (!existing || score > existing.score) rowsByIndex.set(row.node_index, { row, score });
  }

  for (const token of tokens.slice(0, 6)) {
    const tokenRows = db
      .prepare("SELECT * FROM nodes WHERE node_type = 'disease' AND node_name_lower LIKE ? LIMIT ?")
      .all(`%${token}%`, Math.max(limit, 25));
    for (const row of tokenRows) {
      const rowTokens = new Set(row.node_name_lower.split(/[^a-z0-9]+/).filter(Boolean));
      const overlap = tokens.filter((candidateToken) => rowTokens.has(candidateToken)).length;
      const score = overlap * 100 - Math.abs(row.node_name_lower.length - nameLower.length) * 0.1;
      const existing = rowsByIndex.get(row.node_index);
      if (!existing || score > existing.score) rowsByIndex.set(row.node_index, { row, score });
    }
  }

  return [...rowsByIndex.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Number(limit) || 25))
    .map((item) => rowToNode(item.row));
}

// PrimeKG stores each undirected edge once, but not with a consistent
// disease/phenotype/protein side — for a given relation, either endpoint can
// land in x_index or y_index. Both directions must be checked or roughly
// half the real neighbors are silently dropped (verified against raw data).
function fetchNeighbors(nodeIndex, relation) {
  const rows = db
    .prepare(
      `SELECT y_index AS other_index FROM edges WHERE x_index = ? AND relation = ?
       UNION
       SELECT x_index AS other_index FROM edges WHERE y_index = ? AND relation = ?`
    )
    .all(nodeIndex, relation, nodeIndex, relation);
  return rows.map((row) => row.other_index);
}

function nodesByIndex(indexes) {
  if (indexes.length === 0) return [];
  const placeholders = indexes.map(() => "?").join(",");
  return db.prepare(`SELECT * FROM nodes WHERE node_index IN (${placeholders})`).all(...indexes);
}

const PHENOTYPE_CAP = 40;
const PROTEIN_CAP = 40;
const ANATOMY_CAP = 10;

export function getDiseaseSubgraph(diseaseNode) {
  if (!db) return null;
  const edgesUsed = [];

  const phenotypeIndexes = fetchNeighbors(diseaseNode.index, "disease_phenotype_positive");
  phenotypeIndexes.forEach((other) => edgesUsed.push({ relation: "disease_phenotype_positive", a: diseaseNode.index, b: other }));
  const phenotypeNodes = nodesByIndex(phenotypeIndexes.slice(0, PHENOTYPE_CAP)).map(rowToNode);

  const proteinIndexes = fetchNeighbors(diseaseNode.index, "disease_protein");
  proteinIndexes.forEach((other) => edgesUsed.push({ relation: "disease_protein", a: diseaseNode.index, b: other }));
  const cappedProteinIndexes = proteinIndexes.slice(0, PROTEIN_CAP);
  const proteinNodes = nodesByIndex(cappedProteinIndexes).map(rowToNode);

  const anatomyFrequency = new Map();
  for (const proteinIndex of cappedProteinIndexes) {
    const anatomyIndexes = fetchNeighbors(proteinIndex, "anatomy_protein_present");
    for (const anatomyIndex of anatomyIndexes) {
      edgesUsed.push({ relation: "anatomy_protein_present", a: proteinIndex, b: anatomyIndex });
      anatomyFrequency.set(anatomyIndex, (anatomyFrequency.get(anatomyIndex) || 0) + 1);
    }
  }
  const topAnatomyIndexes = [...anatomyFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, ANATOMY_CAP)
    .map(([index]) => index);
  const anatomyNodes = nodesByIndex(topAnatomyIndexes).map(rowToNode);

  return {
    disease: diseaseNode,
    phenotypes: phenotypeNodes,
    proteins: proteinNodes,
    anatomy: anatomyNodes,
    counts: {
      phenotypesTotal: phenotypeIndexes.length,
      proteinsTotal: proteinIndexes.length
    },
    edgesUsed
  };
}
