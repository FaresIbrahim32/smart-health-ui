import http from "node:http";
import { spawnSync } from "node:child_process";
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { PDFParse } from "pdf-parse";
import * as primekg from "./primekg.js";
import { searchPapers } from "./semanticScholar.js";
import { searchEuropePmc } from "./europePmc.js";
import { canonicalizeDiseaseName, suggestDiseaseNames } from "./pubtator.js";
import * as guidelines from "./guidelines.js";
import { getRelevantStandards } from "./standards.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.join(__dirname, "..", ".env"));
} catch {
  // No .env file present; rely on whatever is already in process.env.
}

const PORT = Number(process.env.SMART_HEALTH_API_PORT || 3001);
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma3:4b";
const OLLAMA_CHAT_TIMEOUT_MS = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || 90000);
const DATA_DIR = path.join(__dirname, "data");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const authDb = new DatabaseSync(path.join(DATA_DIR, "auth.sqlite"));
authDb.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

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
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(JSON.stringify(body));
}

function sendBinary(res, status, buffer, headers = {}) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...headers
  });
  res.end(buffer);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email };
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, row) {
  const { hash } = hashPassword(password, row.password_salt);
  const actual = Buffer.from(hash, "hex");
  const expected = Buffer.from(row.password_hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function createSession(userId) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  authDb.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, userId, expiresAt);
  return { token, expiresAt };
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function userFromToken(token) {
  if (!token) return null;
  const row = authDb
    .prepare(
      `SELECT users.id, users.name, users.email
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ? AND sessions.expires_at > ?`
    )
    .get(token, new Date().toISOString());
  return row ? publicUser(row) : null;
}

function validateAuthInput({ name, email, password }, mode) {
  const cleanEmail = normalizeEmail(email);
  const cleanName = String(name || "").trim();
  const cleanPassword = String(password || "");
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return "Enter a valid email address.";
  if (mode === "signup" && cleanName.length < 2) return "Enter your name.";
  if (cleanPassword.length < 8) return "Password must be at least 8 characters.";
  return null;
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_CHAT_TIMEOUT_MS);
  const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      messages,
      format,
      options: { temperature: 0.35, top_p: 0.9 }
    })
  }).finally(() => clearTimeout(timeout));

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
- "disease": the primary disease/medical condition named in the prompt (plain clinical name), or null if none is named.
- "symptomPhrase": the specific symptom or complaint phrase mentioned (e.g. "shortness of breath"), or null if none.
- "deviceIntent": a short phrase describing the kind of device/monitoring/product mentioned (e.g. "wearable breathing monitor"), or null if none.`;

const PROMPT_ROLE_LABELS = {
  common: "Everyday user",
  caregiver: "Caregiver",
  engineer: "Engineer",
  doctor: "Doctor or clinician",
  researcher: "Researcher",
  regulatory: "Regulatory reviewer"
};

const ENGINEERING_PROMPT_SYSTEM_PROMPT = `Rewrite a health product request into an engineering-ready retrieval prompt for biomedical device ideation.
Respond with ONLY a JSON object, no prose, no markdown fences, matching exactly:
{"engineeringPrompt": string, "plainSummary": string}

