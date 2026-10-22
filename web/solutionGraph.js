const FORM_FACTORS = [
  { id: "brace", label: "Brace / orthosis", terms: ["brace", "orthosis", "orthotic", "splint"], forms: ["cast", "sleeve"] },
  { id: "sleeve", label: "Sleeve / textile wearable", terms: ["sleeve", "garment", "textile", "fabric", "sock", "shirt", "compression"], forms: ["sleeve", "textile"] },
  { id: "insole", label: "Shoe / insole", terms: ["insole", "shoe", "footwear", "foot pressure", "plantar"], forms: ["insole"] },
  { id: "belt", label: "Belt / waist tracker", terms: ["belt", "waist", "waistband", "trunk"], forms: ["belt"] },
  { id: "helmet", label: "Helmet / headgear", terms: ["helmet", "headgear", "head-mounted", "head mounted"], forms: ["helmet"] },
  { id: "glove", label: "Glove / hand wearable", terms: ["glove", "hand wearable", "data glove"], forms: ["glove"] },
  { id: "wristband", label: "Wristband / watch", terms: ["wristband", "watch", "smartwatch", "bracelet"], forms: ["wristband"] },
  { id: "patch", label: "Skin patch / adhesive sensor", terms: ["patch", "adhesive", "epidermal", "skin-mounted", "skin mounted"], forms: ["patch"] },
  { id: "clip-on", label: "Clip-on / attached module", terms: ["clip", "clip-on", "attachable", "detachable", "mounted sensor"], forms: ["clip-on"] },
  { id: "handheld", label: "Handheld / portable reader", terms: ["handheld", "portable", "reader", "scanner", "smartphone-based", "phone camera"], forms: ["handheld", "mobile app"] },
  { id: "bottle", label: "Bottle / container", terms: ["bottle", "container", "cup", "hydration", "drink"], forms: ["bottle", "cup"] },
  { id: "mobile-app", label: "Mobile app / digital workflow", terms: ["mobile app", "smartphone app", "application", "software", "digital platform", "telehealth", "remote monitoring", "gamification"], forms: ["mobile app"] }
];

const SENSOR_TYPES = [
  { id: "imu", label: "IMU / motion sensing", terms: ["imu", "inertial", "accelerometer", "gyroscope", "motion", "range of motion", "rom", "gait"] },
  { id: "pressure", label: "Pressure / force sensing", terms: ["pressure", "force", "load", "grip", "plantar"] },
  { id: "emg", label: "EMG / muscle activity", terms: ["emg", "electromyography", "muscle oxygenation", "muscle activity"] },
  { id: "optical", label: "Optical / pulse sensing", terms: ["optical", "photoplethysmography", "ppg", "pulse oximeter", "spo2", "oxygen"] },
  { id: "biofluid", label: "Sweat / biofluid sensing", terms: ["sweat", "electrolyte", "salinity", "biofluid", "hydration"] },
  { id: "temperature", label: "Temperature sensing", terms: ["temperature", "thermal"] },
  { id: "camera", label: "Camera / vision sensing", terms: ["camera", "vision", "image", "video"] }
];

const OUTCOME_TYPES = [
  { id: "rom", label: "Range of motion", terms: ["range of motion", "rom", "flexion", "extension"] },
  { id: "gait", label: "Gait / mobility", terms: ["gait", "walking", "mobility", "balance", "return-to-play", "return to play"] },
  { id: "rehab", label: "Rehabilitation adherence", terms: ["rehabilitation", "rehab", "exercise", "adherence", "physical therapy", "postoperative"] },
  { id: "hydration", label: "Hydration / fluid intake", terms: ["hydration", "fluid intake", "drink", "bottle", "sweat"] },
  { id: "respiration", label: "Respiration / breathing", terms: ["respiration", "breathing", "shortness of breath", "dyspnea", "cough"] },
  { id: "cardiac", label: "Cardiac rhythm / pulse", terms: ["heart rate", "cardiac", "ecg", "arrhythmia", "pulse"] }
];

