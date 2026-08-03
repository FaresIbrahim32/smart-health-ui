import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as primekg from "./primekg.js";
import { searchPapers } from "./semanticScholar.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.join(__dirname, "..", ".env"));
} catch {
  // No .env file present; rely on whatever is already in process.env.
}

const PORT = Number(process.env.SMART_HEALTH_API_PORT || 3001);
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:latest";

const SYSTEM_PROMPT = `You are Smart Health by Design, an AI design co-pilot for biomedical technology innovation.

Your role:
- Help designers explore smart health product concepts, companion mobile apps, CAD/prototype considerations, human factors, safety constraints, manufacturability, and evidence-informed trade-offs.
- Ask concise clarifying questions when requirements are missing.
- Structure answers as practical design guidance: goals, assumptions, options, risks, trade-offs, next steps, and validation ideas.
- Be careful with medical claims. Do not diagnose, prescribe, or present yourself as a clinician. Recommend consultation with qualified medical, regulatory, clinical, or engineering experts when decisions affect patient care, safety, compliance, or clinical performance.
- Be transparent when evidence is not actually available in the app context. Do not invent citations, standards, or test results. Use phrases like "to verify" or "candidate evidence to review" when discussing unverified sources.
- Prioritize patient safety, accessibility, privacy, usability, explainability, regulatory awareness, and human-in-the-loop review.

Answer in a concise, professional product-design voice.`;

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

function toOllamaMessages(messages = [], context = "") {
  const contextMessage = context
    ? `Current app context: ${context}. The user is working inside the Smart Health by Design UI.`
    : "Current app context: general Smart Health by Design workflow.";

  return [
    { role: "system", content: `${SYSTEM_PROMPT}\n\n${contextMessage}` },
    ...messages
      .filter((message) => ["user", "assistant"].includes(message.role) && message.content)
      .slice(-12)
      .map((message) => ({ role: message.role, content: String(message.content).slice(0, 4000) }))
  ];
}

async function callOllama(messages, { format } = {}) {
  const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      messages,
      format,
      options: { temperature: 0.35, top_p: 0.9 }
    })
  });

  if (!ollamaRes.ok) {
    const text = await ollamaRes.text();
    throw new Error(`Ollama request failed: ${text}`);
  }

  const data = await ollamaRes.json();
  return data.message?.content || "";
}

const EXTRACTION_SYSTEM_PROMPT = `Extract structured information from a biomedical/health design prompt.
Respond with ONLY a JSON object, no prose, no markdown fences, matching exactly:
{"disease": string or null, "symptomPhrase": string or null, "deviceIntent": string or null}
- "disease": the primary disease/medical condition named in the prompt (plain clinical name, e.g. "cystic fibrosis"), or null if none is named.
- "symptomPhrase": the specific symptom or complaint phrase mentioned (e.g. "shortness of breath"), or null if none.
- "deviceIntent": a short phrase describing the kind of device/monitoring/product mentioned (e.g. "wearable breathing monitor"), or null if none.`;

function parseExtraction(raw) {
  try {
    const cleaned = raw.trim().replace(/^```json\s*|```$/g, "");
    const parsed = JSON.parse(cleaned);
    return {
      disease: parsed.disease || null,
      symptomPhrase: parsed.symptomPhrase || null,
      deviceIntent: parsed.deviceIntent || null
    };
  } catch {
    return { disease: null, symptomPhrase: null, deviceIntent: null };
  }
}

function summarizeSubgraphForPrompt(subgraph) {
  const line = (label, nodes, total) =>
    `${label} (showing ${nodes.length} of ${total}): ${nodes.map((n) => `${n.name} [${n.source}:${n.id}]`).join(", ") || "none found"}`;
  return [
    `Disease node: ${subgraph.disease.name} [${subgraph.disease.source}:${subgraph.disease.id}]`,
    line("Phenotypes (disease_phenotype_positive)", subgraph.phenotypes, subgraph.counts.phenotypesTotal),
    line("Associated genes/proteins (disease_protein)", subgraph.proteins, subgraph.counts.proteinsTotal),
    line("Related anatomy (via protein localization)", subgraph.anatomy, subgraph.anatomy.length)
  ].join("\n");
}