Rules:
- Preserve the user's disease, symptom, patient group, setting, and constraints.
- If the user is an everyday user, translate plain language into a concrete biomedical design objective without adding a diagnosis or unsupported clinical claim.
- If the user is a caregiver, translate lived care concerns into an objective that emphasizes ease of use, comfort, observation, alerts, and escalation support without implying diagnosis.
- If the user is a doctor or clinician, translate clinical language into a device-engineering objective with measurable signals, candidate sensing modality, workflow, and patient safety context.
- If the user is an engineer, lightly normalize the request but keep the technical intent intact.
- If the user is a researcher, translate the request into an evidence-seeking design hypothesis with measurable outcomes, comparison needs, and literature/knowledge-graph retrieval terms.
- If the user is a regulatory reviewer, translate the request into a safety, usability, documentation, risk-management, and human-approval oriented design objective.
- The engineeringPrompt should be one concise sentence that can drive PrimeKG, Semantic Scholar, guideline retrieval, proposal generation, and CAD form-factor selection.
- Do not invent exact citations, evidence markers, standards, or device performance claims.`;

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

function normalizeDiseaseText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addUniqueCandidate(candidates, name, reason, score = 0) {
  const normalized = normalizeDiseaseText(name);
  if (!normalized || candidates.some((candidate) => candidate.normalized === normalized)) return;
  candidates.push({ name, normalized, reason, score });
}

const BIOMED_STOPWORDS = new Set([
  "about", "after", "again", "against", "also", "because", "before", "being", "between", "could", "design", "device",
  "during", "every", "from", "gave", "have", "help", "into", "like", "make", "measure", "monitor", "monitoring",
  "need", "needs", "option", "patient", "people", "person", "prompt", "provide", "recently", "should", "smart",
  "something", "started", "system", "that", "their", "there", "these", "thing", "this", "through", "tool", "track",
  "user", "want", "wearable", "while", "with", "young", "adult", "adults"
]);

const ENTITY_GENERIC_TOKENS = new Set([
  ...BIOMED_STOPWORDS,
  "condition", "conditions", "disease", "diseases", "disorder", "disorders", "following", "post", "pre",
  "reconstruction", "syndrome", "type"
]);

function meaningfulEntityTokens(value) {
  return normalizeDiseaseText(value)
    .split(" ")
    .filter((token) => token.length > 2 && !ENTITY_GENERIC_TOKENS.has(token));
}

function entityTokenOverlap(entityText, contextText) {
  const context = normalizeDiseaseText(contextText);
  return meaningfulEntityTokens(entityText).filter((token) => tokenAppears(context, token));
}

function entityFitsPromptContext(entityText, contextText) {
  const tokens = meaningfulEntityTokens(entityText);
  if (!tokens.length) return false;
  return entityTokenOverlap(entityText, contextText).length > 0;
}

function phraseScore(phrase, sourceRank = 0) {
  const tokens = normalizeDiseaseText(phrase).split(" ").filter(Boolean);
  if (tokens.length === 0) return 0;
  const lengthScore = Math.min(36, tokens.length * 9);
  const specificity = tokens.filter((token) => token.length > 5 && !BIOMED_STOPWORDS.has(token)).length * 5;
  const medicalCue = tokens.some((token) => /itis$|osis$|emia$|pathy$|algia$|injury|trauma|syndrome|disease|disorder|defect|failure|pain|tear|rupture|infection|cancer|tumor|rehab|surgery|reconstruction/.test(token)) ? 18 : 0;
  return 42 + lengthScore + specificity + medicalCue - sourceRank;
}

function genericConditionQueries({ extractedDisease, prompt, symptomPhrase, deviceIntent }) {
  const rawContext = [extractedDisease, prompt, symptomPhrase, deviceIntent].filter(Boolean).join(" ");
  const context = normalizeDiseaseText(rawContext);
  const queries = [];
  const add = (query) => {
    const cleaned = normalizeDiseaseText(query);
    const tokens = cleaned.split(" ").filter(Boolean);
    if (!cleaned || tokens.length === 0) return;
    if (tokens.length === 1 && (tokens[0].length < 4 || BIOMED_STOPWORDS.has(tokens[0]))) return;
    if (tokens.every((token) => BIOMED_STOPWORDS.has(token))) return;
    if (!queries.some((item) => item.normalized === cleaned)) {
      queries.push({ text: tokens.join(" "), normalized: cleaned, score: phraseScore(cleaned, queries.length * 2) });
    }
  };

  add(extractedDisease);
  add(symptomPhrase);

  const tokens = context.split(" ").filter((token) => token.length > 2);
  for (let size = 5; size >= 1; size -= 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      const window = tokens.slice(index, index + size);
      if (window[0] && BIOMED_STOPWORDS.has(window[0])) continue;
      if (window[window.length - 1] && BIOMED_STOPWORDS.has(window[window.length - 1])) continue;
      const usefulTokens = window.filter((token) => !BIOMED_STOPWORDS.has(token));
      if (usefulTokens.length === 0) continue;
      if (size > 1 && usefulTokens.length < Math.ceil(size / 2)) continue;
      add(window.join(" "));
    }
  }

  return queries
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

async function pubtatorDiseaseCandidates(input) {
  const candidates = [];
  for (const query of genericConditionQueries(input).slice(0, 7)) {
    try {
      const suggestions = await suggestDiseaseNames(query.text, 4);
      suggestions.forEach((name, index) => {
        addUniqueCandidate(candidates, name, `PubTator suggestion for "${query.text}"`, 92 - index * 4);
      });
    } catch {
      // PubTator is best-effort; local prompt inference remains the fallback.
    }
  }
  return candidates;
}

function diseaseResolverCandidates({ extractedDisease, canonicalDisease, pubtatorCandidates = [], prompt, symptomPhrase, deviceIntent }) {
  const candidates = [];
  const add = (name, reason, score = 0) => addUniqueCandidate(candidates, name, reason, score);
  const contextText = [prompt, symptomPhrase, deviceIntent].filter(Boolean).join(" ");

  [extractedDisease, canonicalDisease].filter(Boolean).forEach((name, index) => {
    if (entityFitsPromptContext(name, contextText)) {
      add(name, index === 0 ? "extracted disease" : "PubTator canonical name", 100 - index * 5);
    }
  });
  for (const candidate of pubtatorCandidates) {
    if (entityFitsPromptContext(candidate.name, contextText)) {
      add(candidate.name, candidate.reason, candidate.score);
    }
  }
  for (const query of genericConditionQueries({ extractedDisease, prompt, symptomPhrase, deviceIntent })) {
    add(query.text, "prompt phrase candidate", query.score);
  }

  return candidates;
}

function scoreDiseaseNode(node, candidate, contextText) {
  const nodeName = normalizeDiseaseText(node?.name);
  const candidateName = candidate.normalized;
  const context = normalizeDiseaseText(contextText);
  if (!nodeName || !candidateName) return -Infinity;

  let score = candidate.score || 0;
  if (nodeName === candidateName) score += 120;
  if (nodeName.includes(candidateName)) score += 70 - Math.min(30, nodeName.length - candidateName.length);
  if (candidateName.includes(nodeName)) score += 55 - Math.min(25, candidateName.length - nodeName.length);

  const candidateTokens = candidateName.split(" ").filter((token) => token.length > 2);
  const nodeTokens = new Set(nodeName.split(" "));
  const overlap = candidateTokens.filter((token) => nodeTokens.has(token)).length;
  score += overlap * 16;
  const contextTokens = new Set(context.split(" ").filter((token) => token.length > 3 && !BIOMED_STOPWORDS.has(token)));
  const contextOverlap = [...nodeTokens].filter((token) => contextTokens.has(token)).length;
  score += contextOverlap * 10;
  const meaningfulCandidateTokens = meaningfulEntityTokens(candidateName);
  const meaningfulNodeTokens = meaningfulEntityTokens(nodeName);
  const meaningfulOverlap = meaningfulCandidateTokens.filter((token) => meaningfulNodeTokens.some((nodeToken) => tokenAppears(nodeToken, token) || tokenAppears(token, nodeToken))).length;
  const meaningfulContextOverlap = meaningfulNodeTokens.filter((token) => tokenAppears(context, token)).length;
  if (meaningfulOverlap === 0 && meaningfulContextOverlap === 0) return -Infinity;
  if (overlap === 0 && contextOverlap === 0) score -= 45;

  score -= Math.max(0, nodeName.length - candidateName.length) * 0.08;
  return score;
}

async function resolveDiseaseForPrimeKG({ extractedDisease, prompt, symptomPhrase, deviceIntent, warnings }) {
  let canonicalDisease = null;
  const baseContextText = [prompt, symptomPhrase, deviceIntent].filter(Boolean).join(" ");
  const extractedDiseaseFitsContext = entityFitsPromptContext(extractedDisease, baseContextText);
  if (extractedDisease && extractedDiseaseFitsContext) {
    try {
      canonicalDisease = await canonicalizeDiseaseName(extractedDisease);
    } catch {
      canonicalDisease = null;
    }
  }

  const contextText = [prompt, extractedDiseaseFitsContext ? extractedDisease : null, canonicalDisease, symptomPhrase, deviceIntent].filter(Boolean).join(" ");
  const pubtatorCandidates = await pubtatorDiseaseCandidates({ extractedDisease: extractedDiseaseFitsContext ? extractedDisease : null, prompt, symptomPhrase, deviceIntent });
  const candidateQueries = diseaseResolverCandidates({ extractedDisease: extractedDiseaseFitsContext ? extractedDisease : null, canonicalDisease, pubtatorCandidates, prompt, symptomPhrase, deviceIntent });
  const scored = [];
  const conditionTokens = extractedDiseaseFitsContext ? meaningfulEntityTokens(extractedDisease) : [];

  for (const candidate of candidateQueries) {
    const exact = primekg.findDiseaseNode(candidate.name);
    if (exact) scored.push({ node: exact, candidate, score: scoreDiseaseNode(exact, candidate, contextText) + 80 });

    for (const node of primekg.searchDiseaseNodes(candidate.name, 80)) {
      scored.push({ node, candidate, score: scoreDiseaseNode(node, candidate, contextText) });
    }
  }

  const conditionAnchoredScored = conditionTokens.length
    ? scored.filter((item) => conditionTokens.some((token) => tokenAppears(item.node.name, token)))
    : scored;

  const deduped = [...conditionAnchoredScored.reduce((map, item) => {
    const existing = map.get(item.node.index);
    if (!existing || item.score > existing.score) map.set(item.node.index, item);
    return map;
  }, new Map()).values()].sort((a, b) => b.score - a.score);

  const best = deduped[0];
  if (!best || best.score < 45) {
    return {
      node: null,
      canonicalDisease,
      queryName: canonicalDisease || (extractedDiseaseFitsContext ? extractedDisease : null),
      candidates: deduped.slice(0, 5).map((item) => ({ name: item.node.name, score: Math.round(item.score), reason: item.candidate.reason }))
    };
  }

  if (best.node.name.toLowerCase() !== String(extractedDisease).toLowerCase()) {
    warnings.push(`Using PrimeKG disease node "${best.node.name}" for extracted disease "${extractedDisease}".`);
  }

  return {
    node: best.node,
    canonicalDisease,
    queryName: best.node.name,
    candidates: deduped.slice(0, 5).map((item) => ({ name: item.node.name, score: Math.round(item.score), reason: item.candidate.reason }))
  };
}

function addUniqueQuery(queries, query) {
  const cleaned = String(query || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return;
  const normalized = cleaned.toLowerCase();
  if (!queries.some((existing) => existing.toLowerCase() === normalized)) queries.push(cleaned);
}

function importantRetrievalTokens(text) {
  return [...new Set(normalizeDiseaseText(text)
    .split(" ")
    .filter((token) => token.length > 2 && !BIOMED_STOPWORDS.has(token)))];
}

const GENERIC_RETRIEVAL_TOKENS = new Set([
  "assistive", "biomedical", "caregiver", "clinical", "comfort", "comfortable", "connected", "continuous", "design",
  "digital", "enabled", "engineering", "feedback", "health", "medical", "monitor", "monitoring", "patient", "patients",
  "portable", "prototype", "reconstruction", "remote", "sensor", "sensors", "smart", "system", "systems", "track", "tracking", "user",
  "users", "wear", "wearable", "wearables", "wireless"
]);

function keywordSet(...texts) {
  return new Set(
    importantRetrievalTokens(texts.filter(Boolean).join(" "))
      .filter((token) => !GENERIC_RETRIEVAL_TOKENS.has(token))
  );
}

function stemToken(token) {
  return String(token || "")
    .replace(/(ization|isations|ations|ation|ments|ment|ness|ing|ers|ies|s)$/i, "")
    .trim();
}

function tokenAppears(text, token) {
  const clean = normalizeDiseaseText(text);
  const normalizedToken = normalizeDiseaseText(token);
  if (!normalizedToken) return false;
  if (normalizedToken.length <= 4) {
    return clean.split(" ").includes(normalizedToken);
  }
  if (clean.includes(normalizedToken)) return true;
  const stem = stemToken(normalizedToken);
  return stem.length >= 5 && clean.includes(stem);
}

function buildPaperRelevanceProfile({ contextText, diseaseQueryName, extraction }) {
  const conditionTerms = keywordSet(diseaseQueryName, extraction?.disease);
  const symptomTerms = keywordSet(extraction?.symptomPhrase);
  const intentTerms = keywordSet(extraction?.deviceIntent);
  const contextTerms = keywordSet(contextText);
  const anchorTerms = new Set([...conditionTerms, ...symptomTerms, ...intentTerms]);
  if (!anchorTerms.size) {
    for (const token of [...contextTerms].slice(0, 8)) anchorTerms.add(token);
  }
  return { conditionTerms, symptomTerms, intentTerms, contextTerms, anchorTerms };
}

function buildLiteratureQueries({ retrievalPrompt, originalPrompt, diseaseQueryName, extraction }) {
  const queries = [];
  const symptom = extraction?.symptomPhrase;
  const intent = extraction?.deviceIntent;
  const promptConcepts = genericConditionQueries({
    extractedDisease: extraction?.disease,
    prompt: [retrievalPrompt, originalPrompt].filter(Boolean).join(" "),
    symptomPhrase: symptom,
    deviceIntent: intent
  });

  addUniqueQuery(queries, retrievalPrompt);
  addUniqueQuery(queries, originalPrompt);
  addUniqueQuery(queries, [diseaseQueryName, symptom, intent].filter(Boolean).join(" "));
  addUniqueQuery(queries, [diseaseQueryName, intent, "monitoring"].filter(Boolean).join(" "));

  for (const concept of promptConcepts.slice(0, 4)) {
    addUniqueQuery(queries, [concept.text, symptom, intent].filter(Boolean).join(" "));
  }

  return queries.slice(0, 5);
}

function scorePaperRelevance(paper, relevanceProfile) {
  const title = normalizeDiseaseText(paper?.title || "");
  const abstract = normalizeDiseaseText(paper?.abstract || "");
  const text = `${title} ${abstract}`;
  const groups = [
    { name: "condition", terms: relevanceProfile.conditionTerms, weight: 6, required: relevanceProfile.conditionTerms.size > 0 },
    { name: "symptom", terms: relevanceProfile.symptomTerms, weight: 4, required: false },
    { name: "intent", terms: relevanceProfile.intentTerms, weight: 3, required: false },
    { name: "context", terms: relevanceProfile.contextTerms, weight: 1, required: false }
  ];
  let score = 0;
  let matchedRequired = !groups.some((group) => group.required);
  let matchedAnchorGroups = 0;

  for (const group of groups) {
    let groupHits = 0;
    for (const token of group.terms) {
      const titleHit = tokenAppears(title, token);
      const abstractHit = tokenAppears(abstract, token);
      if (!titleHit && !abstractHit) continue;
      groupHits += 1;
      score += group.weight * (titleHit ? 2 : 1);
    }
    if (group.required && groupHits > 0) matchedRequired = true;
    if (group.name !== "context" && groupHits > 0) matchedAnchorGroups += 1;
  }

  const anchorHits = [...relevanceProfile.anchorTerms].filter((token) => tokenAppears(text, token)).length;
  if (!matchedRequired && relevanceProfile.conditionTerms.size) return -12;
  if (relevanceProfile.anchorTerms.size && anchorHits === 0) return -8;
  if (matchedAnchorGroups >= 2) score += 6;
  if (title && anchorHits > 0) score += Math.min(8, anchorHits * 2);
  return score;
}

function filterRelevantPapers(papers, relevanceProfile, limit = 10) {
  const scored = papers
    .map((paper) => ({ paper, relevanceScore: scorePaperRelevance(paper, relevanceProfile) }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
  const strong = scored.filter((item) => item.relevanceScore >= 8);
  const usable = strong.length ? strong : scored.filter((item) => item.relevanceScore >= 4);
  return usable.slice(0, limit).map((item) => ({ ...item.paper, relevanceScore: item.relevanceScore }));
}

function buildGuidelineQueries({ retrievalPrompt, originalPrompt, diseaseQueryName, extraction }) {
  const queries = [];
  const focusedTerms = importantRetrievalTokens([originalPrompt, retrievalPrompt, extraction?.symptomPhrase, extraction?.deviceIntent].filter(Boolean).join(" "))
    .filter((token) => !["sensor", "enabled", "health", "monitoring"].includes(token))
    .slice(0, 8)
    .join(" ");

  addUniqueQuery(queries, focusedTerms);
  addUniqueQuery(queries, [extraction?.symptomPhrase, extraction?.deviceIntent].filter(Boolean).join(" "));
  addUniqueQuery(queries, [diseaseQueryName, extraction?.symptomPhrase].filter(Boolean).join(" "));
  addUniqueQuery(queries, retrievalPrompt);
  return queries.filter(Boolean).slice(0, 4);
}

function mergeGuidelineHits(hits) {
  const byKey = new Map();
  for (const hit of hits) {
    const key = `${hit.source}|${hit.title}|${String(hit.text || "").slice(0, 80)}`;
    const existing = byKey.get(key);
    if (!existing || Number(hit.score || 0) > Number(existing.score || 0)) byKey.set(key, hit);
  }
  return [...byKey.values()];
}

function rerankGuidelinesByPrompt(hits, contextText) {
  const contextTokens = importantRetrievalTokens(contextText);
  if (!contextTokens.length) return hits;

  return hits
    .map((hit) => {
      const text = normalizeDiseaseText(`${hit.title || ""} ${hit.text || ""}`);
      const overlap = contextTokens.filter((token) => text.includes(token)).length;
      return { ...hit, lexicalOverlap: overlap, combinedScore: Number(hit.score || 0) + overlap * 0.08 };
    })
    .filter((hit, index) => hit.lexicalOverlap > 0 || index < 2)
    .sort((a, b) => b.combinedScore - a.combinedScore);
}

function enrichExtractionFromPrompt(extraction, retrievalPrompt) {
  const enriched = { ...extraction };

  if (!enriched.deviceIntent) {
    const context = normalizeDiseaseText(retrievalPrompt);
    if (/\b(wearable|monitor|sensor|device|system|tool)\b/.test(context)) {
      enriched.deviceIntent = "sensor-enabled health monitoring device";
    }
  }

  return enriched;
}

async function textFromUploadedDocument(document, warnings) {
  if (!document?.data) return null;
  const name = String(document.name || "uploaded document");
  const mimeType = String(document.type || "");
  const base64 = String(document.data).includes(",") ? String(document.data).split(",").pop() : String(document.data);
  const buffer = Buffer.from(base64, "base64");

  try {
    if (mimeType.includes("pdf") || name.toLowerCase().endsWith(".pdf")) {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        return {
          name,
          type: "pdf",
          text: String(result.text || "").replace(/\s+/g, " ").trim().slice(0, 6000)
        };
      } finally {
        await parser.destroy();
      }
    }

    return {
      name,
      type: mimeType || "text",
      text: buffer.toString("utf8").replace(/\s+/g, " ").trim().slice(0, 6000)
    };
  } catch (error) {
    warnings.push(`Could not read "${name}": ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function parseUploadedDocuments(documents, warnings) {
  const parsed = [];
  for (const document of (documents || []).slice(0, 3)) {
    const item = await textFromUploadedDocument(document, warnings);
    if (item?.text) parsed.push(item);
  }
  return parsed;
}

function summarizeSupplementalDocuments(documents) {
  if (!documents?.length) return "No user-uploaded supplemental documents.";
  return documents.map((document, index) => `[U${index + 1}] ${document.name} (${document.type})\n${document.text.slice(0, 1400)}`).join("\n\n");
}

function compactEvidenceForIdeation(evidenceBlocks) {
  return String(evidenceBlocks || "")
    .split("\n\n")
    .map((block) => block.slice(0, 1800))
    .join("\n\n")
    .slice(0, 6200);
}

function parseEngineeringPrompt(raw, fallback) {
  try {
    const cleaned = raw.trim().replace(/^```json\s*|```$/g, "");
    const parsed = JSON.parse(cleaned);
    const engineeringPrompt = String(parsed.engineeringPrompt || "").trim();
    const plainSummary = String(parsed.plainSummary || "").trim();
    if (!engineeringPrompt) throw new Error("Missing engineeringPrompt");
    return {
      engineeringPrompt,
      plainSummary: plainSummary || "Converted into an engineering-ready retrieval prompt."
    };
  } catch {
    return {
      engineeringPrompt: fallback,
      plainSummary: "Used the original wording as the engineering retrieval prompt."
    };
  }
}