const ANATOMY_TERMS = [
  "knee", "ankle", "foot", "hip", "shoulder", "elbow", "wrist", "hand", "finger", "chest", "lung",
  "mouth", "teeth", "head", "neck", "waist", "back", "leg", "arm"
];

function cleanText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesTerm(text, term) {
  const clean = cleanText(text);
  const wanted = cleanText(term);
  if (!wanted) return false;
  if (wanted.length <= 4) return clean.split(" ").includes(wanted);
  return clean.includes(wanted);
}

function stableId(prefix, value) {
  const slug = cleanText(value).replace(/\s+/g, "-").slice(0, 60) || "unknown";
  return `${prefix}:${slug}`;
}

function addNode(nodes, node) {
  if (!node?.id) return;
  const existing = nodes.get(node.id);
  nodes.set(node.id, existing ? { ...existing, ...node, count: (existing.count || 1) + (node.count || 1) } : node);
}

function addEdge(edges, from, relation, to, evidence = null) {
  if (!from || !to) return;
  const key = `${from}|${relation}|${to}`;
  const existing = edges.get(key);
  if (existing) {
    existing.weight += 1;
    if (evidence && existing.evidence.length < 4) existing.evidence.push(evidence);
    return;
  }
  edges.set(key, { from, relation, to, weight: 1, evidence: evidence ? [evidence] : [] });
}

function sourceNodeForPaper(paper, index) {
  const id = paper.doi
    ? `source:doi:${String(paper.doi).toLowerCase()}`
    : paper.pmid
      ? `source:pmid:${String(paper.pmid).toLowerCase()}`
      : stableId("source:paper", paper.title || `paper ${index + 1}`);
  return {
    id,
    type: "source",
    label: paper.title || `Paper ${index + 1}`,
    source: paper.source || "Literature",
    url: paper.url || null,
    year: paper.year || null,
    venue: paper.venue || null,
    abstract: paper.abstract || ""
  };
}

function matchCatalog(text, catalog) {
  return catalog.filter((entry) => entry.terms.some((term) => includesTerm(text, term)));
}

function anatomyMatches(text, subgraph) {
  const graphAnatomy = (subgraph?.anatomy || []).map((node) => node.name).filter(Boolean);
  const candidates = [...ANATOMY_TERMS, ...graphAnatomy];
  return [...new Set(candidates.filter((term) => includesTerm(text, term)).map((term) => cleanText(term)))];
}

function conditionLabel({ subgraph, extraction, prompt }) {
  return subgraph?.disease?.name || extraction?.disease || extraction?.symptomPhrase || cleanText(prompt).split(" ").slice(0, 5).join(" ") || "Design context";
}

function inferTaskSignals({ prompt, extraction, subgraph }) {
  const text = [prompt, extraction?.deviceIntent, extraction?.symptomPhrase, subgraph?.disease?.name, ...(subgraph?.phenotypes || []).map((n) => n.name)].filter(Boolean).join(" ");
  const signals = [];
  if (/\b(knee|acl|ligament|rehab|rehabilitation|range of motion|rom|physical therapy|gait|mobility)\b/i.test(text)) {
    signals.push({
      formFactor: "sleeve",
      label: "Joint sleeve / textile wearable",
      source: "condition/task inference",
      title: "Orthopedic rehabilitation and ROM task context",
      evidence: "Prompt and retrieved condition context indicate joint motion or rehabilitation."
    });
    signals.push({
      formFactor: "cast",
      label: "Brace / orthosis support",
      source: "condition/task inference",
      title: "Joint support or guided movement context",
      evidence: "Orthopedic rehab concepts commonly need stable placement and repeatable alignment."
    });
  }
  if (/\b(gait|walking|foot|balance|step|plantar)\b/i.test(text)) {
    signals.push({
      formFactor: "insole",
      label: "Shoe / insole motion sensor",
      source: "condition/task inference",
      title: "Gait, balance, or foot-pressure context",
      evidence: "Prompt context points toward gait or foot-loading measurements."
    });
  }
  if (/\b(hydration|water|bottle|drink|sweat|sports)\b/i.test(text)) {
    signals.push({
      formFactor: "bottle",
      label: "Bottle / hydration container",
      source: "condition/task inference",
      title: "Hydration and sports context",
      evidence: "Prompt context explicitly involves hydration, drinking, or sweat."
    });
  }
  if (/\b(head|brain|concussion|helmet|football|impact|collision|blunt force)\b/i.test(text)) {
    signals.push({
      formFactor: "helmet",
      label: "Helmet / headgear",
      source: "condition/task inference",
      title: "Head-impact and helmet context",
      evidence: "Prompt context points toward head impact detection during helmeted sport activity."
    });
  }
  return signals;
}