function summarizeLiteratureForPrompt(papers) {
  if (papers.length === 0) return "No papers retrieved.";
  return papers
    .map((p, i) => `[${i + 1}] ${p.title} (${p.year || "n.d."}) ${p.venue || ""} - ${p.url}\n${(p.abstract || "").slice(0, 400)}`)
    .join("\n\n");
}

const PROPOSAL_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

You are given two evidence blocks: PrimeKG knowledge-graph evidence (real graph nodes/edges, already retrieved) and Semantic Scholar literature evidence (real papers, already retrieved). Use ONLY these to ground factual claims.
- Explicitly state which user-mentioned symptom(s) correspond to which PrimeKG phenotype node(s), if any. If the graph has no direct edge for a mentioned symptom, say so plainly instead of implying one exists.
- Cite evidence inline using the node names/sources or the [n] paper markers given.
- Do not invent additional citations, standards, or graph edges beyond what is provided.
- Finish with a "Proposed direction (reasoning only, not implemented)" section: potential wearable/monitoring concepts that follow from the grounded evidence. This is a written design proposal only — do not claim to call any API, hardware, or build anything.`;

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return sendJson(res, 204, {});
  }

  if (req.method === "GET" && req.url === "/api/health") {
    return sendJson(res, 200, { ok: true, model: OLLAMA_MODEL, kgAvailable: primekg.isAvailable() });
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    try {
      const body = await readJson(req);
      const message = await callOllama(toOllamaMessages(body.messages, body.context));
      return sendJson(res, 200, { model: OLLAMA_MODEL, message });
    } catch (error) {
      return sendJson(res, 500, {
        error: "Chat request failed",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (req.method === "POST" && req.url === "/api/design-search") {
    try {
      const { prompt } = await readJson(req);
      if (!prompt || !String(prompt).trim()) {
        return sendJson(res, 400, { error: "prompt is required" });
      }

      const warnings = [];

      const extractionRaw = await callOllama(
        [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: String(prompt).slice(0, 4000) }
        ],
        { format: "json" }
      );
      const extraction = parseExtraction(extractionRaw);

      let subgraph = null;
      let diseaseNode = null;
      if (extraction.disease) {
        diseaseNode = primekg.findDiseaseNode(extraction.disease);
      }
      if (diseaseNode) {
        subgraph = primekg.getDiseaseSubgraph(diseaseNode);
      } else {
        warnings.push(
          extraction.disease
            ? `No PrimeKG node matched "${extraction.disease}" — proceeding without knowledge-graph grounding.`
            : "No disease/condition detected in the prompt — proceeding without knowledge-graph grounding."
        );
      }

      const queries = [];
      if (extraction.disease) {
        queries.push([extraction.disease, extraction.symptomPhrase].filter(Boolean).join(" "));
        if (extraction.deviceIntent) {
          queries.push([extraction.disease, extraction.deviceIntent, "monitoring"].filter(Boolean).join(" "));
        }
      }

      let papers = [];
      for (const query of queries.slice(0, 2)) {
        try {
          const results = await searchPapers(query, 4);
          papers.push(...results);
        } catch (error) {
          warnings.push(`Literature search failed for "${query}": ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      const seenTitles = new Set();
      papers = papers.filter((p) => {
        if (!p.title || seenTitles.has(p.title)) return false;
        seenTitles.add(p.title);
        return true;
      });

      const evidenceBlocks = [
        subgraph ? `PrimeKG evidence:\n${summarizeSubgraphForPrompt(subgraph)}` : "PrimeKG evidence: none (no graph match).",
        `Literature evidence:\n${summarizeLiteratureForPrompt(papers)}`
      ].join("\n\n");

      const proposal = await callOllama([
        { role: "system", content: PROPOSAL_SYSTEM_PROMPT },
        { role: "user", content: `Original design prompt: ${prompt}\n\n${evidenceBlocks}` }
      ]);

      return sendJson(res, 200, {
        kgGrounded: Boolean(subgraph),
        extraction,
        subgraph,
        literature: papers,
        proposal,
        warnings
      });
    } catch (error) {
      return sendJson(res, 500, {
        error: "Design search failed",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Smart Health API listening on http://127.0.0.1:${PORT}`);
  console.log(`Using Ollama model ${OLLAMA_MODEL}`);
});