async function normalizePromptForRole(prompt, role, warnings) {
  const normalizedRole = Object.hasOwn(PROMPT_ROLE_LABELS, role) ? role : "common";
  try {
    const raw = await callOllama(
      [
        { role: "system", content: ENGINEERING_PROMPT_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Prompt author: ${PROMPT_ROLE_LABELS[normalizedRole]}\nOriginal request: ${String(prompt).slice(0, 4000)}`
        }
      ],
      { format: "json" }
    );
    const normalized = parseEngineeringPrompt(raw, String(prompt).trim());
    return {
      role: normalizedRole,
      roleLabel: PROMPT_ROLE_LABELS[normalizedRole],
      originalPrompt: String(prompt).trim(),
      ...normalized
    };
  } catch (error) {
    warnings.push(`Prompt normalization failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      role: normalizedRole,
      roleLabel: PROMPT_ROLE_LABELS[normalizedRole],
      originalPrompt: String(prompt).trim(),
      engineeringPrompt: String(prompt).trim(),
      plainSummary: "Used the original wording because prompt normalization failed."
    };
  }
}

async function normalizeRefinementForRole(prompt, role, previousResult, warnings) {
  const normalizedRole = Object.hasOwn(PROMPT_ROLE_LABELS, role) ? role : previousResult?.promptProfile?.role || "common";
  try {
    const raw = await callOllama(
      [
        { role: "system", content: ENGINEERING_PROMPT_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `Prompt author: ${PROMPT_ROLE_LABELS[normalizedRole]}`,
            `Existing engineering prompt: ${previousResult?.promptProfile?.engineeringPrompt || "not recorded"}`,
            `Existing device concept: ${previousResult?.cadLayout?.device || "not recorded"}`,
            `Original refinement request: ${String(prompt).slice(0, 4000)}`,
            "Rewrite this follow-up as an engineering-ready design refinement. Preserve that it is a refinement of the existing device, not a brand-new request."
          ].join("\n")
        }
      ],
      { format: "json" }
    );
    const normalized = parseEngineeringPrompt(raw, String(prompt).trim());
    return {
      role: normalizedRole,
      roleLabel: PROMPT_ROLE_LABELS[normalizedRole],
      originalPrompt: String(prompt).trim(),
      ...normalized
    };
  } catch (error) {
    warnings.push(`Refinement normalization failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      role: normalizedRole,
      roleLabel: PROMPT_ROLE_LABELS[normalizedRole],
      originalPrompt: String(prompt).trim(),
      engineeringPrompt: String(prompt).trim(),
      plainSummary: "Used the original refinement wording because normalization failed."
    };
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
    .map((p, i) => `[${i + 1}] ${p.title} (${p.year || "n.d."}) ${p.venue || ""}${p.source ? ` [${p.source}]` : ""} - ${p.url}\n${(p.abstract || "").slice(0, 400)}`)
    .join("\n\n");
}

function paperKey(paper) {
  if (paper.doi) return `doi:${String(paper.doi).toLowerCase()}`;
  if (paper.pmid) return `pmid:${String(paper.pmid).toLowerCase()}`;
  return `title:${String(paper.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
}

function mergePaperLists(papers) {
  const byKey = new Map();
  for (const paper of papers) {
    if (!paper?.title) continue;
    const key = paperKey(paper);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, paper);
      continue;
    }
    byKey.set(key, {
      ...existing,
      ...Object.fromEntries(Object.entries(paper).filter(([, value]) => value != null && value !== "")),
      authors: existing.authors?.length ? existing.authors : paper.authors,
      abstract: existing.abstract || paper.abstract,
      url: existing.url || paper.url,
      source: [...new Set([existing.source, paper.source].filter(Boolean))].join(" + ")
    });
  }
  return [...byKey.values()];
}

function summarizeGuidelinesForPrompt(hits) {
  if (hits.length === 0) return "No guideline/reference excerpts retrieved.";
  return hits
    .map((h, i) => `[G${i + 1}] ${h.source} - ${h.title} (${h.url})\n${h.text.slice(0, 400)}`)
    .join("\n\n");
}

function summarizeStandardsForPrompt(standards) {
  return standards.map((s) => `${s.standard} (${s.publisher}) - ${s.title}`).join("\n");
}

const PROPOSAL_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

You are given four evidence blocks, all already retrieved - use ONLY these to ground factual claims:
1. PrimeKG knowledge-graph evidence (real graph nodes/edges).
2. Literature API evidence from Semantic Scholar and Europe PMC (real papers).
3. Clinical/interoperability guideline excerpts (real text retrieved from MedlinePlus, ONC SAFER Guides, or USCDI - marked [G1], [G2], ...).
4. A static list of engineering/regulatory standards by name only (their full text was NOT retrieved or indexed due to copyright - treat these strictly as "standards to verify against," never as if you have read their content).

- Explicitly state which user-mentioned symptom(s) correspond to which PrimeKG phenotype node(s), if any. If the graph has no direct edge for a mentioned symptom, say so plainly instead of implying one exists.
- Cite evidence inline using the node names/sources, the [n] paper markers, or the [Gn] guideline markers given.
- Do not invent additional citations, standards content, or graph edges beyond what is provided. For the standards list, only ever say something needs to be verified against them - never state what they require.
- Finish with a "Proposed direction (reasoning only, not implemented)" section: potential wearable/monitoring concepts that follow from the grounded evidence. This is a written design proposal only — do not claim to call any API, hardware, or build anything.`;

const IDEATION_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

Generate multiple early-stage product concept options for a human-in-the-loop biomedical design workflow. These are conceptual imagination cards only, not CAD models and not manufacturing specs.

Respond with ONLY a JSON object, no prose, no markdown fences, matching exactly:
{"summary": string, "recommendedOptionId": string, "options": [{"id": string, "title": string, "formFactor": string, "conceptImagePrompt": string, "plainDescription": string, "professionalDescription": string, "evidenceStrength": {"clinical": number, "literature": number, "engineering": number, "humanFactors": number, "overall": number}, "tradeoffs": [{"label": string, "rating": "low" | "medium" | "high", "detail": string}], "bestFor": string, "watchOut": string, "rationale": string}]}

Rules:
- Return EXACTLY the requested number of options, between 1 and 5.
- Include varied biomedical device forms when appropriate, such as a bottle, glove, cup holder, sword, patch, clip-on, handheld device, textile, wristband, mobile app, or hybrid system.
- If the user explicitly asks for a physical shape or product family such as sword, glove, cup holder, sleeve, shoe, insole, helmet, cup, bottle, ring, belt, or strap, preserve that as the formFactor unless it is unsafe or contradicted by the request.
- If the user asks generically for a "device", "system", "wearable", "tool", or "solution", choose concepts from prior similar device/form-factor signals found in the retrieved papers and evidence notes. Only improvise a new generic form such as clip-on, patch, or handheld when the evidence notes say there are few or no prior device-form signals.
- If the user explicitly asks for an unusual or new form factor, keep that desired form in at least one option and use the same disease, literature, guideline, and knowledge-graph evidence flow to discuss fit, risks, and trade-offs.
- For hydration, sweat, sports, pediatric athlete, drink, water, or bottle prompts, use bottle/container/hydration form factors. Do not use retainer or mouthguard for these prompts.
- Use retainer or mouthguard only when the prompt explicitly mentions oral/dental/saliva/teeth/mouth placement.
- Pick a recommended option using evidence-grounded reasoning across PrimeKG, PubTator, Semantic Scholar, guidelines, standards references, and uploaded documents if present.
- Scores are 0-100 and represent model reasoning from the retrieved evidence and uploaded context, not clinical validation.
- Keep conceptImagePrompt visual and concise. It will be rendered as an in-app conceptual illustration, not as CAD.
- Do not invent citations. Mention exact retrieved markers only when available in the evidence blocks.
- Do not generate CAD components, dimensions, STL instructions, or manufacturing specs here.
- Be clear that all concepts require human review.`;

function clampScore(value, fallback = 60) {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return Math.max(0, Math.min(100, Math.round(score)));
}

const DEVICE_PRIOR_PATTERNS = [
  { formFactor: "sleeve", label: "sleeve/garment", pattern: /\b(sleeve|garment|textile|fabric|wearable garment|smart clothing|shirt|sock)\b/i },
  { formFactor: "cast", label: "brace/orthosis/support", pattern: /\b(brace|orthosis|orthotic|splint|cast|support)\b/i },
  { formFactor: "wristband", label: "wristband/watch/band", pattern: /\b(wristband|wrist band|watch|smartwatch|bracelet|band)\b/i },
  { formFactor: "patch", label: "skin patch/adhesive sensor", pattern: /\b(patch|adhesive|skin mounted|skin-mounted|epidermal)\b/i },
  { formFactor: "clip-on", label: "clip-on/attached module", pattern: /\b(clip|clip-on|attachable|detachable|module|mounted sensor)\b/i },
  { formFactor: "handheld", label: "handheld/portable reader", pattern: /\b(handheld|portable reader|scanner|wand|phone camera|smartphone-based|mobile phone)\b/i },
  { formFactor: "insole", label: "shoe/insole", pattern: /\b(insole|shoe|footwear|gait shoe|smart shoe)\b/i },
  { formFactor: "glove", label: "glove/hand wearable", pattern: /\b(glove|hand wearable|data glove)\b/i },
  { formFactor: "belt", label: "belt/waist strap", pattern: /\b(belt|waist|waistband|trunk strap)\b/i },
  { formFactor: "helmet", label: "helmet/headgear", pattern: /\b(helmet|headgear|head mounted|head-mounted)\b/i },
  { formFactor: "bottle", label: "bottle/container", pattern: /\b(bottle|container|cup|flask)\b/i },
  { formFactor: "mobile app", label: "mobile app/software workflow", pattern: /\b(app|mobile application|smartphone app|software|digital platform|telehealth|remote monitoring)\b/i }
];

function upsertDeviceSignal(signals, formFactor, label, source, title, weight = 1) {
  const existing = signals.get(formFactor) || { formFactor, label, count: 0, examples: [] };
  existing.count += weight;
  if (title && existing.examples.length < 3) {
    existing.examples.push({ title, source });
  }
  signals.set(formFactor, existing);
}

function priorDeviceSignalsFromEvidence({ papers = [], guidelines = [], subgraph = null, prompt = "" }) {
  const signals = new Map();
  for (const paper of papers) {
    const text = `${paper?.title || ""} ${paper?.abstract || ""} ${paper?.venue || ""}`;
    for (const pattern of DEVICE_PRIOR_PATTERNS) {
      if (!pattern.pattern.test(text)) continue;
      const title = paper?.title ? `${paper.title}${paper.year ? ` (${paper.year})` : ""}` : null;
      upsertDeviceSignal(signals, pattern.formFactor, pattern.label, paper?.source || "literature", title, 2);
    }
  }

  for (const hit of guidelines) {
    const text = `${hit?.title || ""} ${hit?.text || ""} ${hit?.source || ""}`;
    for (const pattern of DEVICE_PRIOR_PATTERNS) {
      if (!pattern.pattern.test(text)) continue;
      upsertDeviceSignal(signals, pattern.formFactor, pattern.label, hit?.source || "guideline", hit?.title || null, 1);
    }
  }

  const evidenceText = normalizeDiseaseText([
    prompt,
    subgraph?.disease?.name,
    ...(subgraph?.phenotypes || []).map((node) => node.name),
    ...(guidelines || []).map((hit) => `${hit.title || ""} ${hit.text || ""}`)
  ].filter(Boolean).join(" "));

  const jointOrLimb = /\b(knee|ankle|elbow|shoulder|hip|wrist|joint|limb|leg|arm|ligament|tendon|muscle|mobility|range motion|rehab|rehabilitation|physical therapy|dislocation|sprain|injury)\b/.test(evidenceText);
  const postureOrGait = /\b(gait|walking|balance|step|foot|pressure|posture)\b/.test(evidenceText);
  const breathingOrChest = /\b(respiratory|breath|breathing|oxygen|chest|lung|cough)\b/.test(evidenceText);
  const promptWantsWearable = /\b(wearable|wear|body|continuous|monitor|track|sensor)\b/.test(evidenceText);

  if (jointOrLimb && promptWantsWearable) {
    upsertDeviceSignal(signals, "sleeve", "joint sleeve / textile wearable", "prompt + retrieved guidance", "Body-region rehabilitation and ROM context", 2);
    upsertDeviceSignal(signals, "cast", "brace / orthosis support", "prompt + retrieved guidance", "Joint injury or rehabilitation guidance", 2);
    upsertDeviceSignal(signals, "mobile app", "guided rehab companion app", "prompt + retrieved guidance", "Rehabilitation adherence and feedback workflow", 1);
  }
  if (postureOrGait) {
    upsertDeviceSignal(signals, "insole", "shoe/insole motion sensor", "prompt + retrieved guidance", "Gait, balance, or foot-pressure context", 2);
    upsertDeviceSignal(signals, "belt", "belt/waist motion tracker", "prompt + retrieved guidance", "Posture or trunk-motion context", 1);
  }
  if (breathingOrChest && promptWantsWearable) {
    upsertDeviceSignal(signals, "patch", "chest patch / skin sensor", "prompt + retrieved guidance", "Respiratory monitoring context", 1);
    upsertDeviceSignal(signals, "clip-on", "finger/ear clip sensor", "prompt + retrieved guidance", "Oxygenation or breathing-monitoring context", 1);
  }

  const explicitForm = requestedFormFactorFromPrompt(prompt);
  return [...signals.values()]
    .filter((signal) => !explicitForm || signal.formFactor === explicitForm || signal.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function summarizePriorDeviceSignals(signals = [], prompt = "") {
  const explicitForm = requestedFormFactorFromPrompt(prompt);
  if (!signals.length) {
    return explicitForm
      ? `User explicitly requested "${explicitForm}". No strong prior device-form signals were detected in retrieved papers, so preserve the requested form and explain evidence gaps.`
      : "No strong prior device-form signals were detected in retrieved papers. The ideation model may improvise cautious concept forms, but it should label them as lower-evidence directions.";
  }

  const lines = signals.map((signal, index) => {
    const examples = signal.examples
      .map((example) => `${example.title} [${example.source}]`)
      .join("; ");
    return `${index + 1}. ${signal.label} -> formFactor "${signal.formFactor}" (${signal.count} evidence signal${signal.count === 1 ? "" : "s"}). Examples: ${examples || "retrieved evidence text"}`;
  });

  return [
    explicitForm
      ? `User explicitly requested "${explicitForm}". Preserve that requested form in at least one option even if prior signals suggest other forms.`
      : "User asked generically. Prefer these prior similar device/form-factor signals before inventing a new concept form:",
    ...lines
  ].join("\n");
}

function requestedFormFactorFromPrompt(prompt) {
  const normalized = String(prompt || "").toLowerCase();
  const genericMatch = normalized.match(/\b(?:design|build|make|create|prototype|conceptualize|sketch|generate)\s+(?:me\s+)?(?:a|an|the)?\s*(?:smart|sensorized|connected|adaptive|assistive|training|therapy|medical|biomedical|health|wearable|non-invasive|noninvasive|dumb|simple|rough|conceptual)?\s*([a-z][a-z0-9]*(?:\s+[a-z][a-z0-9]*){0,3}?)(?=\s+(?:that|which|for|to|with|can|could|should|who|where|while|because|and|but|,|\.|$))/);
  const explicitPatterns = [
    ["sword", /\b(smart\s*)?(sword|training\s*sword|foam\s*sword|therapy\s*sword|practice\s*sword|blade\s*prop)\b/],
    ["cup holder", /\b(cup\s*holder|bottle\s*holder|holder\s+for\s+(a\s+)?(cup|bottle)|cup\s*cradle|bottle\s*cradle)\b/],
    ["glove", /\b(glove|mitten|hand\s*wear|smart\s*glove)\b/],
    ["bottle", /\b(water\s*bottle|smart\s*bottle|bottle)\b/],
    ["cup", /\b(smart\s*cup|drinking\s*cup|cup)\b/],
    ["sleeve", /\b(sleeve|arm\s*sleeve|compression\s*sleeve)\b/],
    ["insole", /\b(insole|shoe\s*insert|smart\s*shoe|shoe)\b/],
    ["helmet", /\b(helmet|headgear)\b/],
    ["belt", /\b(belt|waistband)\b/],
    ["ring", /\b(ring)\b/],
    ["textile", /\b(textile|shirt|sock|garment|clothing)\b/],
    ["wristband", /\b(wristband|bracelet|watch|wrist\s*strap)\b/],
    ["mouthguard", /\b(mouthguard|mouth\s*guard)\b/],
    ["retainer", /\b(retainer)\b/],
    ["cast", /\b(cast|splint|brace)\b/],
    ["patch", /\b(patch|adhesive)\b/],
    ["clip-on", /\b(clip\s*on|clip-on|clip|clamp)\b/],
    ["handheld", /\b(handheld|hand-held|scanner|reader|wand)\b/]
  ];
  const explicit = explicitPatterns.find(([, pattern]) => pattern.test(normalized))?.[0];
  if (explicit) return explicit;
  if (!genericMatch) return null;

  const object = normalizeFormFactorName(genericMatch[1])
    .replace(/^(smart|sensorized|connected|adaptive|assistive|training|therapy|medical|biomedical|health|wearable|non invasive|noninvasive|dumb|simple|rough|conceptual)\s+/, "")
    .trim();
  const genericWords = new Set(["system", "device", "tool", "product", "concept", "design", "monitor", "wearable", "assistant", "solution", "thing", "stuff"]);
  if (!object || genericWords.has(object) || object.split(" ").every((word) => genericWords.has(word))) return null;
  return object.slice(0, 48);
}

function normalizeFormFactorName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^clip on$/, "clip-on")
    .replace(/^cupholder$/, "cup holder")
    .replace(/^bottle holder$/, "cup holder");
}

function isHydrationDesignContext(prompt) {
  const normalized = normalizeDiseaseText(prompt);
  const hasHydrationGoal = /\b(water|bottle|hydration|hydrate|drink|fluid intake|dehydration)\b/.test(normalized);
  const hasSweatHydrationGoal = /\b(sweat|sweating|electrolyte|salinity)\b/.test(normalized) && /\b(hydration|dehydration|fluid|water|drink|sports drink)\b/.test(normalized);
  return hasHydrationGoal || hasSweatHydrationGoal;
}

function priorDeviceFallbackOptions(prompt, priorDeviceSignals = [], numOptions = 3) {
  if (!priorDeviceSignals.length || requestedFormFactorFromPrompt(prompt)) return null;
  const selected = priorDeviceSignals.slice(0, Math.max(1, Math.min(5, Number(numOptions) || 3)));
  return {
    summary: `Generated evidence-led concept options from prior similar device signals for: ${prompt}`,
    recommendedOptionId: "option-a",
    options: selected.map((signal, index) => ({
      id: `option-${String.fromCharCode(97 + index)}`,
      title: `${objectLabel(signal.label)} Concept`,
      formFactor: signal.formFactor,
      plainDescription: `A ${signal.label} direction because retrieved evidence for the condition or task points toward this kind of device form.`,
      professionalDescription: `Evidence-led ${signal.formFactor} concept based on retrieved device-form, guideline, graph, or task signals rather than open-ended form-factor improvisation.`,
      conceptImagePrompt: `${signal.formFactor} biomedical concept based on prior literature`,
      evidenceStrength: {
        clinical: 62 + Math.min(10, signal.count * 3),
        literature: 66 + Math.min(14, signal.count * 4),
        engineering: 62 + Math.min(8, signal.count * 2),
        humanFactors: 60 - index,
        overall: 66 + Math.min(10, signal.count * 2) - index * 2
      },
      tradeoffs: [
        { label: "Prior evidence", rating: "high", detail: `${signal.count} retrieved evidence signal${signal.count === 1 ? "" : "s"} point to this kind of form factor.` },
        { label: "Fit to user", rating: "medium", detail: "The form still needs human review for comfort, workflow, and safety in this specific scenario." },
        { label: "Novelty", rating: "low", detail: "This option intentionally follows prior similar solutions instead of inventing a new object." }
      ],
      bestFor: "Generic device requests where previous work suggests a familiar device family.",
      watchOut: "Evidence signals guide the form factor, but this exact concept still needs professional review and validation.",
      rationale: signal.examples?.length
        ? `Based on retrieved evidence signals such as ${signal.examples.map((example) => example.title).join("; ")}.`
        : "Based on retrieved device-form signals."
    }))
  };
}

function evidenceGapFallbackOptions(prompt, numOptions = 3) {
  const options = [
    {
      id: "option-a",
      title: "Evidence-Gap Wearable Concept",
      formFactor: "hybrid",
      plainDescription: "A cautious concept that keeps the device modular until stronger prior-device evidence is found.",
      professionalDescription: "A staged concept intended for cases where retrieval did not surface a clear prior form factor; form selection should be decided through expert review and user testing.",
      bestFor: "Early exploration when the evidence base is thin or unavailable.",
      watchOut: "This is explicitly lower-confidence because prior device examples were not retrieved."
    },
    {
      id: "option-b",
      title: "Human-Reviewed Workflow Concept",
      formFactor: "mobile app",
      plainDescription: "A workflow-first option that records goals, symptoms, and measurements while experts decide what hardware is justified.",
      professionalDescription: "A low-hardware pathway that prioritizes care-team review, data capture, and requirements discovery before committing to a physical form.",
      bestFor: "Clarifying clinical and engineering requirements before hardware selection.",
      watchOut: "It may not solve the physical sensing problem without paired hardware later."
    },
    {
      id: "option-c",
      title: "Modular Evaluation Kit",
      formFactor: "hybrid",
      plainDescription: "A test-kit style concept for comparing candidate sensors and placements before choosing a final device shape.",
      professionalDescription: "A modular evaluation approach for collecting signal-quality and usability evidence before selecting a final wearable or object-based product.",
      bestFor: "Avoiding premature commitment to an unsupported form factor.",
      watchOut: "It is a research/prototyping direction, not a finished consumer device."
    }
  ];
  const selected = options.slice(0, Math.max(1, Math.min(5, Number(numOptions) || 3)));
  return {
    summary: `Generated evidence-gap concept options for: ${prompt}`,
    recommendedOptionId: selected[0].id,
    options: selected.map((option, index) => ({
      ...option,
      conceptImagePrompt: `${option.formFactor} evidence-gap biomedical concept`,
      evidenceStrength: {
        clinical: 45 - index,
        literature: 35 - index,
        engineering: 52 - index,
        humanFactors: 55 - index,
        overall: 48 - index * 3
      },
      tradeoffs: [
        { label: "Evidence gap", rating: "high", detail: "No strong prior device-form signal was retrieved for this prompt." },
        { label: "Flexibility", rating: "high", detail: "The concept keeps options open while more evidence or user input is gathered." },
        { label: "Specificity", rating: "low", detail: "A final device form should wait for clearer evidence or explicit user preference." }
      ],
      rationale: "Fallback generated because no prior device-form evidence was available; it avoids defaulting to patch, clip-on, or handheld."
    }))
  };
}

function fallbackIdeationOptions(prompt, numOptions = 3, priorDeviceSignals = []) {
  const normalized = String(prompt || "").toLowerCase();
  const requestedFormFactor = requestedFormFactorFromPrompt(prompt);
  const hydration = isHydrationDesignContext(prompt);
  const priorFallback = priorDeviceFallbackOptions(prompt, priorDeviceSignals, numOptions);
  if (priorFallback) return priorFallback;
  const explicitShapeOptions = requestedFormFactor && !["bottle"].includes(requestedFormFactor) ? [
    {
      id: "option-a",
      title: `Smart ${requestedFormFactor.replace(/\b\w/g, (letter) => letter.toUpperCase())} Concept`,
      formFactor: requestedFormFactor,
      plainDescription: `A ${requestedFormFactor} concept shaped around the user-requested form, with sensing and feedback only added if they fit the goal.`,
      professionalDescription: `A ${requestedFormFactor} biomedical product concept that preserves the requested geometry while using evidence and human review to decide what hardware is justified.`,
      bestFor: `Requests where the ${requestedFormFactor} shape is part of the desired interaction or fit.`,
      watchOut: "Fit, comfort, cleaning, and the actual need for electronics must be reviewed before detailed design."
    },
    {
      id: "option-b",
      title: `Modular ${requestedFormFactor.replace(/\b\w/g, (letter) => letter.toUpperCase())} Add-On`,
      formFactor: requestedFormFactor,
      plainDescription: `A more modular ${requestedFormFactor} option that keeps the base object familiar and makes sensing pieces removable or serviceable.`,
      professionalDescription: `A modular variant using the requested ${requestedFormFactor} envelope with separable sensing, power, or display modules only when the use case requires them.`,
      bestFor: "Iterating hardware without redesigning the whole product each time.",
      watchOut: "Attachment points and misuse risks need prototyping and user testing."
    },
    {
      id: "option-c",
      title: "Hybrid Companion Concept",
      formFactor: "hybrid",
      plainDescription: `A hybrid option that pairs the ${requestedFormFactor} with a simpler companion tool if the main shape should stay lightweight.`,
      professionalDescription: `A hybrid concept that separates the requested ${requestedFormFactor} interaction from optional sensing, logging, or caregiver workflow support.`,
      bestFor: "Reducing bulk on the main object.",
      watchOut: "Two-part systems can be easier to lose or forget."
    }
  ] : null;
  const hydrationOptions = [
    {
      id: "option-a",
      title: "Smart Hydration Bottle",
      formFactor: "bottle",
      plainDescription: "A child-friendly water bottle concept that tracks drinking patterns and estimates hydration needs around sports activity.",
      professionalDescription: "A smart bottle concept combining drink-volume sensing, activity context, and caregiver-facing hydration reminders for pediatric sports use.",
      bestFor: "Everyday sports hydration with minimal wearable burden.",
      watchOut: "Sweat level estimates need careful validation and should not be treated as medical dehydration diagnosis."
    },
    {
      id: "option-b",
      title: "Bottle + Sweat Patch Kit",
      formFactor: "hybrid",
      plainDescription: "A bottle paired with a small optional sweat patch for practices or games when extra context is useful.",
      professionalDescription: "Hybrid hydration concept combining bottle intake tracking with short-duration sweat sensing for higher-activity sessions.",
      bestFor: "Sports days where sweat context matters more than routine daily hydration.",
      watchOut: "Patch comfort, skin tolerance, and caregiver setup complexity need review."
    },
    {
      id: "option-c",
      title: "Clip-On Bottle Sensor",
      formFactor: "clip-on",
      plainDescription: "A removable sensor clip that can attach to a child’s existing bottle and estimate drinking events.",
      professionalDescription: "Accessory-mounted sensing concept that preserves familiar bottle choice while adding intake tracking and reminders.",
      bestFor: "Families who want to keep using bottles they already own.",
      watchOut: "Clip fit, washing, and measurement accuracy vary by bottle shape."
    },
    {
      id: "option-d",
      title: "Sports Bag Hydration Tag",
      formFactor: "clip-on",
      plainDescription: "A small tag for a sports bag or bottle carrier that reminds the child and caregiver to hydrate during activity.",
      professionalDescription: "Context-aware reminder accessory that trades direct fluid sensing for simpler adherence nudges.",
      bestFor: "Low-cost reminders and routines for young athletes.",
      watchOut: "It does not directly measure sweat or fluid intake without paired inputs."
    },
    {
      id: "option-e",
      title: "Caregiver Hydration Companion App",
      formFactor: "mobile app",
      plainDescription: "An app concept for caregivers to log sports sessions, bottle refills, and hydration reminders.",
      professionalDescription: "Caregiver workflow concept for combining self-report, schedule context, and device data when available.",
      bestFor: "Parent-guided hydration routines across practices and games.",
      watchOut: "Manual logging can be inconsistent and should be easy to skip or correct."
    }
  ];
  if (!explicitShapeOptions && !hydration) return evidenceGapFallbackOptions(prompt, numOptions);
  const baseOptions = explicitShapeOptions || hydrationOptions;
  const selected = baseOptions.slice(0, Math.max(1, Math.min(5, Number(numOptions) || 3)));
  return {
    summary: `Generated early concept options for: ${prompt}`,
    recommendedOptionId: selected[0].id,
    options: selected.map((option, index) => ({
      ...option,
      conceptImagePrompt: `${option.formFactor} biomedical concept illustration`,
      evidenceStrength: {
        clinical: 58 + index * 3,
        literature: 62 - index * 2,
        engineering: 64 - index,
        humanFactors: 60 + index,
        overall: 64 - index * 3
      },
      tradeoffs: [
        { label: "Comfort", rating: index === 0 ? "high" : "medium", detail: "Needs human review with target users." },
        { label: "Signal quality", rating: "medium", detail: "Depends on sensor placement and validation data." },
        { label: "Manufacturability", rating: "medium", detail: "Early concept only, before CAD or detailed specifications." }
      ],
      rationale: "Fallback concept generated from common biomedical form factors because the ideation model output could not be parsed."
    }))
  };
}

function sanitizeIdeationFormFactor(formFactor, prompt) {
  const allowed = ["bottle", "cup", "cup holder", "sword", "glove", "sleeve", "insole", "helmet", "belt", "ring", "retainer", "mouthguard", "patch", "cast", "clip-on", "handheld", "wristband", "textile", "mobile app", "hybrid"];
  const requested = normalizeFormFactorName(formFactor || "hybrid");
  const context = String(prompt || "").toLowerCase();
  const explicitRequest = requestedFormFactorFromPrompt(prompt);
  const oralContext = /\b(mouth|oral|dental|tooth|teeth|gum|saliva|palate|bite|brux|mouthguard|retainer)\b/.test(context);
  const hydrationContext = isHydrationDesignContext(prompt);
  if (explicitRequest && !["retainer", "mouthguard"].includes(requested)) return explicitRequest;
  if (hydrationContext && (requested === "retainer" || requested === "mouthguard")) return "bottle";
  if ((requested === "retainer" || requested === "mouthguard") && !oralContext) return hydrationContext ? "bottle" : "hybrid";
  if (hydrationContext && ["patch", "cast"].includes(requested)) return "hybrid";
  return allowed.includes(requested) ? requested : explicitRequest || (hydrationContext ? "bottle" : "hybrid");
}

function repairIdeationForContext(ideation, prompt, numOptions, priorDeviceSignals = []) {
  if (!ideation?.options?.length) return ideation;
  const explicitForm = requestedFormFactorFromPrompt(prompt);

  if (!explicitForm && priorDeviceSignals.length) {
    const priorForms = new Set(priorDeviceSignals.map((signal) => signal.formFactor));
    const usesPriorForm = ideation.options.some((option) => priorForms.has(normalizeFormFactorName(option.formFactor)));
    const genericDrift = ideation.options.some((option) => {
      const form = normalizeFormFactorName(option.formFactor);
      const text = `${option.title} ${option.plainDescription} ${option.professionalDescription}`.toLowerCase();
      return ["patch", "clip-on", "handheld", "hybrid"].includes(form) && !priorForms.has(form) && /\b(generic|general|could|concept)\b/.test(text);
    });
    if (!usesPriorForm || genericDrift) {
      return priorDeviceFallbackOptions(prompt, priorDeviceSignals, numOptions) || ideation;
    }
  }

  return ideation;
}

function parseIdeation(raw, prompt, numOptions, priorDeviceSignals = []) {
  try {
    const cleaned = raw.trim().replace(/^```json\s*|```$/g, "");
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.options)) throw new Error("Missing options");
    const requestedCount = Math.max(1, Math.min(5, Number(numOptions) || 3));
    const options = parsed.options.slice(0, requestedCount).map((option, index) => {
      const scores = option.evidenceStrength || {};
      return {
        id: String(option.id || `option-${index + 1}`),
        title: String(option.title || `Concept Option ${index + 1}`),
        formFactor: sanitizeIdeationFormFactor(option.formFactor, prompt),
        conceptImagePrompt: String(option.conceptImagePrompt || option.title || "biomedical product concept"),
        plainDescription: String(option.plainDescription || option.summary || ""),
        professionalDescription: String(option.professionalDescription || option.rationale || ""),
        evidenceStrength: {
          clinical: clampScore(scores.clinical),
          literature: clampScore(scores.literature),
          engineering: clampScore(scores.engineering),
          humanFactors: clampScore(scores.humanFactors),
          overall: clampScore(scores.overall)
        },
        tradeoffs: Array.isArray(option.tradeoffs) ? option.tradeoffs.slice(0, 5).map((tradeoff) => ({
          label: String(tradeoff.label || "Trade-off"),
          rating: ["low", "medium", "high"].includes(tradeoff.rating) ? tradeoff.rating : "medium",
          detail: String(tradeoff.detail || "")
        })) : [],
        bestFor: String(option.bestFor || ""),
        watchOut: String(option.watchOut || ""),
        rationale: String(option.rationale || "")
      };
    });
    if (options.length < requestedCount) {
      const fallback = fallbackIdeationOptions(prompt, requestedCount, priorDeviceSignals).options;
      for (const fallbackOption of fallback) {
        if (options.length >= requestedCount) break;
        if (!options.some((option) => option.title.toLowerCase() === fallbackOption.title.toLowerCase())) {
          options.push({ ...fallbackOption, id: `option-${options.length + 1}` });
        }
      }
    }
    if (options.length === 0) throw new Error("No options");
    return repairIdeationForContext({
      summary: String(parsed.summary || `Generated ${options.length} concept options.`),
      recommendedOptionId: options.some((option) => option.id === parsed.recommendedOptionId)
        ? String(parsed.recommendedOptionId)
        : options.reduce((best, option) => option.evidenceStrength.overall > best.evidenceStrength.overall ? option : best, options[0]).id,
      options
    }, prompt, numOptions, priorDeviceSignals);
  } catch {
    return fallbackIdeationOptions(prompt, numOptions, priorDeviceSignals);
  }
}

function objectLabel(value) {
  return String(value || "")
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function objectSpecificOption(option, requestedFormFactor, index) {
  const label = objectLabel(requestedFormFactor);
  const variant = index === 0 ? "Baseline" : index === 1 ? "Modular" : index === 2 ? "Lightweight" : `Variant ${index + 1}`;
  return {
    ...option,
    title: option.title && !/\b(patch|clip|bracelet|mouthguard|retainer|cast)\b/i.test(option.title)
      ? option.title
      : `${variant} Smart ${label}`,
    formFactor: requestedFormFactor,
    conceptImagePrompt: `${requestedFormFactor} concept object with simple sensing modules`,
    plainDescription: `A rough smart ${requestedFormFactor} concept that keeps the requested object shape and adds only the sensing or feedback needed for the task.`,
    professionalDescription: `A concept-level ${requestedFormFactor} form that preserves the user's requested object and uses evidence-informed reasoning to place only justified measurement, feedback, or caregiver workflow elements.`,
    bestFor: option.bestFor || `Exploring whether a ${requestedFormFactor} interaction can support the requested health or mobility goal.`,
    watchOut: option.watchOut || "The object shape is intentionally conceptual; ergonomics, safety, clinical relevance, and misuse risk need human review.",
    rationale: option.rationale || `The user explicitly requested a ${requestedFormFactor}; the concept should not default to an unrelated patch or clip-on form.`
  };
}

function preserveRequestedObjectIdeation(ideation, prompt) {
  const requestedFormFactor = requestedFormFactorFromPrompt(prompt);
  if (!requestedFormFactor || !ideation?.options?.length) return ideation;
  const options = ideation.options.map((option, index) => {
    const current = normalizeFormFactorName(option.formFactor);
    if (current === requestedFormFactor) return option;
    if (["retainer", "mouthguard"].includes(current) && !/\b(mouth|oral|dental|tooth|teeth|gum|saliva|palate|bite|brux|mouthguard|retainer)\b/i.test(prompt)) {
      return objectSpecificOption(option, requestedFormFactor, index);
    }
    return objectSpecificOption(option, requestedFormFactor, index);
  });
  return {
    ...ideation,
    summary: ideation.summary && ideation.summary.toLowerCase().includes(requestedFormFactor)
      ? ideation.summary
      : `Generated ${options.length} ${requestedFormFactor} concept option${options.length === 1 ? "" : "s"} while preserving the requested object form.`,
    recommendedOptionId: options.some((option) => option.id === ideation.recommendedOptionId) ? ideation.recommendedOptionId : options[0].id,
    options
  };
}

async function generateIdeation({ prompt, promptProfile, evidenceBlocks, supplementalDocuments, numOptions, papers, guidelines: guidelineHits = [], subgraph = null, warnings }) {
  const preservationPrompt = `${promptProfile.originalPrompt || ""}\n${prompt}`;
  const priorDeviceSignals = priorDeviceSignalsFromEvidence({ papers, guidelines: guidelineHits, subgraph, prompt: preservationPrompt });
  const priorDeviceEvidence = summarizePriorDeviceSignals(priorDeviceSignals, preservationPrompt);
  try {
    const raw = await callOllama(
      [
        { role: "system", content: IDEATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `Original user prompt: ${promptProfile.originalPrompt}`,
            `Prompt author: ${promptProfile.roleLabel}`,
            `Engineering retrieval prompt: ${prompt}`,
            `Requested options: ${numOptions}`,
            "",
            `Prior similar device/form-factor evidence:\n${priorDeviceEvidence}`,
            "",
            compactEvidenceForIdeation(evidenceBlocks),
            "",
            `Uploaded supplemental documents:\n${summarizeSupplementalDocuments(supplementalDocuments)}`
          ].join("\n")
        }
      ],
      { format: "json" }
    );
    return preserveRequestedObjectIdeation(parseIdeation(raw, preservationPrompt, numOptions, priorDeviceSignals), preservationPrompt);
  } catch (error) {
    warnings.push(`Concept ideation failed: ${error instanceof Error ? error.message : String(error)}`);
    return preserveRequestedObjectIdeation(fallbackIdeationOptions(preservationPrompt, numOptions, priorDeviceSignals), preservationPrompt);
  }
}

const CAD_LAYOUT_SYSTEM_PROMPT = `You turn an already-written health device proposal into a form factor and short list of physical components for an illustrative CAD preview - not a manufacturing drawing. A separate deterministic renderer decides the exact 3D shapes and layout; your job is to choose the broad product form and name the right parts grounded in evidence.

Respond with ONLY a JSON object, no prose, no markdown fences, matching exactly:
{"device": string, "formFactor": string, "dimensions": {"lengthMm": number, "widthMm": number, "heightMm": number}, "components": [{"id": string, "type": string, "material": string, "groundedIn": string, "placement": string}], "caveat": string}

Rules:
- Choose "mouthguard" only when the original prompt or proposal explicitly mentions oral/dental/biting/bruxism/saliva/palate context. Never use it as a generic wearable default.
- Choose "cast" for limb support, fracture, immobilization, orthopedic, or rehab concepts.
- Choose "patch" for skin adhesive, chest, glucose, ECG, temperature, wound, or low-profile body-worn concepts.
- Choose "handheld" for scanner, inhaler-like, grip, portable reader, or non-worn concepts.
- Choose "clip-on" for finger, ear, clothing, inhaler, cane, wheelchair, tube, or accessory-mounted concepts.
- Choose "wristband" only for wrist/bracelet/watch/band concepts.
- Preserve explicit requested product forms such as "sword", "glove", "cup holder", "bottle", "cup", "sleeve", "insole", "helmet", "belt", or "ring" instead of converting them to patch or clip-on.
- For breathing, respiratory, shortness-of-breath, or cough concepts, prefer "patch", "clip-on", or "handheld" unless the user explicitly asks for a wrist, oral, or cast design.
- 4-8 components. Typical parts may include a main housing/PCB/controller, sensors, battery, enclosure, strap/adhesive/cast shell/mouthguard base depending on the form factor.
- "type" is a short human label for the part (e.g. "Pulse oximeter sensor"), not a geometric shape.
- "dimensions" are approximate outer envelope dimensions in millimeters for the illustrative preview. Use realistic concept-scale values for the chosen form factor.
- "placement" should be a short physical location hint like "inner molar channel", "dorsal cast shell", "central adhesive island", "front face", "hinge side", or "underside contact pad".
- "groundedIn" must name the SPECIFIC evidence behind that component's inclusion or material choice (a PrimeKG anatomy/phenotype node, a [n] paper marker, a [Gn] guideline marker, or the proposal text). If a component is purely illustrative with no evidence behind it, say "illustrative only - no direct evidence" rather than inventing a justification.
- "caveat" must plainly state this is an illustrative generic layout for the chosen form factor, not manufacturing/engineering specifications.
- Do not invent evidence markers that were not given to you.`;

function inferCadFormFactor(text) {
  const normalized = String(text || "").toLowerCase();
  const explicitRequest = requestedFormFactorFromPrompt(normalized);
  if (explicitRequest) return explicitRequest;
  if (/\b(mouth|oral|dental|tooth|teeth|gum|saliva|palate|bite|brux|mouthguard)\b/.test(normalized)) return "mouthguard";
  if (/\b(cast|splint|orthopedic|fracture|immobil|limb|ankle|rehab)\b/.test(normalized)) return "cast";
  if (/\b(bottle|hydration|water|drink|cup|container|flask)\b/.test(normalized)) return "bottle";
  if (/\b(finger|ear|earlobe|clip|clamp|cane|wheelchair|tube|accessory|inhaler-mounted)\b/.test(normalized)) return "clip-on";
  if (/\b(handheld|scanner|reader|wand|grip|portable|spirometer|inhaler)\b/.test(normalized)) return "handheld";
  if (/\b(patch|adhesive|skin|chest|ecg|wound|glucose|insulin|temperature|respiratory|breathing|shortness of breath|cough)\b/.test(normalized)) return "patch";
  if (/\b(wrist|bracelet|watch|band)\b/.test(normalized)) return "wristband";
  return "adaptive";
}

function sanitizeCadFormFactor(requested, context) {
  const allowed = ["wristband", "mouthguard", "retainer", "cast", "patch", "handheld", "clip-on", "bottle", "cup", "cup holder", "sword", "glove", "sleeve", "insole", "helmet", "belt", "ring", "textile", "hybrid", "adaptive"];
  const normalized = String(context || "").toLowerCase();
  const explicitRequest = requestedFormFactorFromPrompt(normalized);
  const cleanRequested = normalizeFormFactorName(requested);
  if (explicitRequest && !["mouthguard", "retainer"].includes(cleanRequested)) return explicitRequest;
  if (!allowed.includes(cleanRequested)) return inferCadFormFactor(normalized);
  if (requested === "mouthguard" && !/\b(mouth|oral|dental|tooth|teeth|gum|saliva|palate|bite|brux|mouthguard)\b/.test(normalized)) {
    return inferCadFormFactor(normalized.replace(/\bmouthguard\b/g, ""));
  }
  return cleanRequested;
}

function parseCadLayout(raw, context = "") {
  try {
    const cleaned = raw.trim().replace(/^```json\s*|```$/g, "");
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.components)) return null;

    const components = parsed.components
      .filter((c) => c && (c.id || c.type))
      .slice(0, 10)
      .map((c, i) => ({
        id: String(c.id || `component-${i + 1}`),
        type: String(c.type || c.id || "component"),
        material: String(c.material || "unspecified"),
        groundedIn: String(c.groundedIn || "illustrative only - no direct evidence"),
        placement: String(c.placement || "")
      }));

    if (components.length === 0) return null;
    const dimensions = parsed.dimensions && typeof parsed.dimensions === "object"
      ? {
          lengthMm: Number(parsed.dimensions.lengthMm) || null,
          widthMm: Number(parsed.dimensions.widthMm) || null,
          heightMm: Number(parsed.dimensions.heightMm) || null
        }
      : null;
    return {
      device: String(parsed.device || "Wearable concept"),
      formFactor: sanitizeCadFormFactor(parsed.formFactor, context),
      dimensions,
      components,
      caveat: String(parsed.caveat || "Illustrative generic layout for the selected form factor - not manufacturing specifications.")
    };
  } catch {
    return null;
  }
}

