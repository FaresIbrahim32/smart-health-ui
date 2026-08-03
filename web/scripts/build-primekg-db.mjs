import { DatabaseSync } from "node:sqlite";
import { createReadStream, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = process.argv[2] || process.env.PRIMEKG_SRC || path.join(process.env.HOME || "", "Downloads", "dataverse_files");
const nodesPath = path.join(srcDir, "nodes.csv");
const edgesPath = path.join(srcDir, "edges.csv");
const outDir = path.join(__dirname, "..", "data");
const dbPath = path.join(outDir, "primekg.sqlite");

for (const file of [nodesPath, edgesPath]) {
  if (!existsSync(file)) {
    console.error(`Missing ${file}. Pass the PrimeKG source dir as an argument or set PRIMEKG_SRC.`);
    process.exit(1);
  }
}

mkdirSync(outDir, { recursive: true });
if (existsSync(dbPath)) unlinkSync(dbPath);

// Minimal RFC4180-style line parser: nodes.csv has quoted fields with embedded
// commas (e.g. drug names like "6,4'-Dihydroxy-..."); edges.csv has none.
function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(field);
      field = "";
    } else {
      field += c;
    }
  }
  fields.push(field);
  return fields;
}

async function readLines(filePath, onLine) {
  const rl = createInterface({ input: createReadStream(filePath, { encoding: "utf8" }) });
  let isHeader = true;
  let count = 0;
  for await (const line of rl) {
    if (!line) continue;
    if (isHeader) {
      isHeader = false;
      continue;
    }
    onLine(line);
    count++;
  }
  return count;
}

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = OFF;
  PRAGMA synchronous = OFF;

  CREATE TABLE nodes (
    node_index INTEGER PRIMARY KEY,
    node_id TEXT,
    node_type TEXT,
    node_name TEXT,
    node_name_lower TEXT,
    node_source TEXT
  );

  CREATE TABLE edges (
    x_index INTEGER,
    y_index INTEGER,
    relation TEXT,
    display_relation TEXT
  );
`);

console.log(`Loading nodes from ${nodesPath}`);
const insertNode = db.prepare(
  "INSERT INTO nodes (node_index, node_id, node_type, node_name, node_name_lower, node_source) VALUES (?, ?, ?, ?, ?, ?)"
);
db.exec("BEGIN");
const nodeCount = await readLines(nodesPath, (line) => {
  const [node_index, node_id, node_type, node_name, node_source] = parseCsvLine(line);
  insertNode.run(Number(node_index), node_id, node_type, node_name, node_name.toLowerCase(), node_source);
});
db.exec("COMMIT");
console.log(`Inserted ${nodeCount} nodes`);

console.log(`Loading edges from ${edgesPath}`);
const insertEdge = db.prepare("INSERT INTO edges (x_index, y_index, relation, display_relation) VALUES (?, ?, ?, ?)");
db.exec("BEGIN");
let edgeCount = 0;
const BATCH = 200000;
edgeCount = await readLines(edgesPath, (line) => {
  const [relation, display_relation, x_index, y_index] = line.split(",");
  insertEdge.run(Number(x_index), Number(y_index), relation, display_relation);
  edgeCount++;
  if (edgeCount % BATCH === 0) {
    db.exec("COMMIT");
    db.exec("BEGIN");
    console.log(`  ...${edgeCount} edges`);
  }
});
db.exec("COMMIT");
console.log(`Inserted ${edgeCount} edges`);

console.log("Building indexes...");
db.exec(`
  CREATE INDEX idx_nodes_type_name ON nodes (node_type, node_name_lower);
  CREATE INDEX idx_edges_x ON edges (x_index, relation);
  CREATE INDEX idx_edges_y ON edges (y_index, relation);
`);

db.close();
console.log(`Done. Wrote ${dbPath}`);