function addSolutionFromSignal({ nodes, edges, conditionId, signal, sourceId = null, index = 0 }) {
  const solutionId = stableId("solution", `${signal.formFactor}-${signal.title || signal.label}-${index}`);
  addNode(nodes, {
    id: solutionId,
    type: "previous_solution",
    label: signal.label,
    formFactor: signal.formFactor,
    source: signal.source,
    title: signal.title || signal.label,
    evidence: signal.evidence || ""
  });
  addEdge(edges, conditionId, "has_previous_solution", solutionId, signal.title);

  const formId = stableId("form", signal.formFactor);
  addNode(nodes, { id: formId, type: "form_factor", label: signal.formFactor });
  addEdge(edges, solutionId, "has_form_factor", formId, signal.title);
  if (sourceId) addEdge(edges, solutionId, "supported_by", sourceId, signal.title);
}

function signalsFromText(text, sourceLabel, title) {
  const formMatches = matchCatalog(text, FORM_FACTORS);
  return formMatches.flatMap((match) => {
    const forms = match.forms?.length ? match.forms : [match.id];
    return forms.map((formFactor) => ({
      formFactor,
      label: match.label,
      source: sourceLabel,
      title,
      evidence: text.slice(0, 300)
    }));
  });
}

export function buildSolutionGraph({ prompt, extraction = {}, subgraph = null, papers = [], guidelines = [], supplementalDocuments = [] }) {
  const nodes = new Map();
  const edges = new Map();
  const label = conditionLabel({ subgraph, extraction, prompt });
  const conditionId = stableId("condition", label);
  addNode(nodes, {
    id: conditionId,
    type: "condition",
    label,
    source: subgraph?.disease ? `${subgraph.disease.source}:${subgraph.disease.id}` : "prompt"
  });

  const paperSignals = [];
  papers.forEach((paper, index) => {
    const source = sourceNodeForPaper(paper, index);
    addNode(nodes, source);
    const text = `${paper.title || ""} ${paper.abstract || ""} ${paper.venue || ""}`;

    signalsFromText(text, paper.source || "literature", paper.title || `Paper ${index + 1}`).forEach((signal) => {
      paperSignals.push(signal);
      addSolutionFromSignal({ nodes, edges, conditionId, signal, sourceId: source.id, index });
    });

    matchCatalog(text, SENSOR_TYPES).forEach((sensor) => {
      const sensorId = stableId("sensor", sensor.label);
      addNode(nodes, { id: sensorId, type: "sensor", label: sensor.label });
      addEdge(edges, source.id, "mentions_sensor", sensorId, paper.title);
    });
    matchCatalog(text, OUTCOME_TYPES).forEach((outcome) => {
      const outcomeId = stableId("outcome", outcome.label);
      addNode(nodes, { id: outcomeId, type: "outcome", label: outcome.label });
      addEdge(edges, source.id, "measures_or_targets", outcomeId, paper.title);
    });
    anatomyMatches(text, subgraph).forEach((anatomy) => {
      const anatomyId = stableId("anatomy", anatomy);
      addNode(nodes, { id: anatomyId, type: "anatomy", label: anatomy });
      addEdge(edges, source.id, "targets_anatomy", anatomyId, paper.title);
    });
  });

  guidelines.forEach((hit, index) => {
    const sourceId = stableId("source:guideline", `${hit.source}-${hit.title}-${index}`);
    addNode(nodes, {
      id: sourceId,
      type: "source",
      label: hit.title || `Guidance ${index + 1}`,
      source: hit.source || "Guideline",
      url: hit.url || null,
      abstract: hit.text || ""
    });
    const text = `${hit.title || ""} ${hit.text || ""}`;
    signalsFromText(text, hit.source || "guideline", hit.title || `Guidance ${index + 1}`).forEach((signal) => {
      addSolutionFromSignal({ nodes, edges, conditionId, signal, sourceId, index: `g${index}` });
    });
  });

  supplementalDocuments.forEach((document, index) => {
    const sourceId = stableId("source:upload", document.name || `upload ${index + 1}`);
    addNode(nodes, {
      id: sourceId,
      type: "source",
      label: document.name || `Uploaded document ${index + 1}`,
      source: "Uploaded document",
      abstract: document.text || ""
    });
    signalsFromText(document.text || "", "uploaded document", document.name || `Uploaded document ${index + 1}`).forEach((signal) => {
      addSolutionFromSignal({ nodes, edges, conditionId, signal, sourceId, index: `u${index}` });
    });
  });

  inferTaskSignals({ prompt, extraction, subgraph }).forEach((signal, index) => {
    addSolutionFromSignal({ nodes, edges, conditionId, signal, index: `i${index}` });
  });

  const signalMap = new Map();
  for (const node of nodes.values()) {
    if (node.type !== "previous_solution") continue;
    const key = node.formFactor || cleanText(node.label);
    const existing = signalMap.get(key) || {
      formFactor: node.formFactor,
      label: node.label,
      count: 0,
      examples: []
    };
    existing.count += 1;
    if (node.title && existing.examples.length < 4) {
      existing.examples.push({ title: node.title, source: node.source || "solution graph" });
    }
    signalMap.set(key, existing);
  }

  const signals = [...signalMap.values()].sort((a, b) => b.count - a.count).slice(0, 8);
  const previousSolutions = signals.map((signal) => ({
    title: signal.label,
    formFactor: signal.formFactor,
    evidenceCount: signal.count,
    source: signal.examples.map((example) => example.source).filter(Boolean).join(" + ") || "solution graph",
    detail: signal.examples.length
      ? `Seen in ${signal.examples.length} retrieved source signal${signal.examples.length === 1 ? "" : "s"}: ${signal.examples.map((example) => example.title).join("; ")}`
      : "Inferred from prompt, condition, or uploaded context.",
    examples: signal.examples
  }));

  return {
    version: 1,
    summary: previousSolutions.length
      ? `${previousSolutions.length} prior solution ${previousSolutions.length === 1 ? "family" : "families"} extracted from retrieved evidence.`
      : "No prior solution families were extracted from retrieved evidence.",
    conditionId,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    signals,
    previousSolutions
  };
}

export function summarizeSolutionGraphForPrompt(solutionGraph) {
  if (!solutionGraph?.signals?.length) {
    return "Solution knowledge graph: no prior solution families extracted from retrieved sources.";
  }
  return [
    `Solution knowledge graph: ${solutionGraph.summary}`,
    ...solutionGraph.signals.slice(0, 6).map((signal, index) => {
      const examples = (signal.examples || []).map((example) => `${example.title} [${example.source}]`).join("; ");
      return `${index + 1}. ${signal.label} -> formFactor "${signal.formFactor}" (${signal.count} graph signal${signal.count === 1 ? "" : "s"}). Examples: ${examples || "inferred graph signal"}`;
    })
  ].join("\n");
}