async function generateCadLayout({ prompt, proposal, evidenceBlocks, warnings }) {
  try {
    const cadLayoutRaw = await callOllama(
      [
        { role: "system", content: CAD_LAYOUT_SYSTEM_PROMPT },
        { role: "user", content: `Original design prompt: ${prompt}\n\nProposal:\n${proposal}\n\n${evidenceBlocks}` }
      ],
      { format: "json" }
    );
    const cadLayout = parseCadLayout(cadLayoutRaw, `${prompt}\n\n${proposal}`);
    if (!cadLayout) warnings.push("Could not generate a CAD layout preview for this proposal.");
    return cadLayout;
  } catch (error) {
    warnings.push(`CAD layout generation failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function conceptEvidenceSummary(result, concept) {
  const anchors = [];
  if (result?.subgraph?.disease?.name) anchors.push(`PrimeKG disease node: ${result.subgraph.disease.name}`);
  if (result?.subgraph?.phenotypes?.length) anchors.push(`Phenotypes: ${result.subgraph.phenotypes.slice(0, 2).map((node) => node.name).join(", ")}`);
  if (result?.literature?.length) anchors.push(`Literature: ${result.literature[0].title}`);
  if (result?.guidelines?.length) anchors.push(`Guidance: ${result.guidelines[0].source} - ${result.guidelines[0].title}`);
  if (concept?.rationale) anchors.push(`Concept rationale: ${String(concept.rationale).slice(0, 140)}`);
  return anchors.slice(0, 3).join(" | ") || "selected ideation concept";
}

function impactValue(label, concept, offset = 0) {
  const scores = concept?.evidenceStrength || {};
  const base = label === "Clinical"
    ? scores.clinical
    : label === "Engineering"
      ? scores.engineering
      : label === "Human Factors"
        ? scores.humanFactors
        : scores.overall;
  return clampScore((Number(base) || 62) + offset);
}

function componentSpec(id, type, material, placement, constraint, impactLabel, impact, groundedIn) {
  return {
    id,
    type,
    material,
    placement,
    constraint,
    impactLabel,
    impact,
    groundedIn
  };
}

function deterministicCadLayoutFromConcept({ result, concept }) {
  const context = [
    result?.promptProfile?.engineeringPrompt,
    concept?.title,
    concept?.formFactor,
    concept?.plainDescription,
    concept?.professionalDescription
  ].filter(Boolean).join(" ");
  const formFactor = sanitizeCadFormFactor(concept?.formFactor, context);
  const evidence = conceptEvidenceSummary(result, concept);
  const deviceName = concept?.title || `${formFactor} engineering concept`;
  const dimensionsByForm = {
    mouthguard: { lengthMm: 70, widthMm: 55, heightMm: 12 },
    retainer: { lengthMm: 68, widthMm: 52, heightMm: 10 },
    cast: { lengthMm: 180, widthMm: 85, heightMm: 45 },
    bottle: { lengthMm: 72, widthMm: 72, heightMm: 185 },
    patch: { lengthMm: 64, widthMm: 38, heightMm: 7 },
    handheld: { lengthMm: 112, widthMm: 54, heightMm: 18 },
    "clip-on": { lengthMm: 46, widthMm: 28, heightMm: 22 },
    wristband: { lengthMm: 48, widthMm: 42, heightMm: 14 },
    sword: { lengthMm: 720, widthMm: 95, heightMm: 38 },
    glove: { lengthMm: 190, widthMm: 105, heightMm: 18 },
    "cup holder": { lengthMm: 92, widthMm: 92, heightMm: 82 },
    cup: { lengthMm: 80, widthMm: 80, heightMm: 110 },
    sleeve: { lengthMm: 220, widthMm: 92, heightMm: 24 },
    insole: { lengthMm: 250, widthMm: 90, heightMm: 12 },
    helmet: { lengthMm: 210, widthMm: 170, heightMm: 125 },
    belt: { lengthMm: 260, widthMm: 48, heightMm: 16 },
    ring: { lengthMm: 28, widthMm: 28, heightMm: 8 },
    textile: { lengthMm: 90, widthMm: 60, heightMm: 5 },
    hybrid: { lengthMm: 72, widthMm: 42, heightMm: 12 },
    adaptive: { lengthMm: 96, widthMm: 54, heightMm: 20 }
  };
  const dimensions = dimensionsByForm[formFactor] || dimensionsByForm.adaptive;
  const baseType = formFactor === "patch" ? "Flexible adhesive base"
    : formFactor === "bottle" ? "Bottle body and smart cap"
    : formFactor === "sword" ? "Training sword body, grip, guard, and blade prop"
    : formFactor === "cup" ? "Cup body and rim interface"
    : formFactor === "cup holder" ? "Cup holder cradle and retaining rim"
    : formFactor === "glove" ? "Wearable glove body and finger channels"
    : formFactor === "sleeve" ? "Flexible sleeve body"
    : formFactor === "insole" ? "Footbed and insole support layer"
    : formFactor === "helmet" ? "Headgear shell and comfort liner"
    : formFactor === "belt" ? "Adjustable belt body"
    : formFactor === "ring" ? "Ring band and inner contact surface"
    : formFactor === "mouthguard" || formFactor === "retainer" ? "Biocompatible oral base"
    : formFactor === "cast" ? "Semi-rigid support shell"
    : formFactor === "clip-on" ? "Clip housing and soft contact pad"
    : formFactor === "handheld" ? "Handheld enclosure"
    : formFactor === "wristband" ? "Adjustable wearable band"
    : "Requested-form enclosure";
  const signalText = `${context} ${result?.extraction?.symptomPhrase || ""} ${result?.extraction?.deviceIntent || ""}`.toLowerCase();
  const conceptText = `${signalText} ${concept?.title || ""} ${concept?.bestFor || ""}`.toLowerCase();
  const usesElectronics = /\b(track|monitor|sensor|smart|app|alert|sync|bluetooth|wireless|measure|level|volume|hydrate|sweat|pulse|oxygen|respir|motion|temperature)\b/.test(conceptText);
  const needsSensor = /\b(track|monitor|sensor|measure|detect|level|volume|sweat|hydration|pulse|oxygen|respir|motion|temperature|glucose|pressure)\b/.test(conceptText);
  const needsConnectivity = /\b(app|caregiver|parent|sync|phone|bluetooth|wireless|dashboard|notification)\b/.test(conceptText);
  const needsAlert = /\b(alert|remind|notification|warn|nudge|alarm|status)\b/.test(conceptText);
  const components = [
    componentSpec("base-interface", baseType, "material selected for comfort, durability, cleaning, and human review", ["bottle", "cup", "cup holder"].includes(formFactor) ? "primary container or holder body" : "body-facing or user-facing interface", "Must be reviewed for fit, cleaning, repeated use, age appropriateness, and misuse risk.", "Human Factors", impactValue("Human Factors", concept, 2), evidence)
  ];
  if (needsSensor) {
    const sensorType = /\b(water|bottle|hydration|drink|volume|refill)\b/.test(conceptText)
      ? "Fluid intake / fill-level sensing"
      : /\b(sweat|salinity|electrolyte|biofluid)\b/.test(conceptText)
        ? "Sweat or biofluid sensing"
        : /\b(respir|breath|dyspnea|shortness|cough|spo2|oxygen|pulse)\b/.test(conceptText)
          ? "Respiratory and pulse-ox sensing"
          : /\b(neurologic|neurological|motion|fall|tremor|acceler)\b/.test(conceptText)
            ? "Motion and event sensing"
            : "Primary sensing module";
    components.push(componentSpec("sensing-module", sensorType, "sealed sensing package chosen for the target signal", ["bottle", "cup", "cup holder"].includes(formFactor) ? "rim, base, wall, or retaining cradle measurement zone" : "highest-signal contact zone", "Sensor choice and placement must be validated against the real-world signal, not assumed from the concept.", "Clinical", impactValue("Clinical", concept, 3), evidence));
  }
  if (usesElectronics) {
    components.push(componentSpec("control-module", "Low-power control module", "compact controller integrated only if active sensing or logic is required", ["bottle", "cup", "cup holder"].includes(formFactor) ? "protected rim, base, or cradle cavity" : "protected electronics pocket", "Firmware, electrical isolation, data handling, and failure behavior require engineering review.", "Engineering", impactValue("Engineering", concept, 2), "IEC 60601-1, IEC 62304, and selected concept rationale"));
    components.push(componentSpec("power-plan", "Power source / charging strategy", "battery, replaceable cell, or passive/no-battery strategy to be selected during engineering", "separated from pressure, fluid, and child-accessible zones", "Power is included only because this concept uses active electronics; thermal and charging safety need review.", "Safety", impactValue("Overall", concept, -2), "IEC 60601-1 and selected concept rationale"));
  }
  if (needsConnectivity) {
    components.push(componentSpec("connectivity", "Caregiver/app connectivity", "Bluetooth or near-field sync module if the workflow needs phone/caregiver review", "near controller or protected electronics area", "Connectivity should minimize setup burden, protect privacy, and fail gracefully without hiding risk.", "Human Factors", impactValue("Human Factors", concept, 1), "Caregiver workflow and selected concept rationale"));
  }
  if (needsAlert) {
    components.push(componentSpec("feedback-cue", "User feedback cue", "LED, haptic, or app-only reminder depending on age and setting", "visible user-facing surface", "Alerts must be understandable and avoid alarm fatigue, false reassurance, or distraction.", "Human Factors", impactValue("Human Factors", concept, -1), "IEC 62366-1 usability review and selected concept rationale"));
  }
  if (!usesElectronics) {
    components.push(componentSpec("passive-marker", "Passive measurement or labeling feature", "printed scale, color-change material, or manual log area", "visible user-facing surface", "Passive concepts reduce electronics burden but rely on user/caregiver consistency.", "Human Factors", impactValue("Human Factors", concept, 0), "Selected concept rationale"));
  }
  return {
    device: `${deviceName} Engineering Spec`,
    formFactor,
    dimensions,
    components: components.slice(0, 7),
    caveat: "Engineering-spec concept preview only. The geometry, materials, electronics, and constraints require qualified human review before clinical, safety, regulatory, or manufacturing use."
  };
}

function directCadResultFromPrompt({ prompt, audience, documents = [], warnings = [] }) {
  const standards = getRelevantStandards();
  const cleanPrompt = String(prompt || "").trim();
  const formFactor = requestedFormFactorFromPrompt(cleanPrompt) || inferCadFormFactor(cleanPrompt);
  const titleForm = formFactor === "adaptive" ? "CAD Device" : formFactor.replace(/\b\w/g, (letter) => letter.toUpperCase());
  const hasErgonomics = /\b(height|weight|comfort|comfortable|fit|size|sizing|ergonomic|child|adult|senior|wear|strap|skin|soft|adjustable)\b/i.test(cleanPrompt);
  const concept = {
    id: "phase2-direct-cad",
    title: `${titleForm} CAD Concept`,
    formFactor,
    conceptImagePrompt: `${formFactor} engineering CAD concept`,
    plainDescription: `Direct Phase 2 CAD/spec request for: ${cleanPrompt}`,
    professionalDescription: [
      `CAD-only engineering concept for a ${formFactor} request.`,
      hasErgonomics
        ? "The prompt includes ergonomic or sizing cues, so comfort, adjustability, and fit are treated as first-class constraints."
        : "No biological evidence anchor was required; ergonomics, comfort, fit, cleaning, durability, and standards review drive the concept."
    ].join(" "),
    evidenceStrength: {
      clinical: 0,
      literature: 0,
      engineering: 72,
      humanFactors: hasErgonomics ? 74 : 66,
      overall: hasErgonomics ? 70 : 64
    },
    tradeoffs: [
      { label: "Biological context", rating: "low", detail: "Phase 2 only mode intentionally skips disease/graph/literature grounding unless the user provides it." },
      { label: "Engineering standards", rating: "medium", detail: "Standards are listed as verify-against references, not interpreted as full requirements." },
      { label: "Comfort and fit", rating: hasErgonomics ? "high" : "medium", detail: hasErgonomics ? "Prompt sizing and comfort cues are included in the engineering constraints." : "Fit should be refined with user measurements such as height, weight, circumference, and comfort preferences." }
    ],
    bestFor: "Direct CAD shape/spec exploration when the user already knows the object family.",
    watchOut: "This is not clinically grounded. It is an engineering concept preview that still needs human review.",
    rationale: "Generated from a Phase 2-only CAD prompt, using requested object form and engineering constraints rather than biomedical evidence retrieval."
  };
  const result = {
    kgGrounded: false,
    promptProfile: {
      role: audience || "engineer",
      roleLabel: PROMPT_ROLE_LABELS[audience] || "Engineer",
      originalPrompt: cleanPrompt,
      engineeringPrompt: cleanPrompt
    },
    supplementalDocuments: documents,
    extraction: {
      disease: null,
      symptomPhrase: null,
      deviceIntent: `${formFactor} CAD design`
    },
    subgraph: null,
    literature: [],
    guidelines: [],
    standardsReferenced: standards,
    proposal: `Phase 2 CAD-only concept for: ${cleanPrompt}`,
    ideation: {
      summary: `Direct Phase 2 CAD/spec concept for: ${cleanPrompt}`,
      recommendedOptionId: concept.id,
      options: [concept]
    },
    selectedConcept: concept,
    cadLayout: null,
    warnings
  };
  return {
    ...result,
    cadLayout: deterministicCadLayoutFromConcept({ result, concept })
  };
}

function buildCadqueryStl(layout) {
  const workDir = mkdtempSync(path.join(tmpdir(), "smart-health-cadquery-"));
  const outputPath = path.join(workDir, "model.stl");
  try {
    const scriptPath = path.join(__dirname, "scripts", "cadquery_generator.py");
    const run = spawnSync("python3", [scriptPath, outputPath], {
      input: JSON.stringify(layout),
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 8
    });
    if (run.status !== 0) {
      throw new Error((run.stderr || run.stdout || "CadQuery generation failed").trim());
    }
    return readFileSync(outputPath);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function evidenceBlocksFromResult(result) {
  const standards = result.standardsReferenced || getRelevantStandards();
  return [
    result.subgraph ? `PrimeKG evidence:\n${summarizeSubgraphForPrompt(result.subgraph)}` : "PrimeKG evidence: none (no graph match).",
    `Literature evidence:\n${summarizeLiteratureForPrompt(result.literature || [])}`,
    `Clinical/interoperability guideline evidence:\n${summarizeGuidelinesForPrompt(result.guidelines || [])}`,
    `Standards to verify against (names only, not full-text retrieved):\n${summarizeStandardsForPrompt(standards)}`,
    `User-uploaded supplemental documents:\n${summarizeSupplementalDocuments(result.supplementalDocuments || [])}`
  ].join("\n\n");
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return sendJson(res, 204, {});
  }

  if (req.method === "GET" && req.url === "/api/health") {
    return sendJson(res, 200, { ok: true, model: OLLAMA_MODEL, kgAvailable: primekg.isAvailable() });
  }

  if (req.method === "POST" && req.url === "/api/auth/signup") {
    try {
      const body = await readJson(req);
      const validationError = validateAuthInput(body, "signup");
      if (validationError) return sendJson(res, 400, { error: validationError });

      const email = normalizeEmail(body.email);
      const name = String(body.name).trim();
      const existing = authDb.prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (existing) return sendJson(res, 409, { error: "An account already exists for this email." });

      const { salt, hash } = hashPassword(body.password);
      const result = authDb
        .prepare("INSERT INTO users (name, email, password_hash, password_salt) VALUES (?, ?, ?, ?)")
        .run(name, email, hash, salt);
      const user = publicUser({ id: result.lastInsertRowid, name, email });
      const session = createSession(user.id);
      return sendJson(res, 201, { user, ...session });
    } catch (error) {
      return sendJson(res, 500, {
        error: "Could not create account",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (req.method === "POST" && req.url === "/api/auth/login") {
    try {
      const body = await readJson(req);
      const validationError = validateAuthInput(body, "login");
      if (validationError) return sendJson(res, 400, { error: validationError });

      const email = normalizeEmail(body.email);
      const row = authDb.prepare("SELECT * FROM users WHERE email = ?").get(email);
      if (!row || !verifyPassword(body.password, row)) {
        return sendJson(res, 401, { error: "Email or password is incorrect." });
      }

      const user = publicUser(row);
      const session = createSession(user.id);
      return sendJson(res, 200, { user, ...session });
    } catch (error) {
      return sendJson(res, 500, {
        error: "Could not log in",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (req.method === "GET" && req.url === "/api/auth/me") {
    const user = userFromToken(getBearerToken(req));
    if (!user) return sendJson(res, 401, { error: "Not signed in." });
    return sendJson(res, 200, { user });
  }

  if (req.method === "POST" && req.url === "/api/auth/logout") {
    const token = getBearerToken(req);
    if (token) authDb.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return sendJson(res, 200, { ok: true });
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

  if (req.method === "POST" && req.url === "/api/cadquery-stl") {
    try {
      const { layout } = await readJson(req);
      if (!layout?.components?.length) return sendJson(res, 400, { error: "layout with components is required" });
      const stl = buildCadqueryStl(layout);
      const name = String(layout.device || "smart-health-cadquery").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "smart-health-cadquery";
      return sendBinary(res, 200, stl, {
        "Content-Type": "model/stl",
        "Content-Disposition": `attachment; filename="${name}-cadquery.stl"`
      });
    } catch (error) {
      return sendJson(res, 501, {
        error: "CadQuery STL generation failed",
        detail: error instanceof Error ? error.message : String(error),
        install: "Install CadQuery with `python3 -m pip install cadquery` or use the JSCAD fallback download."
      });
    }
  }

  if (req.method === "POST" && req.url === "/api/direct-cad") {
    try {
      const { prompt, audience, documents } = await readJson(req);
      if (!prompt || !String(prompt).trim()) {
        return sendJson(res, 400, { error: "prompt is required" });
      }
      const warnings = [];
      const supplementalDocuments = await parseUploadedDocuments(documents, warnings);
      const result = directCadResultFromPrompt({
        prompt,
        audience: audience || "engineer",
        documents: supplementalDocuments,
        warnings
      });
      return sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 500, {
        error: "Direct CAD generation failed",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (req.method === "POST" && req.url === "/api/design-search") {
    try {
      const { prompt, audience, numOptions, documents } = await readJson(req);
      if (!prompt || !String(prompt).trim()) {
        return sendJson(res, 400, { error: "prompt is required" });
      }

      const warnings = [];
      const supplementalDocuments = await parseUploadedDocuments(documents, warnings);
      const promptProfile = await normalizePromptForRole(prompt, audience, warnings);
      const retrievalPrompt = promptProfile.engineeringPrompt || String(prompt).trim();

      const extractionRaw = await callOllama(
        [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: retrievalPrompt.slice(0, 4000) }
        ],
        { format: "json" }
      );
      const extraction = enrichExtractionFromPrompt(parseExtraction(extractionRaw), retrievalPrompt);

      let subgraph = null;
      const diseaseResolution = await resolveDiseaseForPrimeKG({
        extractedDisease: extraction.disease,
        prompt: retrievalPrompt,
        symptomPhrase: extraction.symptomPhrase,
        deviceIntent: extraction.deviceIntent,
        warnings
      });
      const canonicalDisease = diseaseResolution.canonicalDisease;
      const diseaseQueryName = diseaseResolution.queryName || canonicalDisease || extraction.disease;
      const diseaseNode = diseaseResolution.node;

      if (diseaseNode) {
        subgraph = primekg.getDiseaseSubgraph(diseaseNode);
      } else {
        warnings.push(
          extraction.disease
            ? `No PrimeKG node matched "${extraction.disease}"${canonicalDisease ? ` (or canonical term "${canonicalDisease}")` : ""} — proceeding without knowledge-graph grounding.`
            : "No disease/condition detected in the prompt — proceeding without knowledge-graph grounding."
        );
      }

      const queries = buildLiteratureQueries({
        retrievalPrompt,
        originalPrompt: promptProfile.originalPrompt,
        diseaseQueryName,
        extraction
      });

      let papers = [];
      for (const query of queries) {
        try {
          const results = await searchPapers(query, 3);
          papers.push(...results);
        } catch (error) {
          warnings.push(`Semantic Scholar search failed for "${query}": ${error instanceof Error ? error.message : String(error)}`);
        }
        try {
          const results = await searchEuropePmc(query, 3);
          papers.push(...results);
        } catch (error) {
          warnings.push(`Europe PMC search failed for "${query}": ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      const evidenceContext = [
        promptProfile.originalPrompt,
        retrievalPrompt,
        diseaseQueryName,
        extraction.disease,
        extraction.symptomPhrase,
        extraction.deviceIntent
      ].filter(Boolean).join(" ");
      const paperRelevanceProfile = buildPaperRelevanceProfile({
        contextText: evidenceContext,
        diseaseQueryName,
        extraction
      });
      papers = filterRelevantPapers(mergePaperLists(papers), paperRelevanceProfile, 10);

      let guidelineHits = [];
      if (guidelines.isAvailable()) {
        try {
          const guidelineQueries = buildGuidelineQueries({
            retrievalPrompt,
            originalPrompt: promptProfile.originalPrompt,
            diseaseQueryName,
            extraction
          });
          const allGuidelineHits = [];
          for (const guidelineQuery of guidelineQueries) {
            allGuidelineHits.push(...await guidelines.searchGuidelines(guidelineQuery, 6));
          }
          guidelineHits = rerankGuidelinesByPrompt(
            mergeGuidelineHits(allGuidelineHits),
            [promptProfile.originalPrompt, retrievalPrompt, extraction.symptomPhrase, extraction.deviceIntent].filter(Boolean).join(" ")
          ).slice(0, 5);
        } catch (error) {
          warnings.push(`Guideline search failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        warnings.push("Guideline/standards index not built yet — run `pnpm --dir web run build:guidelines`.");
      }
      const standards = getRelevantStandards();

      const evidenceBlocks = [
        subgraph ? `PrimeKG evidence:\n${summarizeSubgraphForPrompt(subgraph)}` : "PrimeKG evidence: none (no graph match).",
        `Literature evidence:\n${summarizeLiteratureForPrompt(papers)}`,
        `Clinical/interoperability guideline evidence:\n${summarizeGuidelinesForPrompt(guidelineHits)}`,
        `Standards to verify against (names only, not full-text retrieved):\n${summarizeStandardsForPrompt(standards)}`,
        `User-uploaded supplemental documents:\n${summarizeSupplementalDocuments(supplementalDocuments)}`
      ].join("\n\n");

      const ideation = await generateIdeation({
        prompt: retrievalPrompt,
        promptProfile,
        evidenceBlocks,
        supplementalDocuments,
        numOptions,
        papers,
        guidelines: guidelineHits,
        subgraph,
        warnings
      });

      return sendJson(res, 200, {
        kgGrounded: Boolean(subgraph),
        promptProfile,
        supplementalDocuments,
        extraction,
        subgraph,
        literature: papers,
        guidelines: guidelineHits,
        standardsReferenced: standards,
        proposal: ideation.summary,
        ideation,
        selectedConcept: null,
        cadLayout: null,
        warnings
      });
    } catch (error) {
      return sendJson(res, 500, {
        error: "Design search failed",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (req.method === "POST" && req.url === "/api/design-refine") {
    try {
      const { prompt, previousPrompt, previousResult, audience, documents } = await readJson(req);
      if (!prompt || !String(prompt).trim()) {
        return sendJson(res, 400, { error: "prompt is required" });
      }
      if (!previousResult?.proposal || !previousResult?.ideation?.options?.length) {
        return sendJson(res, 400, { error: "previousResult with proposal and ideation options is required" });
      }

      const warnings = [...(previousResult.warnings || [])];
      const newDocuments = await parseUploadedDocuments(documents, warnings);
      const supplementalDocuments = [...(previousResult.supplementalDocuments || []), ...newDocuments].slice(-6);
      const refinementProfile = await normalizeRefinementForRole(prompt, audience, previousResult, warnings);
      const evidenceBlocks = evidenceBlocksFromResult({ ...previousResult, supplementalDocuments });
      const optionCount = previousResult.ideation?.options?.length || 3;
      const ideation = await generateIdeation({
        prompt: `${previousResult.promptProfile?.engineeringPrompt || previousPrompt || ""}\nIdeation refinement: ${refinementProfile.engineeringPrompt}\nPrevious options: ${JSON.stringify(previousResult.ideation?.options || []).slice(0, 5000)}`,
        promptProfile: previousResult.promptProfile || { originalPrompt: previousPrompt || "", roleLabel: refinementProfile.roleLabel },
        evidenceBlocks,
        supplementalDocuments,
        numOptions: optionCount,
        papers: previousResult.literature || [],
        guidelines: previousResult.guidelines || [],
        subgraph: previousResult.subgraph || null,
        warnings
      });

      return sendJson(res, 200, {
        ...previousResult,
        proposal: ideation.summary,
        ideation,
        selectedConcept: null,
        cadLayout: null,
        supplementalDocuments,
        warnings,
        latestRefinementProfile: refinementProfile,
        refinementHistory: [
          ...(previousResult.refinementHistory || []),
          {
            prompt: String(prompt),
            promptProfile: refinementProfile,
            createdAt: new Date().toISOString()
          }
        ]
      });
    } catch (error) {
      return sendJson(res, 500, {
        error: "Design refinement failed",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (req.method === "POST" && req.url === "/api/cad-generate") {
    try {
      const { result, selectedConcept, documents } = await readJson(req);
      if (!result?.ideation?.options?.length) {
        return sendJson(res, 400, { error: "ideation result is required" });
      }

      const warnings = [...(result.warnings || [])];
      const newDocuments = await parseUploadedDocuments(documents, warnings);
      const supplementalDocuments = [...(result.supplementalDocuments || []), ...newDocuments].slice(-6);
      const concept = selectedConcept || result.selectedConcept || result.ideation.options.find((option) => option.id === result.ideation.recommendedOptionId) || result.ideation.options[0];
      const cadLayout = deterministicCadLayoutFromConcept({ result: { ...result, supplementalDocuments }, concept });

      return sendJson(res, 200, {
        ...result,
        selectedConcept: concept,
        cadLayout,
        supplementalDocuments,
        warnings,
        cadHistory: [
          ...(result.cadHistory || []),
          { prompt: "Generated CAD from selected ideation concept", selectedConceptId: concept.id, createdAt: new Date().toISOString() }
        ]
      });
    } catch (error) {
      return sendJson(res, 500, {
        error: "CAD generation failed",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (req.method === "POST" && req.url === "/api/cad-refine") {
    try {
      const { prompt, result, audience, documents } = await readJson(req);
      if (!prompt || !String(prompt).trim()) {
        return sendJson(res, 400, { error: "prompt is required" });
      }
      if (!result?.cadLayout) {
        return sendJson(res, 400, { error: "cadLayout is required" });
      }

      const warnings = [...(result.warnings || [])];
      const newDocuments = await parseUploadedDocuments(documents, warnings);
      const supplementalDocuments = [...(result.supplementalDocuments || []), ...newDocuments].slice(-6);
      const cadRefinementProfile = await normalizeRefinementForRole(prompt, audience, result, warnings);
      const evidenceBlocks = evidenceBlocksFromResult({ ...result, supplementalDocuments });
      const selectedConcept = result.selectedConcept || result.ideation?.options?.[0];
      const cadProposal = [
        `Selected concept: ${selectedConcept?.title || result.cadLayout.device}`,
        `Existing CAD layout:\n${JSON.stringify(result.cadLayout).slice(0, 5000)}`,
        `CAD refinement request: ${cadRefinementProfile.engineeringPrompt}`,
        `Uploaded CAD-refinement documents:\n${summarizeSupplementalDocuments(newDocuments)}`
      ].join("\n\n");
      const cadLayout = await generateCadLayout({
        prompt: `${result.promptProfile?.engineeringPrompt || ""}\nCAD refinement: ${cadRefinementProfile.engineeringPrompt}`,
        proposal: cadProposal,
        evidenceBlocks,
        warnings
      });

      return sendJson(res, 200, {
        ...result,
        cadLayout,
        supplementalDocuments,
        warnings,
        latestCadRefinementProfile: cadRefinementProfile,
        cadHistory: [
          ...(result.cadHistory || []),
          {
            prompt: String(prompt),
            promptProfile: cadRefinementProfile,
            createdAt: new Date().toISOString()
          }
        ]
      });
    } catch (error) {
      return sendJson(res, 500, {
        error: "CAD refinement failed",
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
