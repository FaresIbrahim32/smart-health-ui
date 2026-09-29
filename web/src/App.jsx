import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  BarChart3,
  Battery,
  BookOpen,
  Box,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  CircuitBoard,
  ClipboardList,
  CloudUpload,
  Cpu,
  Database,
  Download,
  Droplets,
  Eye,
  FileText,
  Gauge,
  HeartPulse,
  History,
  Home,
  Layers,
  LogIn,
  Menu,
  MessageSquare,
  Microscope,
  Moon,
  PackageCheck,
  Palette,
  PenTool,
  RefreshCw,
  Search,
  Send,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Thermometer,
  UserPlus,
  UserRound,
  UsersRound,
  Wrench,
  Zap,
  X
} from "lucide-react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { buildAssembly, geom3ToBufferGeometry, exportStlBlob } from "./cadAssembly.js";
import "./styles.css";

const pages = [
  { id: "pipeline", label: "Pipeline", icon: Activity },
  { id: "knowledge", label: "Knowledge Sources", icon: BookOpen },
  { id: "target", label: "Design Target", icon: SlidersHorizontal },
  { id: "workflow", label: "Workflow", icon: Layers },
  { id: "new", label: "Prompt", icon: Home },
  { id: "results", label: "Architecture", icon: CheckCircle2 },
  { id: "evidence", label: "Evidence", icon: FileText },
  { id: "solutions", label: "Previous Solutions", icon: Search },
  { id: "history", label: "History", icon: History },
  { id: "explore", label: "RAG Exploration", icon: Search },
  { id: "cad", label: "CAD Workspace", icon: Box }
];

const sourceTypes = [
  {
    title: "PrimeKG Knowledge Graph",
    badge: "Local SQLite",
    icon: Database,
    color: "blue",
    description: "Disease, phenotype, protein, and anatomy relationships indexed locally from PrimeKG.",
    items: ["disease_phenotype_positive edges", "disease_protein edges", "anatomy_protein_present edges"]
  },
  {
    title: "PubTator3",
    badge: "NCBI API",
    icon: Microscope,
    color: "green",
    description: "Best-effort disease synonym and canonical term lookup before PrimeKG matching.",
    items: ["Disease autocomplete", "Alias resolution", "Raw-term fallback"]
  },
  {
    title: "Literature APIs",
    badge: "Paper Search API",
    icon: BookOpen,
    color: "purple",
    description: "Literature search over disease, symptom, device, and monitoring terms.",
    items: ["Titles and abstracts", "Year and venue", "Paper URLs and DOI metadata"]
  },
  {
    title: "MedlinePlus",
    badge: "Guideline RAG",
    icon: ClipboardList,
    color: "cyan",
    description: "Consumer health topic excerpts embedded locally for clinical context.",
    items: ["Health topic chunks", "Ollama embeddings", "Cosine similarity retrieval"]
  },
  {
    title: "ONC SAFER Guides + USCDI",
    badge: "Interoperability",
    icon: Layers,
    color: "yellow",
    description: "Health IT safety and data-class references retrieved through the local guideline index.",
    items: ["SAFER Guide excerpts", "USCDI data classes", "Local guideline database"]
  },
  {
    title: "Standards Reference List",
    badge: "Names Only",
    icon: ShieldCheck,
    color: "blue",
    description: "Copyrighted standards are shown as verify-against references, not fetched or embedded.",
    items: ["IEC 60601 / 62304 / 62366", "ISO 14971 / 13485 / 10993", "IEEE 11073 / AAMI TIR57"]
  }
];

const pipelineEvidence = [
  ["Entity extraction", "Ollama gemma4 extracts disease, symptom, and device intent."],
  ["Synonym resolution", "NCBI PubTator3 canonicalizes disease names before graph lookup."],
  ["Graph grounding", "PrimeKG supplies disease, phenotype, protein, and anatomy relationships."],
  ["Literature retrieval", "Semantic Scholar and Europe PMC return paper metadata, abstracts, and URLs."],
  ["Guideline retrieval", "MedlinePlus, ONC SAFER Guides, and USCDI chunks are embedded locally."]
];

const promptAudiences = [
  {
    id: "common",
    label: "Everyday user",
    icon: UserRound,
    description: "Plain wording is converted into an engineering search prompt."
  },
  {
    id: "caregiver",
    label: "Caregiver",
    icon: UsersRound,
    description: "Care concerns are converted into patient-friendly monitoring and alert needs."
  },
  {
    id: "engineer",
    label: "Engineer",
    icon: Wrench,
    description: "Technical prompts stay specific for device and CAD exploration."
  },
  {
    id: "doctor",
    label: "Doctor",
    icon: HeartPulse,
    description: "Clinical needs are translated into measurable design signals."
  },
  {
    id: "researcher",
    label: "Researcher",
    icon: Microscope,
    description: "Research questions are translated into evidence-seeking design hypotheses."
  },
  {
    id: "regulatory",
    label: "Regulatory",
    icon: ShieldCheck,
    description: "Safety, documentation, and human-approval concerns guide the search prompt."
  }
];

const evidenceViewpoints = [
  { id: "common", label: "Everyday user", icon: UserRound, description: "Plain-language evidence with short source-backed notes." },
  { id: "caregiver", label: "Caregiver", icon: UsersRound, description: "Practical safety, comfort, adherence, and escalation context." },
  { id: "doctor", label: "Doctor", icon: HeartPulse, description: "Clinical guidance, phenotypes, symptoms, and literature context." },
  { id: "engineer", label: "Engineer", icon: Wrench, description: "Component rationale, standards references, and implementation trade-offs." },
  { id: "researcher", label: "Researcher", icon: Microscope, description: "Literature-heavy evidence, graph entities, and research gaps." },
  { id: "regulatory", label: "Regulatory", icon: ShieldCheck, description: "Human review caveats, safety standards to verify, and documentation needs." }
];

const ideationTargets = [
  {
    id: "cad",
    title: "CAD Design",
    icon: Box,
    description: "Evidence-backed hardware concept and downloadable STL."
  },
  {
    id: "mobile",
    title: "Mobile App Design",
    icon: Cpu,
    description: "Companion workflows, monitoring screens, and data needs."
  },
  {
    id: "both",
    title: "Both CAD & Mobile App",
    icon: PackageCheck,
    description: "Coordinate physical device and digital experience."
  }
];

const workflowModes = [
  {
    id: "typical",
    title: "Typical Flow",
    label: "Phase 1 + Phase 2",
    icon: Layers,
    description: "Ideate concepts first, then move into engineering specs and CAD."
  },
  {
    id: "phase1",
    title: "Phase 1 Only",
    label: "Ideation only",
    icon: Sparkles,
    description: "Stay in concept exploration, evidence, trade-offs, and human review."
  },
  {
    id: "phase2",
    title: "Phase 2 Only",
    label: "Engineering focus",
    icon: CircuitBoard,
    description: "Use an accepted concept to focus on specs, constraints, and 3D preview."
  }
];

const AUTH_STORAGE_KEY = "smart-health-session";
const THEME_STORAGE_KEY = "smart-health-theme";
const THEMES = ["navy", "dark", "light"];
const THEME_LABEL = {
  navy: "Navy",
  dark: "Black",
  light: "Light"
};

async function authRequest(path, body, token) {
  const response = await fetch(`http://127.0.0.1:3001${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.detail || "Authentication failed");
  return data;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadTextFile(fileName, text, type = "text/plain") {
  downloadBlob(new Blob([text], { type }), fileName);
}

function requestErrorMessage(err, fallback) {
  return err instanceof Error ? err.message : fallback;
}

async function downloadCadStl(layout) {
  const fileBase = safeFileBase(layout?.device || "smart-health-generated-design");
  try {
    const response = await fetch("http://127.0.0.1:3001/api/cadquery-stl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout })
    });
    if (response.ok) {
      downloadBlob(await response.blob(), `${fileBase}-cadquery.stl`);
      return "cadquery";
    }
  } catch {
    // Fall back to the browser-side JSCAD exporter below.
  }
  downloadBlob(exportStlBlob(buildAssembly(layout).unioned), `${fileBase}-jscad.stl`);
  return "jscad";
}

function safeFileBase(name = "smart-health-design") {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "smart-health-design";
}

function makeHistoryId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function latestRefinementPrompt(result) {
  const history = result?.refinementHistory || [];
  return history.length ? history[history.length - 1]?.prompt : "";
}

function latestRefinementProfile(result) {
  const history = result?.refinementHistory || [];
  return history.length ? history[history.length - 1]?.promptProfile : null;
}

function hasIdeation(result) {
  return Boolean(result?.ideation?.options?.length);
}

function activeConcept(result) {
  return result?.selectedConcept || result?.ideation?.options?.find((option) => option.id === result.ideation.recommendedOptionId) || result?.ideation?.options?.[0] || null;
}

function buildInstantSpecLayout(result, concept) {
  if (!concept) return null;
  const formFactor = concept.formFactor || "patch";
  const scores = concept.evidenceStrength || {};
  const evidence = [
    result?.subgraph?.disease?.name ? `PrimeKG disease node: ${result.subgraph.disease.name}` : "",
    result?.literature?.[0]?.title ? `Literature: ${result.literature[0].title}` : "",
    result?.guidelines?.[0]?.title ? `Guidance: ${result.guidelines[0].title}` : "",
    concept.rationale ? `Concept rationale: ${concept.rationale}` : ""
  ].filter(Boolean).slice(0, 3).join(" | ") || "selected concept rationale";
  const dimensions = {
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
  }[formFactor] || { lengthMm: 96, widthMm: 54, heightMm: 20 };
  const impact = (key, offset = 0) => clampUiScore((Number(scores[key]) || Number(scores.overall) || 62) + offset);
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
  const signalText = `${result?.promptProfile?.engineeringPrompt || ""} ${result?.extraction?.deviceIntent || ""} ${result?.extraction?.symptomPhrase || ""}`.toLowerCase();
  const conceptText = `${signalText} ${concept.title || ""} ${concept.formFactor || ""} ${concept.plainDescription || ""} ${concept.professionalDescription || ""} ${concept.bestFor || ""}`.toLowerCase();
  const spec = (id, type, material, placement, constraint, impactLabel, value, groundedIn) => ({ id, type, material, placement, constraint, impactLabel, impact: value, groundedIn });
  const usesElectronics = /\b(track|monitor|sensor|smart|app|alert|sync|bluetooth|wireless|measure|level|volume|hydrate|sweat|pulse|oxygen|respir|motion|temperature)\b/.test(conceptText);
  const needsSensor = /\b(track|monitor|sensor|measure|detect|level|volume|sweat|hydration|pulse|oxygen|respir|motion|temperature|glucose|pressure)\b/.test(conceptText);
  const needsConnectivity = /\b(app|caregiver|parent|sync|phone|bluetooth|wireless|dashboard|notification)\b/.test(conceptText);
  const needsAlert = /\b(alert|remind|notification|warn|nudge|alarm|status)\b/.test(conceptText);
  const components = [
    spec("base-interface", baseType, "material selected for comfort, durability, cleaning, and human review", ["bottle", "cup", "cup holder"].includes(formFactor) ? "primary container or holder body" : "body-facing or user-facing interface", "Must be reviewed for fit, cleaning, repeated use, age appropriateness, and misuse risk.", "Human Factors", impact("humanFactors", 2), evidence)
  ];

  if (needsSensor) {
    const sensorType = /\b(water|bottle|hydration|drink|volume|refill)\b/.test(conceptText)
      ? "Fluid intake / fill-level sensing"
      : /\b(sweat|salinity|electrolyte|biofluid)\b/.test(conceptText)
        ? "Sweat or biofluid sensing"
        : /\b(respir|breath|dyspnea|shortness|cough|spo2|oxygen|pulse)\b/.test(conceptText)
          ? "Respiratory and pulse-ox sensing"
          : /\b(seizure|epilepsy|motion|fall|tremor|acceler)\b/.test(conceptText)
            ? "Motion and event sensing"
            : "Primary sensing module";
    components.push(spec("sensing-module", sensorType, "sealed sensing package chosen for the target signal", ["bottle", "cup", "cup holder"].includes(formFactor) ? "rim, base, wall, or retaining cradle measurement zone" : "highest-signal contact zone", "Sensor choice and placement must be validated against the real-world signal, not assumed from the concept.", "Clinical", impact("clinical", 3), evidence));
  }

  if (usesElectronics) {
    components.push(spec("control-module", "Low-power control module", "compact controller integrated only if active sensing or logic is required", ["bottle", "cup", "cup holder"].includes(formFactor) ? "protected rim, base, or cradle cavity" : "protected electronics pocket", "Firmware, electrical isolation, data handling, and failure behavior require engineering review.", "Engineering", impact("engineering", 2), "IEC 60601-1, IEC 62304, and selected concept rationale"));
    components.push(spec("power-plan", "Power source / charging strategy", "battery, replaceable cell, or passive/no-battery strategy to be selected during engineering", "separated from pressure, fluid, and child-accessible zones", "Power is included only because this concept uses active electronics; thermal and charging safety need review.", "Safety", impact("overall", -2), "IEC 60601-1 and selected concept rationale"));
  }

  if (needsConnectivity) {
    components.push(spec("connectivity", "Caregiver/app connectivity", "Bluetooth or near-field sync module if the workflow needs phone/caregiver review", "near controller or cap electronics", "Connectivity should minimize setup burden, protect privacy, and fail gracefully without hiding risk.", "Human Factors", impact("humanFactors", 1), "Caregiver workflow and selected concept rationale"));
  }

  if (needsAlert) {
    components.push(spec("feedback-cue", "User feedback cue", "LED, haptic, or app-only reminder depending on age and setting", "visible cap, bottle sleeve, or app surface", "Alerts must be understandable and avoid alarm fatigue, false reassurance, or distracting a child during sports.", "Human Factors", impact("humanFactors", -1), "IEC 62366-1 usability review and selected concept rationale"));
  }

  if (!usesElectronics) {
    components.push(spec("passive-marker", "Passive measurement or labeling feature", "printed scale, color-change material, or manual log area", "visible user-facing surface", "Passive concepts reduce electronics burden but rely on user/caregiver consistency.", "Human Factors", impact("humanFactors", 0), "Selected concept rationale"));
  }

  return {
    device: `${concept.title} Engineering Spec`,
    formFactor,
    dimensions,
    components: components.slice(0, 7),
    caveat: "Engineering-spec concept preview only. Specs and geometry require qualified human review before clinical, safety, regulatory, or manufacturing use."
  };
}

function evidenceLabel(score) {
  if (score >= 80) return "High";
  if (score >= 60) return "Medium";
  return "Low";
}

async function filesToDocuments(files) {
  const selected = Array.from(files || []).slice(0, 3);
  return Promise.all(selected.map((file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", data: reader.result });
    reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  })));
}

function promptPlaceholderFor(role, phase = "initial") {
  const initial = {
    common: "Example: I want something that helps someone with cystic fibrosis notice breathing trouble earlier...",
    caregiver: "Example: I help care for someone with cystic fibrosis and want a simple way to know when their breathing seems worse...",
    doctor: "Example: Need a patient-friendly way to monitor dyspnea and oxygenation trends in cystic fibrosis...",
    engineer: "Example: Design a non-invasive wearable system for continuously monitoring shortness of breath in patients with cystic fibrosis...",
    researcher: "Example: Explore evidence-backed sensing concepts for longitudinal respiratory symptom monitoring in cystic fibrosis...",
    regulatory: "Example: Propose a home-use monitoring concept for cystic fibrosis with clear safety, usability, and review constraints..."
  };
  const refine = {
    common: "Example: make it smaller and easier to wear every day...",
    caregiver: "Example: make it easier for a caregiver to notice when something needs attention...",
    doctor: "Example: prioritize dyspnea trend review, oxygenation context, and patient safety alerts...",
    engineer: "Example: reduce enclosure volume, switch to a patch form factor, and separate sensor, battery, and radio modules...",
    researcher: "Example: favor the concept with stronger literature support and clearer measurable outcomes...",
    regulatory: "Example: make the concept safer for home use and clearer about human approval checkpoints..."
  };
  const source = phase === "refine" ? refine : initial;
  return source[role] || source.common;
}

function exportData(prompt, result) {
  return {
    prompt,
    promptProfile: result.promptProfile || null,
    latestRefinementProfile: result.latestRefinementProfile || latestRefinementProfile(result),
    ideation: result.ideation || null,
    selectedConcept: result.selectedConcept || null,
    supplementalDocuments: result.supplementalDocuments || [],
    extraction: result.extraction,
    commonUserInfo: commonUserInfo(result),
    definitions: {
      disease: result.subgraph?.disease || null,
      symptom: result.extraction?.symptomPhrase || null,
      deviceIntent: result.extraction?.deviceIntent || null
    },
    genesAndProteins: result.subgraph?.proteins || [],
    phenotypes: result.subgraph?.phenotypes || [],
    anatomy: result.subgraph?.anatomy || [],
    papersCited: result.literature || [],
    guidelines: result.guidelines || [],
    standardsReferenced: result.standardsReferenced || [],
    proposal: result.proposal,
    cadDesign: result.cadLayout
  };
}

function exportMarkdown(prompt, result) {
  const data = exportData(prompt, result);
  const lines = [
    `# ${data.selectedConcept?.title || data.cadDesign?.device || "Smart Health Architecture"}`,
    "",
    "## Prompt",
    prompt || "No prompt recorded.",
    "",
    "## Prompt Mode",
    `- Author: ${data.promptProfile?.roleLabel || "Not recorded"}`,
    `- Engineering retrieval prompt: ${data.promptProfile?.engineeringPrompt || prompt || "Not recorded"}`,
    data.latestRefinementProfile ? `- Latest refinement author: ${data.latestRefinementProfile.roleLabel || "Not recorded"}` : "",
    data.latestRefinementProfile?.engineeringPrompt ? `- Latest engineering refinement: ${data.latestRefinementProfile.engineeringPrompt}` : "",
    "",
    "## Extracted Definitions",
    `- Disease: ${data.definitions.disease?.name || data.extraction?.disease || "not detected"}`,
    `- Symptom: ${data.definitions.symptom || "not detected"}`,
    `- Device intent: ${data.definitions.deviceIntent || "not detected"}`,
    "",
    "## Concept Options",
    ...(data.ideation?.options?.length ? data.ideation.options.map((option) => `- ${option.title} (${option.formFactor}) - overall ${option.evidenceStrength?.overall ?? "n/a"}. ${option.plainDescription}`) : ["- None generated"]),
    "",
    "## Uploaded Supplemental Documents",
    ...(data.supplementalDocuments.length ? data.supplementalDocuments.map((item) => `- ${item.name} (${item.type})`) : ["- None"]),
    "",
    "## Common User Information",
    ...data.commonUserInfo.terminology.map((item) => `- ${item.term}: ${item.description}`),
    "",
    "## Similar Or Previous Solutions",
    ...data.commonUserInfo.solutions.map((item) => `- ${item.title} (${item.source}) ${item.detail}`),
    "",
    "## Phenotypes",
    ...(data.phenotypes.length ? data.phenotypes.map((node) => `- ${node.name} (${node.source}:${node.id})`) : ["- None retrieved"]),
    "",
    "## Genes / Proteins",
    ...(data.genesAndProteins.length ? data.genesAndProteins.map((node) => `- ${node.name} (${node.source}:${node.id})`) : ["- None retrieved"]),
    "",
    "## Related Anatomy",
    ...(data.anatomy.length ? data.anatomy.map((node) => `- ${node.name} (${node.source}:${node.id})`) : ["- None retrieved"]),
    "",
    "## Papers Cited",
    ...(data.papersCited.length ? data.papersCited.map((paper) => `- ${paper.title} (${paper.year || "n.d."}) ${paper.url || ""}`) : ["- None retrieved"]),
    "",
    "## Guideline Excerpts",
    ...(data.guidelines.length ? data.guidelines.map((hit) => `- ${hit.source}: ${hit.title} ${hit.url || ""}`) : ["- None retrieved"]),
    "",
    "## Standards To Verify Against",
    ...(data.standardsReferenced.length ? data.standardsReferenced.map((item) => `- ${item.standard} (${item.publisher}) - ${item.title}`) : ["- None referenced"]),
    "",
    "## CAD Components",
    data.cadDesign?.dimensions ? `Envelope: ${formatDimensions(data.cadDesign.dimensions) || "not specified"}` : "Envelope: not specified",
    ...(data.cadDesign?.components?.length ? data.cadDesign.components.map((part) => `- ${part.type}: ${part.material}${part.placement ? `; placement: ${part.placement}` : ""}. Evidence: ${part.groundedIn}`) : ["- No CAD components generated"]),
    "",
    "## Proposal",
    data.proposal || "No proposal generated."
  ];
  return lines.join("\n");
}

function Logo() {
  return (
    <div className="brand">
      <div className="logo-mark"><Box size={28} /></div>
      <div>
        <strong>Smart Health by Design</strong>
        <span>AI-Powered Design Co-Pilot</span>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY)) || null;
    } catch {
      return null;
    }
  });
  const [authStatus, setAuthStatus] = useState(session?.token ? "checking" : "signed-out");
  const [active, setActive] = useState("target");
  const [topPanel, setTopPanel] = useState(null);
  const [ideationTarget, setIdeationTarget] = useState("cad");
  const [workflowMode, setWorkflowMode] = useState("typical");
  const [evidenceViewpoint, setEvidenceViewpoint] = useState("common");
  const [designResult, setDesignResult] = useState(null);
  const [designPrompt, setDesignPrompt] = useState("");
  const [acceptedResult, setAcceptedResult] = useState(null);
  const [acceptedPrompt, setAcceptedPrompt] = useState("");
  const [designHistory, setDesignHistory] = useState([]);
  const [currentVersionId, setCurrentVersionId] = useState(null);
  const [acceptedVersionId, setAcceptedVersionId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (THEMES.includes(saved)) return saved;
    } catch {
      // Fall back to the original navy theme if browser storage is unavailable.
    }
    return "navy";
  });
  const ActiveIcon = pages.find((page) => page.id === active)?.icon || Activity;
  const isDesignComplete = hasIdeation(designResult);
  const isDesignAccepted = hasIdeation(acceptedResult) && Boolean(acceptedResult?.selectedConcept);
  const pageDisabled = (pageId) => (
    (pageId === "results" && !isDesignComplete)
    || (["evidence", "solutions"].includes(pageId) && !isDesignComplete)
    || (["explore", "cad"].includes(pageId) && !isDesignAccepted)
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Theme still works for the current session without storage.
    }
  }, [theme]);

  useEffect(() => {
    if (!session?.token) {
      setAuthStatus("signed-out");
      return;
    }

    let cancelled = false;
    authRequest("/api/auth/me", null, session.token)
      .then(({ user }) => {
        if (cancelled) return;
        const nextSession = { ...session, user };
        setSession(nextSession);
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
        setAuthStatus("signed-in");
      })
      .catch(() => {
        if (cancelled) return;
        setSession(null);
        localStorage.removeItem(AUTH_STORAGE_KEY);
        setAuthStatus("signed-out");
      });
    return () => {
      cancelled = true;
    };
  }, [session?.token]);

  function handleAuth(nextSession) {
    setSession(nextSession);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
    setAuthStatus("signed-in");
  }

  async function handleLogout() {
    const token = session?.token;
    setSession(null);
    setAuthStatus("signed-out");
    localStorage.removeItem(AUTH_STORAGE_KEY);
    if (token) {
      try {
        await authRequest("/api/auth/logout", {}, token);
      } catch {
        // Local sign-out should still complete if the server is unavailable.
      }
    }
  }

  function handleTopAction(item) {
    if (item === "History") {
      setActive("history");
      setTopPanel(null);
      return;
    }
    setTopPanel((current) => (current === item ? null : item));
  }

  function recordDesignVersion(prompt, result, kind) {
    const id = makeHistoryId();
    setCurrentVersionId(id);
    setDesignHistory((current) => [
      ...current,
      {
        id,
        version: current.length + 1,
        kind,
        prompt,
        refinementPrompt: latestRefinementPrompt(result),
        refinementProfile: latestRefinementProfile(result),
        result,
        createdAt: new Date().toISOString()
      }
    ]);
    return id;
  }

  function acceptCurrentDesign(concept) {
    const nextResult = { ...designResult, selectedConcept: concept || activeConcept(designResult) };
    setDesignResult(nextResult);
    setAcceptedPrompt(designPrompt);
    setAcceptedResult(nextResult);
    setAcceptedVersionId(currentVersionId);
    setActive(workflowMode === "phase1" ? "results" : workflowMode === "phase2" ? "cad" : "explore");
  }

  function openHistoryVersion(item) {
    setDesignPrompt(item.prompt);
    setDesignResult(item.result);
    setCurrentVersionId(item.id);
    setActive("results");
  }

  function acceptHistoryVersion(item) {
    setDesignPrompt(item.prompt);
    setDesignResult(item.result);
    setCurrentVersionId(item.id);
    setAcceptedPrompt(item.prompt);
    setAcceptedResult({ ...item.result, selectedConcept: item.result?.selectedConcept || activeConcept(item.result) });
    setAcceptedVersionId(item.id);
    setActive("explore");
  }

  if (authStatus !== "signed-in") {
    return <LandingPage onAuth={handleAuth} checking={authStatus === "checking"} />;
  }

  return (
    <main className="app">
      <header className="topbar">
        <Logo />
        <button className="sidebar-toggle" onClick={() => setSidebarOpen((open) => !open)} aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}>
          <Menu size={18} />
        </button>
        <nav className="top-actions">
          {["Retrieval", "Constraints", "Stakeholders", "History", "Export"].map((item) => (
            <button className={topPanel === item || (item === "History" && active === "history") ? "ghost active-tool" : "ghost"} key={item} onClick={() => handleTopAction(item)}>{item}</button>
          ))}
        </nav>
        <button
          className="theme-toggle"
          onClick={() => setTheme((current) => THEMES[(THEMES.indexOf(current) + 1) % THEMES.length])}
          aria-label={`Current theme: ${THEME_LABEL[theme]}. Switch theme.`}
        >
          {theme === "light" ? <Sun size={17} /> : theme === "dark" ? <Moon size={17} /> : <Palette size={17} />}
          <span>{THEME_LABEL[theme]}</span>
        </button>
        <button className="avatar" onClick={handleLogout}>{initials(session.user?.name)} <ChevronDown size={16} /></button>
        {topPanel && (
          <TopActionPanel
            panel={topPanel}
            prompt={designPrompt}
            result={designResult}
            onClose={() => setTopPanel(null)}
          />
        )}
      </header>
      <div className="mobile-tabs">
        {pages.map((page) => {
          const Icon = page.icon;
          const disabled = pageDisabled(page.id);
          return <button key={page.id} className={active === page.id ? "active" : ""} disabled={disabled} onClick={() => setActive(page.id)}><Icon size={17} />{page.label}</button>;
        })}
      </div>
      <div className={sidebarOpen ? "shell" : "shell sidebar-collapsed"}>
        {sidebarOpen && <aside className="sidebar">
          {pages.map((page) => {
            const Icon = page.icon;
            const disabled = pageDisabled(page.id);
            return <button key={page.id} className={active === page.id ? "nav-item active" : "nav-item"} disabled={disabled} onClick={() => setActive(page.id)}><Icon size={21} />{page.label}</button>;
          })}
          <div className={isDesignComplete ? "info-panel ready" : "info-panel"}>
            <h3>{isDesignComplete ? "Architecture Ready" : "Generation Gate"}</h3>
            <p>{isDesignComplete ? "Evidence and concept options are ready. Choose a concept before RAG Exploration and CAD Workspace use it." : "Run a New Design search. Results unlock after retrieval, reasoning, and concept ideation finish."}</p>
            <button className="primary inline-primary" disabled={!isDesignComplete} onClick={() => setActive("results")}>Open Architecture</button>
            {isDesignComplete && !isDesignAccepted && <small>Accept a version before RAG Exploration and CAD Workspace use it.</small>}
          </div>
        </aside>}
        <section className="screen">
          <div className="screen-title">
            <ActiveIcon size={22} />
            <span>{pages.find((page) => page.id === active)?.label}</span>
          </div>
          {active === "pipeline" && <PipelinePage />}
          {active === "knowledge" && <KnowledgePage />}
          {active === "target" && (
            <TargetSelectionPage
              value={ideationTarget}
              onSelect={(value) => {
                setIdeationTarget(value);
                setActive("workflow");
              }}
            />
          )}
          {active === "workflow" && (
            <WorkflowSelectionPage
              value={workflowMode}
              target={ideationTarget}
              onSelect={(value) => {
                setWorkflowMode(value);
                setActive(value === "phase2" && isDesignAccepted ? "cad" : "new");
              }}
              onBack={() => setActive("target")}
            />
          )}
          {active === "new" && (
            <NewDesignPage
              ideationTarget={ideationTarget}
              workflowMode={workflowMode}
              result={designResult}
              onDirectCadResult={(prompt, result) => {
                setDesignPrompt(prompt);
                setDesignResult(result);
                setAcceptedPrompt(prompt);
                setAcceptedResult(result);
                const id = recordDesignVersion(prompt, result, "Direct Phase 2 CAD");
                setAcceptedVersionId(id);
                setActive("cad");
              }}
              onResult={(prompt, result) => {
                setDesignPrompt(prompt);
                setDesignResult(result);
                setAcceptedPrompt("");
                setAcceptedResult(null);
                setAcceptedVersionId(null);
                if (hasIdeation(result)) {
                  recordDesignVersion(prompt, result, "Initial generation");
                } else {
                  setCurrentVersionId(null);
                }
              }}
              onOpenResults={() => setActive("results")}
            />
          )}
          {active === "results" && (
            <DesignResultsPage
              prompt={designPrompt}
              result={designResult}
              accepted={isDesignAccepted && acceptedResult === designResult}
              evidenceViewpoint={evidenceViewpoint}
              onEvidenceViewpointChange={setEvidenceViewpoint}
              onOpenEvidence={(viewpoint) => {
                setEvidenceViewpoint(viewpoint);
                setActive("evidence");
              }}
              onOpenSolutions={(viewpoint) => {
                setEvidenceViewpoint(viewpoint);
                setActive("solutions");
              }}
              onRefined={(result) => {
                setDesignResult(result);
                setAcceptedPrompt("");
                setAcceptedResult(null);
                setAcceptedVersionId(null);
                recordDesignVersion(designPrompt, result, "Refinement");
              }}
              onAccept={acceptCurrentDesign}
            />
          )}
          {active === "evidence" && <EvidencePage prompt={designPrompt} result={designResult} viewpoint={evidenceViewpoint} onViewpointChange={setEvidenceViewpoint} onBack={() => setActive("results")} />}
          {active === "solutions" && <PreviousSolutionsPage result={designResult} viewpoint={evidenceViewpoint} onViewpointChange={setEvidenceViewpoint} onBack={() => setActive("results")} />}
          {active === "history" && (
            <HistoryPage
              history={designHistory}
              currentVersionId={currentVersionId}
              acceptedVersionId={acceptedVersionId}
              onOpenVersion={openHistoryVersion}
              onAcceptVersion={acceptHistoryVersion}
              onCreateNew={() => setActive("new")}
            />
          )}
          {active === "explore" && <ExplorePage prompt={acceptedPrompt} result={acceptedResult} onOpenCad={() => setActive("cad")} />}
          {active === "cad" && <CadPage prompt={acceptedPrompt} result={acceptedResult} onResultUpdate={(nextResult) => {
            setAcceptedResult(nextResult);
            setDesignResult(nextResult);
          }} />}
        </section>
      </div>
    </main>
  );
}

function TopActionPanel({ panel, prompt, result, onClose }) {
  const hasResult = Boolean(result);
  const concept = activeConcept(result);
  const fileBase = safeFileBase(result?.cadLayout?.device || concept?.title || "smart-health-generated-design");

  function downloadReport() {
    if (!result) return;
    downloadTextFile(`${fileBase}-report.md`, exportMarkdown(prompt, result), "text/markdown");
  }

  function downloadJson() {
    if (!result) return;
    downloadTextFile(`${fileBase}-data.json`, JSON.stringify(exportData(prompt, result), null, 2), "application/json");
  }

  function downloadGeneratedStl() {
    if (!result?.cadLayout) return;
    downloadCadStl(result.cadLayout);
  }

  async function shareReport() {
    if (!result) return;
    const title = result.cadLayout?.device || concept?.title || "Smart Health Architecture";
    const text = exportMarkdown(prompt, result);
    try {
      if (navigator.share) {
        await navigator.share({ title, text });
      } else {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      await navigator.clipboard?.writeText(text);
    }
  }

  return (
    <aside className="top-panel">
      <button className="panel-close" onClick={onClose} aria-label="Close panel"><X size={16} /></button>
      {panel === "Stakeholders" && (
        <>
          <h3><UsersRound size={20} />Stakeholders</h3>
          <div className="list-row"><Check size={16} /><span><strong>USF SHIELD Lab</strong><small>Project stakeholder and biomedical design context.</small></span></div>
          <div className="list-row"><Check size={16} /><span><strong>Dr. John Templeton</strong><small>Human review and domain guidance stakeholder.</small></span></div>
        </>
      )}
      {panel === "Constraints" && (
        <>
          <h3><ShieldCheck size={20} />Human Approval Required</h3>
          <p>This is an AI assistant. It can misjudge retrieved evidence, design trade-offs, CAD geometry, clinical relevance, and safety implications.</p>
          <div className="list-row"><Check size={16} /><span><strong>Review before use</strong><small>Generated outputs are design support, not final medical, regulatory, or engineering approval.</small></span></div>
          <div className="list-row"><Check size={16} /><span><strong>Human sign-off</strong><small>Clinical, safety, regulatory, and fabrication decisions remain subject to qualified human approval.</small></span></div>
        </>
      )}
      {panel === "Retrieval" && (
        <>
          <h3><Search size={20} />Retrieval Grounding</h3>
          <p>The design assistant uses retrieval-augmented generation, so it gathers relevant outside evidence before asking the LLM to propose a design.</p>
          <div className="list-row"><Database size={16} /><span><strong>PrimeKG</strong><small>Matches the disease to a local biomedical knowledge graph, then retrieves related phenotypes, genes/proteins, and anatomy.</small></span></div>
          <div className="list-row"><BookOpen size={16} /><span><strong>Semantic Scholar + Europe PMC</strong><small>Searches biomedical literature for papers related to the disease, symptom, device intent, and monitoring goal.</small></span></div>
          <div className="list-row"><ClipboardList size={16} /><span><strong>Guideline RAG</strong><small>Searches local embedded chunks from MedlinePlus, ONC SAFER Guides, and USCDI for common clinical and interoperability guidance.</small></span></div>
          <div className="list-row"><ShieldCheck size={16} /><span><strong>Grounded generation</strong><small>The proposal is instructed to cite only retrieved graph nodes, papers, guideline excerpts, and standards references.</small></span></div>
        </>
      )}
      {panel === "Export" && (
        <>
          <h3><Download size={20} />Export Generated Output</h3>
          <p>{hasResult ? "Download or share the current generated package, including cited papers, definitions, genes/proteins, retrieved guidance, standards, and CAD details." : "Run a New Design search first to enable exports."}</p>
          <div className="export-actions">
            <button className="primary" disabled={!hasResult} onClick={shareReport}><Share2 size={16} />Share report</button>
            <button className="primary" disabled={!hasResult} onClick={downloadReport}><Download size={16} />Download Markdown</button>
            <button className="primary" disabled={!hasResult} onClick={downloadJson}><Download size={16} />Download JSON</button>
            <button className="primary" disabled={!result?.cadLayout} onClick={downloadGeneratedStl}><Download size={16} />Download CAD STL</button>
          </div>
        </>
      )}
    </aside>
  );
}

function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SH";
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}

function LandingPage({ onAuth, checking }) {
  const [mode, setMode] = useState("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  async function submitAuth(event) {
    event.preventDefault();
    if (status === "loading") return;

    setStatus("loading");
    setError(null);
    try {
      const data = await authRequest(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
        name,
        email,
        password
      });
      onAuth(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
      setStatus("error");
    }
  }

  return (
    <main className="landing-page">
      <header className="landing-nav">
        <Logo />
        <div className="landing-actions">
          <button className="ghost auth-button" onClick={() => setMode("login")}><LogIn size={17} />Log in</button>
          <button className="primary auth-button" onClick={() => setMode("signup")}><UserPlus size={17} />Sign up</button>
        </div>
      </header>
      <section className="landing-hero">
        <div className="landing-copy">
          <span className="eyebrow">Evidence-grounded biomedical design</span>
          <h1>Generate health product concepts, retrieve evidence, and turn ideas into CAD-ready direction.</h1>
          <p>Start with a clinical design prompt, let the system gather sources, then review a clean architecture workspace when the proposal and CAD concept are complete.</p>
          <div className="landing-cta">
            <button className="primary auth-button" onClick={() => setMode("signup")}><UserPlus size={18} />Create workspace</button>
            <button className="ghost auth-button" onClick={() => setMode("login")}><LogIn size={18} />Log in</button>
          </div>
        </div>
        <div className="landing-preview">
          <div className="preview-toolbar"><span /><span /><span /></div>
          <form className="auth-form" onSubmit={submitAuth}>
            <h2>{mode === "signup" ? "Create your account" : "Log in"}</h2>
            <p>{checking ? "Checking your saved session..." : "Accounts are saved locally in this project's SQLite database."}</p>
            {mode === "signup" && (
              <label>
                Name
                <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
              </label>
            )}
            <label>
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} required />
            </label>
            {error && <div className="auth-error">{error}</div>}
            <button className="primary auth-submit" type="submit" disabled={status === "loading" || checking}>
              {status === "loading" ? "Please wait..." : mode === "signup" ? "Sign up" : "Log in"}
            </button>
            <button className="ghost auth-switch" type="button" onClick={() => setMode(mode === "signup" ? "login" : "signup")}>
              {mode === "signup" ? "Already have an account? Log in" : "Need an account? Sign up"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function PipelinePage() {
  const columns = [
    ["1", "Retrieval-Grounded Generative Reasoning", "The system retrieves graph, literature, and guideline evidence before proposal generation.", BookOpen, "blue"],
    ["2", "Multimodal Human Feedback Integration", "Stakeholder inputs refine decisions and priorities.", UsersRound, "green"],
    ["3", "Evidence-Constrained Design Synthesis", "Ollama reasons only from retrieved PrimeKG, paper, guideline, and standards-reference blocks.", Brain, "purple"],
    ["4", "Natural Language-Driven Development", "Users guide design lifecycle with plain language.", MessageSquare, "cyan"]
  ];
  return (
    <div className="pipeline">
      <div className="hero-copy">
        <h1>AI-Driven Pipeline for Evidence-Grounded Biomedical Technology Innovation</h1>
        <p>From knowledge to concepts to real-world impact.</p>
      </div>
      <div className="pipeline-grid">
        {columns.map(([num, title, text, Icon, color]) => (
          <article className={`card accent-${color}`} key={title}>
            <div className="step"><span>{num}</span><h2>{title}</h2></div>
            <p>{text}</p>
            <div className="mini-grid">
              {pipelineEvidence.slice(0, num === "1" ? 5 : 3).map(([label, detail], idx) => (
                <div className="list-row" key={label}>{React.createElement([Search, Microscope, Database, BookOpen, ClipboardList][idx], { size: 19 })}<span><strong>{label}</strong><small>{detail}</small></span></div>
              ))}
            </div>
            <div className="icon-lane"><Icon size={42} /><BarChart3 size={42} /></div>
          </article>
        ))}
      </div>
      <div className="bottom-grid">
        <Panel title="Continuous Learning & Improvement" icon={Database} items={["Real-world data", "Performance feedback", "Knowledge update", "Better decisions"]} />
        <Panel title="Built on Trust and Transparency" icon={ShieldCheck} items={["RAG lookup", "Audit trail", "Human-in-the-loop", "CoT reasoning"]} />
      </div>
    </div>
  );
}

function KnowledgePage() {
  return (
    <div className="dashboard-grid">
      <section className="main-area">
        <h1>Knowledge Sources (Preloaded)</h1>
        <p>The actual sources used by the New Design pipeline, from graph lookup through literature and local guideline retrieval.</p>
        <div className="source-grid">
          {sourceTypes.map(({ title, badge, icon: Icon, color, description, items }) => (
            <article className={`source-card accent-${color}`} key={title}>
              <Icon size={46} />
              <h2>{title}</h2>
              <p>{description}</p>
              <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
              <button>{badge}</button>
            </article>
          ))}
        </div>
      </section>
      <aside className="right-rail">
        <Donut />
        <Panel title="Source Types" icon={Layers} items={sourceTypes.map(({ title, badge }) => `${title}: ${badge}`)} />
        <Panel title="Summary" icon={Check} items={["PrimeKG and guideline stores are local SQLite files", "Semantic Scholar, Europe PMC, and PubTator3 are live API calls", "Standards are metadata-only verify-against references"]} />
      </aside>
    </div>
  );
}

function TargetSelectionPage({ value, onSelect }) {
  return (
    <div className="setup-page">
      <section className="setup-hero">
        <span className="phase-pill">Setup</span>
        <h1>Pick the ideation target.</h1>
        <p>Choose what kind of product direction the system should explore before you decide whether to run the full architecture-to-engineering workflow.</p>
      </section>
      <div className="choice-grid setup-choice-grid">
        {ideationTargets.map(({ id, icon: Icon, title, description }) => (
          <button className={value === id ? "choice-card selected" : "choice-card"} key={id} onClick={() => onSelect(id)}>
            <Icon size={48} />
            <span>{title}</span>
            <p>{description}</p>
            <i />
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkflowSelectionPage({ value, target, onSelect, onBack }) {
  const targetLabel = ideationTargets.find((item) => item.id === target)?.title || "Design";
  return (
    <div className="setup-page">
      <section className="setup-hero">
        <span className="phase-pill">{targetLabel}</span>
        <h1>Choose the workflow depth.</h1>
        <p>Phase 1 is concept ideation, trade-offs, viewpoints, evidence, and human review. Phase 2 is engineering specs, constraints, and CAD workspace output.</p>
      </section>
      <div className="workflow-grid">
        {workflowModes.map(({ id, title, label, icon: Icon, description }) => (
          <button className={value === id ? "workflow-card selected" : "workflow-card"} key={id} onClick={() => onSelect(id)}>
            <Icon size={34} />
            <span>{label}</span>
            <strong>{title}</strong>
            <p>{description}</p>
          </button>
        ))}
      </div>
      <button className="ghost setup-back" onClick={onBack}>Back to target</button>
    </div>
  );
}

function NewDesignPage({ ideationTarget, workflowMode, result, onResult, onDirectCadResult, onOpenResults }) {
  const [prompt, setPrompt] = useState("");
  const [promptAudience, setPromptAudience] = useState("common");
  const [numOptions, setNumOptions] = useState(3);
  const [supportFiles, setSupportFiles] = useState([]);
  const [status, setStatus] = useState("idle");
  const [generationStep, setGenerationStep] = useState(0);
  const [error, setError] = useState(null);
  const isComplete = hasIdeation(result);
  const activeAudience = promptAudiences.find((item) => item.id === promptAudience) || promptAudiences[0];
  const targetLabel = ideationTargets.find((item) => item.id === ideationTarget)?.title || "CAD Design";
  const workflowLabel = workflowModes.find((item) => item.id === workflowMode)?.label || "Phase 1 + Phase 2";
  const isPhase2Only = workflowMode === "phase2";

  useEffect(() => {
    if (status !== "loading") {
      setGenerationStep(0);
      return undefined;
    }
    const timers = [900, 2400, 5200, 9200].map((delay, index) => (
      setTimeout(() => setGenerationStep(index + 1), delay)
    ));
    return () => timers.forEach(clearTimeout);
  }, [status]);

  async function runDesignSearch(event) {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || status === "loading") return;

    setStatus("loading");
    setError(null);
    onResult("", null);

    try {
      const documents = await filesToDocuments(supportFiles);
      const response = await fetch(`http://127.0.0.1:3001${isPhase2Only ? "/api/direct-cad" : "/api/design-search"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, audience: promptAudience, numOptions, documents, ideationTarget, workflowMode })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || (isPhase2Only ? "Direct CAD generation failed" : "Design search failed"));
      if (isPhase2Only) {
        onDirectCadResult(trimmed, data);
      } else {
        onResult(trimmed, data);
      }
      setStatus("idle");
    } catch (err) {
      setError(requestErrorMessage(err, isPhase2Only ? "Direct CAD generation failed" : "Design search failed"));
      setStatus("error");
    }
  }

  return (
    <div className="new-design">
      <div className="center-copy">
        <span className="phase-pill">{isPhase2Only ? "Phase 2 · Direct CAD" : "Phase 1 · Ideation"}</span>
        <h1>{isPhase2Only ? "Describe the object you want engineered into a CAD/spec concept." : "Explore the biological theory, evidence, and possible device concepts first."}</h1>
        <p>{isPhase2Only ? "Use this when you already know the form, like a knee sleeve, cup holder, glove, or bottle. It skips disease/literature grounding and focuses on fit, comfort, constraints, standards references, specs, and CAD preview." : "Start here before engineering specs or CAD. The system translates your need into a retrieval prompt, gathers evidence, and returns human-reviewable concept options."}</p>
        <div className="chip-row setup-summary">
          <span className="chip">{targetLabel}</span>
          <span className="chip">{workflowLabel}</span>
        </div>
      </div>
      <h2>1. Who is writing the prompt?</h2>
      <div className="role-select-grid">
        {promptAudiences.map(({ id, label, icon: Icon, description }) => (
          <button
            type="button"
            className={promptAudience === id ? "role-card active" : "role-card"}
            key={id}
            onClick={() => setPromptAudience(id)}
          >
            <Icon size={24} />
            <span>{label}</span>
            <small>{description}</small>
          </button>
        ))}
      </div>
      <h2>2. Describe the {isPhase2Only ? "CAD object and engineering constraints" : "health need or design goal"}</h2>
      <div className="prompt-example"><Sparkles size={24} /><div><strong>{activeAudience.label} prompt mode</strong><p>{isPhase2Only ? "Phase 2 only accepts direct object requests with optional sizing, fit, weight, comfort, material, and use constraints." : activeAudience.description}</p></div></div>
      <div className="ideation-controls">
        {!isPhase2Only && <label>
          Concept options
          <select value={numOptions} onChange={(event) => setNumOptions(Number(event.target.value))}>
            {[1, 2, 3, 4, 5].map((count) => <option value={count} key={count}>{count}</option>)}
          </select>
        </label>}
        <label className="support-upload">
          <CloudUpload size={18} />
          <span>{supportFiles.length ? `${supportFiles.length} source file${supportFiles.length === 1 ? "" : "s"} attached` : "Add PDF/manual/report"}</span>
          <input type="file" accept=".pdf,.txt,.md" multiple onChange={(event) => setSupportFiles(Array.from(event.target.files || []))} />
        </label>
      </div>
      <form className="composer" onSubmit={runDesignSearch}>
        <MessageSquare size={32} />
        <textarea
          aria-label="Describe your design goal"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={isPhase2Only ? "Example: Generate a knee sleeve CAD concept for a 5'10 adult around 180 lb, soft breathable material, adjustable compression, easy to clean, no biological evidence needed." : promptPlaceholderFor(promptAudience)}
          rows={2}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) runDesignSearch(event);
          }}
        />
        <button type="submit" disabled={status === "loading" || !prompt.trim()}><Send /></button>
      </form>

      {status === "loading" && (
        <div className="generation-panel">
          <h3><RefreshCw size={20} />{isPhase2Only ? "Phase 2 CAD/spec generation is running" : "Phase 1 is running live"}</h3>
          <GenerationSteps activeStep={generationStep} phase={isPhase2Only ? "phase2" : "phase1"} />
        </div>
      )}
      {status === "error" && (
        <div className="design-status error">
          <span className="status-dot error" />
          {error}
        </div>
      )}
      {!isPhase2Only && <div className={isComplete ? "results-gate ready" : "results-gate"}>
        <div>
          <strong>{isComplete ? "Concept options are ready" : "Architecture page is locked"}</strong>
          <p>{isComplete ? "Review the imagined device options, trade-offs, and scores before choosing one." : "The button activates after evidence retrieval and concept ideation finish."}</p>
        </div>
        <button className="primary gate-button" disabled={!isComplete} onClick={onOpenResults}>Open Architecture</button>
      </div>}
    </div>
  );
}

function GenerationSteps({ activeStep = 0, phase = "phase1" }) {
  const phase1Steps = [
    ["Preparing context", "Reading uploaded PDFs, manuals, reports, and the user role."],
    ["Parsing design intent", "Extracting condition, symptoms, target user, and device intent."],
    ["Retrieving evidence", "Searching PrimeKG, PubTator, guidelines, Semantic Scholar, and Europe PMC."],
    ["Scoring concept options", "Ranking biological fit, prior device signals, trade-offs, and human review needs."]
  ];
  const phase2Steps = [
    ["Reading object request", "Checking the requested form, sizing notes, comfort needs, and uploaded references."],
    ["Drafting engineering constraints", "Turning fit, comfort, cleaning, durability, and usability notes into specs."],
    ["Selecting standards references", "Adding verify-against engineering standards without claiming full standard text."],
    ["Building CAD preview", "Creating component specs and the 3D workspace preview."]
  ];
  const steps = phase === "phase2" ? phase2Steps : phase1Steps;
  return (
    <div className="generation-steps">
      {steps.map(([step, detail], index) => (
        <div className={index < activeStep ? "generation-step complete" : index === activeStep ? "generation-step active" : "generation-step"} key={step}>
          <span className="status-dot" />
          <strong>{step}</strong>
          <small>{detail}</small>
        </div>
      ))}
    </div>
  );
}

function DesignResultsPage({ prompt, result, accepted, evidenceViewpoint, onEvidenceViewpointChange, onOpenEvidence, onOpenSolutions, onRefined, onAccept }) {
  const [refineAudience, setRefineAudience] = useState(result?.promptProfile?.role || "common");
  const [refinement, setRefinement] = useState("");
  const [supportFiles, setSupportFiles] = useState([]);
  const [selectedConceptId, setSelectedConceptId] = useState(result?.selectedConcept?.id || result?.ideation?.recommendedOptionId || result?.ideation?.options?.[0]?.id || "");
  const [refineStatus, setRefineStatus] = useState("idle");
  const [refineError, setRefineError] = useState(null);
  const activeRefineAudience = promptAudiences.find((item) => item.id === refineAudience) || promptAudiences[0];
  const conceptOptions = result?.ideation?.options || [];
  const selectedConcept = conceptOptions.find((option) => option.id === selectedConceptId) || conceptOptions[0] || null;

  useEffect(() => {
    setSelectedConceptId(result?.selectedConcept?.id || result?.ideation?.recommendedOptionId || result?.ideation?.options?.[0]?.id || "");
  }, [result]);

  if (!conceptOptions.length) {
    return (
      <div className="empty-results">
        <Box size={42} />
        <h1>No concept options yet</h1>
        <p>Run a New Design search first. This page unlocks once the evidence retrieval and concept ideation are complete.</p>
      </div>
    );
  }

  async function submitRefinement(event) {
    event.preventDefault();
    const trimmed = refinement.trim();
    if (!trimmed || refineStatus === "loading") return;

    setRefineStatus("loading");
    setRefineError(null);
    try {
      const documents = await filesToDocuments(supportFiles);
      const response = await fetch("http://127.0.0.1:3001/api/design-refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, audience: refineAudience, documents, previousPrompt: prompt, previousResult: result })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || "Design refinement failed");
      onRefined(data);
      setRefinement("");
      setSupportFiles([]);
      setRefineStatus("idle");
    } catch (err) {
      setRefineError(requestErrorMessage(err, "Design refinement failed"));
      setRefineStatus("error");
    }
  }

  return (
    <div className="generated-page">
      <section className="generated-hero">
        <div>
          <span className="eyebrow">Initial proposal ideation</span>
          <h1>{result.ideation.summary || "Choose a concept direction"}</h1>
          <div className="chip-row">
            <span className="chip">{result.promptProfile?.roleLabel || "Prompt author"}</span>
            <span className="chip">{conceptOptions.length} concept option{conceptOptions.length === 1 ? "" : "s"}</span>
            {result.supplementalDocuments?.length > 0 && <span className="chip">{result.supplementalDocuments.length} uploaded source{result.supplementalDocuments.length === 1 ? "" : "s"}</span>}
          </div>
          <p>{prompt}</p>
          {result.promptProfile?.engineeringPrompt && result.promptProfile.engineeringPrompt !== prompt && (
            <div className="engineering-prompt-note">
              <strong>Engineering retrieval prompt</strong>
              <span>{result.promptProfile.engineeringPrompt}</span>
            </div>
          )}
        </div>
        <div className="completion-card">
          <CheckCircle2 size={28} />
          <strong>{accepted ? "Accepted concept" : "Concepts ready for review"}</strong>
          <span>{accepted ? "RAG Exploration and CAD Workspace are using this concept." : "Pick the best direction, refine it, or upload more context."}</span>
        </div>
      </section>

      <section className="architecture-workspace">
        <div className="architecture-concepts">
          <section className="ideation-option-grid">
            {conceptOptions.map((option) => (
              <ConceptIdeationCard
                key={option.id}
                option={option}
                recommended={option.id === result.ideation.recommendedOptionId}
                selected={selectedConcept?.id === option.id}
                onSelect={() => setSelectedConceptId(option.id)}
              />
            ))}
          </section>
        </div>

        <aside className="architecture-side-rail" aria-label="Architecture controls">
          <article className="panel refine-panel">
            <h3><MessageSquare size={20} />Refine Ideation</h3>
            <div className="refine-depth-row" role="group" aria-label="Refinement prompt mode">
              {promptAudiences.map(({ id, label, icon: Icon }) => (
                <button
                  type="button"
                  className={refineAudience === id ? "active" : ""}
                  key={id}
                  onClick={() => setRefineAudience(id)}
                >
                  <Icon size={16} />{label}
                </button>
              ))}
            </div>
            <p className="refine-depth-note">{activeRefineAudience.description}</p>
            <label className="support-upload refine-upload">
              <CloudUpload size={18} />
              <span>{supportFiles.length ? `${supportFiles.length} source file${supportFiles.length === 1 ? "" : "s"} attached` : "Add PDF/manual/report to refine ideation"}</span>
              <input type="file" accept=".pdf,.txt,.md" multiple onChange={(event) => setSupportFiles(Array.from(event.target.files || []))} />
            </label>
            <form className="refine-form rail-form" onSubmit={submitRefinement}>
              <textarea
                aria-label="Describe how to improve the generated design"
                value={refinement}
                onChange={(event) => setRefinement(event.target.value)}
                placeholder={promptPlaceholderFor(refineAudience, "refine")}
                rows={4}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) submitRefinement(event);
                }}
              />
              <button className="primary" type="submit" disabled={refineStatus === "loading" || !refinement.trim()}>{refineStatus === "loading" ? "Improving..." : "Refine Options"}</button>
            </form>
            {refineError && <div className="design-status error"><span className="status-dot error" />{refineError}</div>}
            {result.refinementHistory?.length > 0 && <p>{result.refinementHistory.length} refinement{result.refinementHistory.length === 1 ? "" : "s"} applied to this draft.</p>}
            <button className="success accept-button" onClick={() => onAccept(selectedConcept)} disabled={accepted || !selectedConcept}>{accepted ? "Accepted" : "I Like This Concept"}</button>
          </article>

          <EvidenceRequestPanel
            viewpoint={evidenceViewpoint}
            onViewpointChange={onEvidenceViewpointChange}
            onSubmit={() => onOpenEvidence(evidenceViewpoint)}
          />

          <article className="panel human-loop-panel">
            <h3><Search size={20} />Previous Solutions</h3>
            <p>Open a separate review page for prior papers, device-family clues, and similar public solution notes.</p>
            <button className="primary evidence-only-button" type="button" onClick={() => onOpenSolutions(evidenceViewpoint)}>Open Previous Solutions</button>
          </article>

          <article className="panel human-loop-panel">
            <h3><Eye size={20} />Evidence hidden by default</h3>
            <p>The concept cards use retrieved evidence for scoring and trade-offs, but raw evidence, clinical guidance, and prior solution details live on separate review pages.</p>
          </article>
        </aside>
      </section>
    </div>
  );
}

function EvidencePage({ prompt, result, viewpoint, onViewpointChange, onBack }) {
  if (!result) {
    return (
      <div className="empty-results">
        <FileText size={42} />
        <h1>No evidence yet</h1>
        <p>Run Phase 1 ideation first, then open evidence from the architecture controls.</p>
      </div>
    );
  }

  const { kgGrounded, subgraph, literature = [], guidelines = [], standardsReferenced = [], proposal } = result;
  const isPlainView = ["common", "caregiver"].includes(viewpoint);
  return (
    <div className="review-page">
      <section className="generated-hero review-hero">
        <div>
          <span className="eyebrow">Separate evidence review</span>
          <h1>Evidence and clinical guidance</h1>
          <p>Evidence stays off the architecture page until a reviewer asks for it. Choose the viewpoint to control the type and depth of details shown.</p>
        </div>
        <article className="panel review-control-card">
          <EvidenceRequestPanel viewpoint={viewpoint} onViewpointChange={onViewpointChange} />
          <button className="ghost evidence-only-button" onClick={onBack}>Back to Architecture</button>
        </article>
      </section>

      {isPlainView && <CommonResults prompt={prompt} result={result} />}

      {!isPlainView && <article className="panel">
        <h3><Database size={20} />Knowledge Graph Grounding (PrimeKG)</h3>
        {!kgGrounded && <p>No matching disease node found in PrimeKG for this prompt.</p>}
        {kgGrounded && (
          <>
            <p>
              Disease: <strong>{subgraph.disease.name}</strong> ({subgraph.disease.source}:{subgraph.disease.id})
            </p>
            <EvidenceGroup label="Phenotypes" nodes={subgraph.phenotypes} total={subgraph.counts.phenotypesTotal} />
            <EvidenceGroup label="Associated genes/proteins" nodes={subgraph.proteins} total={subgraph.counts.proteinsTotal} />
            <EvidenceGroup label="Related anatomy" nodes={subgraph.anatomy} total={subgraph.anatomy.length} />
          </>
        )}
      </article>}

      {["engineer", "researcher", "regulatory"].includes(viewpoint) && <FormattedProposal text={proposal} />}
      <TechnicalEvidenceOptions result={result} viewpoint={viewpoint} />

      {["doctor", "engineer", "researcher"].includes(viewpoint) && <article className="panel">
        <h3><BookOpen size={20} />Literature Evidence</h3>
        {literature.length === 0 && <p>No papers retrieved for this prompt.</p>}
        {literature.map((paper) => (
          <div className="paper-card" key={paper.title}>
            <a href={paper.url} target="_blank" rel="noreferrer">{paper.title}</a>
            <span>{[paper.source, paper.venue, paper.year].filter(Boolean).join(" · ")}</span>
            {paper.abstract && <p>{paper.abstract.slice(0, 220)}...</p>}
          </div>
        ))}
      </article>}

      {["doctor", "engineer", "researcher", "regulatory"].includes(viewpoint) && <article className="panel">
        <h3><ShieldCheck size={20} />Clinical & Regulatory Guidance</h3>
        {guidelines.length === 0 && <p>No guideline excerpts retrieved for this prompt.</p>}
        <div className="solution-list">
          {guidelines.map((hit) => (
            <details className="solution-row" key={`${hit.source}-${hit.title}-${hit.text.slice(0, 20)}`}>
              <summary>
                <strong>{hit.title}</strong>
                <span>{hit.source}</span>
                <p>{plainSnippet(hit.text, 220)}</p>
              </summary>
              <p>{hit.text}</p>
              {hit.url && <a href={hit.url} target="_blank" rel="noreferrer">Open cited source</a>}
            </details>
          ))}
        </div>
        <div className="evidence-group">
          <h4>Standards to verify against <small>(reference only - not full-text indexed)</small></h4>
          <div className="chip-row">
            {standardsReferenced.map((s) => (
              <span className="chip" key={s.standard} title={s.title}>{s.standard}</span>
            ))}
          </div>
        </div>
      </article>}
    </div>
  );
}

function PreviousSolutionsPage({ result, viewpoint, onViewpointChange, onBack }) {
  if (!result) {
    return (
      <div className="empty-results">
        <Search size={42} />
        <h1>No previous solutions yet</h1>
        <p>Run Phase 1 ideation first, then open previous solutions from the architecture controls.</p>
      </div>
    );
  }

  return (
    <div className="review-page">
      <section className="generated-hero review-hero">
        <div>
          <span className="eyebrow">Separate solution review</span>
          <h1>Similar or previous solutions</h1>
          <p>Prior solution notes live here so the architecture page can stay focused on concept comparison and refinement.</p>
        </div>
        <article className="panel review-control-card">
          <h3><Eye size={20} />Reviewer Viewpoint</h3>
          <div className="viewpoint-grid" role="group" aria-label="Previous solution viewpoint">
            {evidenceViewpoints.filter((item) => ["doctor", "engineer", "researcher", "regulatory"].includes(item.id)).map(({ id, label, icon: Icon }) => (
              <button type="button" className={viewpoint === id ? "active" : ""} key={id} onClick={() => onViewpointChange(id)}>
                <Icon size={16} />{label}
              </button>
            ))}
          </div>
          <button className="ghost evidence-only-button" onClick={onBack}>Back to Architecture</button>
        </article>
      </section>
      <SimilarSolutionsPanel result={result} />
    </div>
  );
}

function HistoryPage({ history, currentVersionId, acceptedVersionId, onOpenVersion, onAcceptVersion, onCreateNew }) {
  if (!history.length) {
    return (
      <div className="empty-results">
        <History size={42} />
        <h1>No design history yet</h1>
        <p>Generate a design, then refine it as many times as needed. Every completed version will appear here.</p>
        <button className="primary gate-button" onClick={onCreateNew}>Start a New Design</button>
      </div>
    );
  }

  return (
    <div className="history-page">
      <section className="generated-hero history-hero">
        <div>
          <span className="eyebrow">Design version history</span>
          <h1>{history.length} generated version{history.length === 1 ? "" : "s"}</h1>
          <p>Review earlier drafts, reopen a version for refinement, or choose the exact design that should drive RAG Exploration and the CAD Workspace.</p>
        </div>
        <div className="completion-card">
          <History size={28} />
          <strong>{acceptedVersionId ? "Accepted version selected" : "No accepted version yet"}</strong>
              <span>{acceptedVersionId ? "RAG and CAD are using the concept marked Accepted." : "Use I Like This Concept here or on the architecture page."}</span>
        </div>
      </section>

      <section className="history-list">
        {[...history].reverse().map((item) => {
          const concept = activeConcept(item.result);
          const layout = item.result?.cadLayout || {};
          const components = layout.components || [];
          const optionCount = item.result?.ideation?.options?.length || 0;
          const isCurrent = currentVersionId === item.id;
          const isAccepted = acceptedVersionId === item.id;
          return (
            <article className={isAccepted ? "history-card accepted" : "history-card"} key={item.id}>
              <div className="history-card-header">
                <div>
                  <span className="eyebrow">Version {item.version}</span>
                  <h2>{concept?.title || layout.device || "Generated architecture"}</h2>
                  <p>{item.kind} {item.createdAt ? `on ${new Date(item.createdAt).toLocaleString()}` : ""}</p>
                </div>
                <div className="history-badges">
                  {isAccepted && <span className="chip success-chip"><Check size={13} />Accepted</span>}
                  {isCurrent && <span className="chip">Current draft</span>}
                  <span className="chip">{concept?.formFactor || layout.formFactor || "Auto form factor"}</span>
                </div>
              </div>

              <div className="history-summary-grid">
                <div>
                  <strong>Original prompt</strong>
                  <p>{item.prompt || "No prompt recorded."}</p>
                </div>
                {item.refinementPrompt && (
                  <div>
                    <strong>Refinement prompt</strong>
                    <p>{item.refinementPrompt}</p>
                    {item.refinementProfile?.engineeringPrompt && item.refinementProfile.engineeringPrompt !== item.refinementPrompt && (
                      <small>Engineering refinement: {item.refinementProfile.engineeringPrompt}</small>
                    )}
                  </div>
                )}
                <div>
                  <strong>{components.length ? "CAD components" : "Concept options"}</strong>
                  <p>{components.length ? components.map((component) => component.type).join(", ") : `${optionCount} ideation option${optionCount === 1 ? "" : "s"} generated.`}</p>
                  {concept && <small>Selected concept: {concept.title} ({evidenceLabel(concept.evidenceStrength?.overall || 0)} evidence strength)</small>}
                </div>
                <div>
                  <strong>Evidence included</strong>
                  <p>{item.result?.literature?.length || 0} papers, {item.result?.guidelines?.length || 0} guideline hits, {item.result?.standardsReferenced?.length || 0} standards references.</p>
                </div>
              </div>

              <div className="history-actions">
                <button className="primary" onClick={() => onOpenVersion(item)}>Review Version</button>
                <button className="success" onClick={() => onAcceptVersion(item)} disabled={isAccepted}>{isAccepted ? "Accepted" : "I Like This Concept"}</button>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function ConceptIdeationCard({ option, recommended, selected, onSelect }) {
  const score = option.evidenceStrength?.overall ?? 0;
  return (
    <article className={selected ? "concept-option-card selected" : "concept-option-card"}>
      <div className="concept-card-header">
        <div>
          <span className="eyebrow">{recommended ? "Recommended" : option.formFactor}</span>
          <h2>{option.title}</h2>
        </div>
        <div className="score-ring" style={{ "--score": `${score}%` }}>
          <span>{score}</span>
        </div>
      </div>
      <ConceptIllustration formFactor={option.formFactor} title={option.title} />
      <p>{option.plainDescription}</p>
      <div className="evidence-strength-bars">
        {Object.entries(option.evidenceStrength || {}).map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{evidenceLabel(value)}</strong>
            <i style={{ "--bar": `${clampUiScore(value)}%` }} />
          </div>
        ))}
      </div>
      <div className="tradeoff-list">
        {(option.tradeoffs || []).slice(0, 3).map((tradeoff) => (
          <div key={`${option.id}-${tradeoff.label}`}>
            <strong>{tradeoff.label}</strong>
            <span>{tradeoff.rating}</span>
            <small>{tradeoff.detail}</small>
          </div>
        ))}
      </div>
      <div className="concept-action-row">
        <button className={selected ? "success" : "primary"} onClick={onSelect}>{selected ? "Selected" : "Select Concept"}</button>
      </div>
    </article>
  );
}

function EvidenceRequestPanel({ viewpoint, onViewpointChange, onSubmit, actionLabel = "Open Evidence Page" }) {
  const activeView = evidenceViewpoints.find((item) => item.id === viewpoint) || evidenceViewpoints[0];

  return (
    <article className="panel evidence-request-panel">
      <h3><BookOpen size={20} />Evidence View</h3>
      <div className="viewpoint-grid" role="group" aria-label="Evidence viewpoint">
        {evidenceViewpoints.map(({ id, label, icon: Icon }) => (
          <button type="button" className={viewpoint === id ? "active" : ""} key={id} onClick={() => onViewpointChange(id)}>
            <Icon size={16} />{label}
          </button>
        ))}
      </div>
      <p>{activeView.description}</p>
      {onSubmit && <button className="primary evidence-only-button" type="button" onClick={onSubmit}>{actionLabel}</button>}
    </article>
  );
}

function clampUiScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

function ConceptIllustration({ formFactor, title }) {
  const normalized = String(formFactor || "").toLowerCase();
  return (
    <div className={`concept-image concept-image-${normalized.replace(/[^a-z0-9]+/g, "-") || "generic"}`}>
      <Canvas camera={{ position: [2.8, 2.1, 3.2], fov: 42 }}>
        <ambientLight intensity={0.72} />
        <directionalLight position={[3, 4, 3]} intensity={1.1} />
        <ConceptPreviewShape formFactor={normalized} />
        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={1.2} />
      </Canvas>
      <div className="concept-image-caption">
        <span>{formFactor || "Concept"}</span>
        <small>{title}</small>
      </div>
    </div>
  );
}

function ConceptPreviewShape({ formFactor }) {
  const cyan = "#08c9d6";
  const blue = "#2d86ff";
  const green = "#41c96b";
  const yellow = "#f3bc26";
  const purple = "#9b55e6";
  const elongatedObject = /\b(sword|blade|stick|cane|bat|wand|rod|bar|club|racket)\b/.test(formFactor);
  const shell = formFactor.includes("mouth") || formFactor.includes("retainer") ? yellow
    : elongatedObject ? yellow
    : formFactor.includes("holder") ? purple
    : formFactor.includes("glove") ? green
    : formFactor.includes("bottle") ? blue
    : formFactor.includes("cup") ? blue
    : formFactor.includes("patch") ? green
    : formFactor.includes("cast") ? purple
    : formFactor.includes("clip") ? cyan
    : blue;

  if (formFactor.includes("mouth") || formFactor.includes("retainer")) {
    return (
      <group rotation={[0.45, 0, 0]}>
        <mesh scale={[1.45, 0.72, 0.16]}>
          <torusGeometry args={[0.78, 0.08, 18, 80, Math.PI * 1.35]} />
          <meshStandardMaterial color={shell} metalness={0.18} roughness={0.35} />
        </mesh>
        <mesh position={[0.18, -0.25, 0.02]} scale={[0.55, 0.16, 0.08]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={cyan} metalness={0.25} roughness={0.35} />
        </mesh>
      </group>
    );
  }

  if (elongatedObject) {
    return (
      <group rotation={[0.22, -0.48, 0.18]}>
        <mesh position={[0, 0.28, 0]} scale={[0.14, 1.45, 0.055]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={shell} metalness={0.28} roughness={0.32} />
        </mesh>
        <mesh position={[0, 1.1, 0]} scale={[0.18, 0.3, 0.06]}>
          <coneGeometry args={[1, 1, 4]} />
          <meshStandardMaterial color={shell} metalness={0.28} roughness={0.32} />
        </mesh>
        <mesh position={[0, -0.62, 0.02]} scale={[0.82, 0.11, 0.08]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={cyan} metalness={0.22} roughness={0.36} />
        </mesh>
        <mesh position={[0, -1.02, 0]} scale={[0.16, 0.6, 0.1]}>
          <cylinderGeometry args={[1, 1, 1, 24]} />
          <meshStandardMaterial color={blue} metalness={0.18} roughness={0.42} />
        </mesh>
        <mesh position={[0.18, -0.92, 0.12]} scale={[0.08, 0.08, 0.04]}>
          <sphereGeometry args={[1, 18, 12]} />
          <meshStandardMaterial color={green} emissive={green} emissiveIntensity={0.12} />
        </mesh>
      </group>
    );
  }

  if (formFactor.includes("holder")) {
    return (
      <group rotation={[0.34, -0.55, 0.08]}>
        <mesh position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.78, 0.09, 18, 64]} />
          <meshStandardMaterial color={shell} metalness={0.2} roughness={0.36} />
        </mesh>
        <mesh position={[0, -0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.68, 0.68, 0.12, 42]} />
          <meshStandardMaterial color={blue} metalness={0.18} roughness={0.42} />
        </mesh>
        <mesh position={[0.88, -0.06, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.28, 0.055, 16, 42]} />
          <meshStandardMaterial color={cyan} />
        </mesh>
        <mesh position={[0.28, 0.08, 0.54]} scale={[0.16, 0.16, 0.08]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={yellow} emissive={yellow} emissiveIntensity={0.14} />
        </mesh>
      </group>
    );
  }

  if (formFactor.includes("glove")) {
    return (
      <group rotation={[0.45, -0.32, 0.12]}>
        <mesh position={[0, -0.22, 0]} scale={[0.72, 0.62, 0.12]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={shell} metalness={0.08} roughness={0.52} />
        </mesh>
        {[-0.36, -0.12, 0.12, 0.36].map((x, index) => (
          <mesh key={x} position={[x, 0.45, 0]} scale={[0.13, 0.52 - index * 0.03, 0.1]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={shell} metalness={0.08} roughness={0.52} />
          </mesh>
        ))}
        <mesh position={[-0.58, -0.08, 0]} rotation={[0, 0, -0.65]} scale={[0.13, 0.46, 0.1]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={shell} metalness={0.08} roughness={0.52} />
        </mesh>
        <mesh position={[0.05, -0.18, 0.14]} scale={[0.28, 0.18, 0.055]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={cyan} emissive={cyan} emissiveIntensity={0.08} />
        </mesh>
        <mesh position={[0.12, 0.5, 0.14]} scale={[0.08, 0.08, 0.05]}>
          <sphereGeometry args={[1, 18, 12]} />
          <meshStandardMaterial color={yellow} />
        </mesh>
      </group>
    );
  }

  if (formFactor.includes("bottle") || formFactor.includes("cup")) {
    return (
      <group rotation={[0.15, -0.35, 0]}>
        <mesh position={[0, -0.08, 0]} scale={[0.48, 1.18, 0.48]}>
          <cylinderGeometry args={[0.55, 0.42, 1.6, 36]} />
          <meshStandardMaterial color={shell} metalness={0.18} roughness={0.36} transparent opacity={0.82} />
        </mesh>
        <mesh position={[0, 0.86, 0]} scale={[0.34, 0.28, 0.34]}>
          <cylinderGeometry args={[0.48, 0.48, 0.55, 32]} />
          <meshStandardMaterial color={cyan} metalness={0.28} roughness={0.3} />
        </mesh>
        <mesh position={[0.38, 0.1, 0.08]} scale={[0.2, 0.2, 0.05]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={yellow} emissive={yellow} emissiveIntensity={0.16} />
        </mesh>
        <mesh position={[-0.32, -0.35, 0.08]} scale={[0.16, 0.16, 0.05]}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshStandardMaterial color={green} />
        </mesh>
      </group>
    );
  }

  if (formFactor.includes("patch")) {
    return (
      <group rotation={[0.35, -0.25, 0.15]}>
        <mesh scale={[1.65, 0.92, 0.12]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={shell} metalness={0.12} roughness={0.48} />
        </mesh>
        <mesh position={[0, 0, 0.13]} scale={[0.58, 0.42, 0.09]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={blue} metalness={0.3} roughness={0.38} />
        </mesh>
        <mesh position={[0.48, 0.22, 0.24]} scale={[0.14, 0.14, 0.14]}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshStandardMaterial color={yellow} emissive={yellow} emissiveIntensity={0.18} />
        </mesh>
      </group>
    );
  }

  if (formFactor.includes("cast")) {
    return (
      <group rotation={[0.2, 0.45, -0.12]}>
        <mesh scale={[0.55, 0.55, 1.55]}>
          <cylinderGeometry args={[0.55, 0.68, 1.65, 34, 1, true]} />
          <meshStandardMaterial color={shell} metalness={0.08} roughness={0.62} />
        </mesh>
        <mesh position={[0.56, 0, 0.25]} scale={[0.18, 0.18, 0.32]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={cyan} />
        </mesh>
      </group>
    );
  }

  if (formFactor.includes("clip")) {
    return (
      <group rotation={[0.35, -0.55, 0.06]}>
        <mesh position={[-0.25, 0, 0]} scale={[0.38, 0.92, 0.24]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={shell} metalness={0.24} roughness={0.34} />
        </mesh>
        <mesh position={[0.28, 0, 0]} scale={[0.18, 0.82, 0.18]}>
          <torusGeometry args={[0.75, 0.08, 18, 48]} />
          <meshStandardMaterial color={blue} />
        </mesh>
      </group>
    );
  }

  if (formFactor.includes("handheld")) {
    return (
      <group rotation={[0.25, -0.45, 0.08]}>
        <mesh scale={[0.78, 1.35, 0.18]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={shell} metalness={0.18} roughness={0.42} />
        </mesh>
        <mesh position={[0, 0.28, 0.13]} scale={[0.48, 0.42, 0.04]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={cyan} emissive={cyan} emissiveIntensity={0.1} />
        </mesh>
        <mesh position={[0, -0.48, 0.14]} scale={[0.16, 0.16, 0.06]}>
          <cylinderGeometry args={[1, 1, 1, 28]} />
          <meshStandardMaterial color={yellow} />
        </mesh>
      </group>
    );
  }

  return (
    <group rotation={[0.35, -0.35, 0.1]}>
      <mesh scale={[1.15, 0.62, 0.18]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={shell} metalness={0.18} roughness={0.38} />
      </mesh>
      <mesh position={[0.62, 0, 0.08]} scale={[0.18, 0.18, 0.18]}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshStandardMaterial color={green} />
      </mesh>
    </group>
  );
}

function SmileLikeIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9c1.8 3.5 4.4 5.2 8 5.2S18.2 12.5 20 9" />
      <path d="M7 10.5c.4 3.3 2 5 5 5s4.6-1.7 5-5" />
      <path d="M8 7.5h8" />
    </svg>
  );
}

function AudienceToggle({ value, onChange }) {
  return (
    <article className="panel audience-panel">
      <h3><Eye size={20} />Evidence Viewpoint</h3>
      <div className="segmented-control tri-control" role="group" aria-label="Result detail level">
        <button className={value === "common" ? "active" : ""} onClick={() => onChange("common")}>Common user</button>
        <button className={value === "doctor" ? "active" : ""} onClick={() => onChange("doctor")}>Doctor</button>
        <button className={value === "engineer" ? "active" : ""} onClick={() => onChange("engineer")}>Engineer</button>
      </div>
      <p>{value === "common" ? "Shows plain-language context and review notes without the full evidence tables." : value === "doctor" ? "Shows clinical guidance, phenotype context, and literature details for clinician review." : "Shows components, standards references, engineering trade-offs, and retrieved technical evidence."}</p>
    </article>
  );
}

function CommonResults({ prompt, result }) {
  const info = commonUserInfo(result);
  return (
    <>
      <article className="panel common-summary">
        <h3><Sparkles size={20} />Plain-Language Summary</h3>
        <p>{commonSummary(prompt, result)}</p>
        <div className="summary-points">
          <div><strong>Who it is for</strong><span>{result.extraction?.disease ? `People with ${result.extraction.disease}` : "The user group described in the prompt"}</span></div>
          <div><strong>Main goal</strong><span>{result.extraction?.deviceIntent || "Support smart health monitoring"}</span></div>
          <div><strong>Review note</strong><span>This is an AI-generated concept and needs human review before clinical, safety, or engineering use.</span></div>
        </div>
      </article>
      <article className="panel common-info-panel">
        <h3><BookOpen size={20} />Common Info & Terms</h3>
        <div className="common-info-grid">
          {info.terminology.map((item) => (
            <details className="common-info-card" key={item.term}>
              <summary>
                <strong>{item.term}</strong>
                <span>{item.description}</span>
              </summary>
              <p>{item.fullDescription || item.description}</p>
              {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Source: {item.sourceTitle || item.sourceUrl}</a>}
            </details>
          ))}
        </div>
      </article>
      <article className="panel common-info-panel">
        <h3><ShieldCheck size={20} />Clinical Guidance</h3>
        <div className="solution-list">
          {info.clinicalGuidance.map((item) => (
            <details className="solution-row" key={`${item.source}-${item.title}`}>
              <summary>
                <strong>{item.title}</strong>
                <span>{item.source}</span>
                <p>{item.detail}</p>
              </summary>
              <p>{item.fullDetail || item.detail}</p>
              {item.url && <a href={item.url} target="_blank" rel="noreferrer">Open cited source</a>}
            </details>
          ))}
        </div>
      </article>
      <article className="panel">
        <h3><ShieldCheck size={20} />Human Review Note</h3>
        <p>This design may be useful as an early concept, but it is not medical advice, diagnosis, a finished device, or an approved design. A clinician, physician, biomedical engineer, or qualified reviewer should check it before anyone relies on it.</p>
      </article>
    </>
  );
}

function SimilarSolutionsPanel({ result }) {
  const { solutions } = commonUserInfo(result);
  return (
    <article className="panel common-info-panel">
      <h3><Search size={20} />Similar Or Previous Solutions</h3>
      <div className="solution-list">
        {solutions.map((item) => (
          <details className="solution-row" key={`${item.source}-${item.title}`}>
            <summary>
              <strong>{item.title}</strong>
              <span>{item.source}</span>
              <p>{item.detail}</p>
            </summary>
            <p>{item.fullDetail || item.detail}</p>
            {item.url && <a href={item.url} target="_blank" rel="noreferrer">Open cited source</a>}
          </details>
        ))}
      </div>
    </article>
  );
}

function commonUserInfo(result) {
  const diseaseName = result.subgraph?.disease?.name || result.extraction?.disease || "Target condition";
  const symptom = result.extraction?.symptomPhrase || "Target symptom";
  const intent = result.extraction?.deviceIntent || "Smart health monitoring";
  const topPhenotypes = result.subgraph?.phenotypes?.slice(0, 3).map((node) => node.name) || [];
  const topAnatomy = result.subgraph?.anatomy?.slice(0, 2).map((node) => node.name) || [];
  const guideline = result.guidelines?.[0];
  const papers = result.literature?.slice(0, 4) || [];

  const terminology = [
    {
      term: diseaseName,
      description: guideline?.text
        ? plainSnippet(guideline.text)
        : "The condition named in the design prompt. The generated concept should be checked against trusted clinical information for this disease.",
      fullDescription: guideline?.text || "The condition named in the design prompt. The generated concept should be checked against trusted clinical information for this disease.",
      sourceTitle: guideline?.title,
      sourceUrl: guideline?.url
    },
    {
      term: symptom,
      description: topPhenotypes.length
        ? `Related health features found in the knowledge graph include ${topPhenotypes.join(", ")}.`
        : "The symptom or health concern the user wants the design to help monitor or support.",
      fullDescription: topPhenotypes.length
        ? `The app found related health features in the knowledge graph: ${topPhenotypes.join(", ")}. These are not a diagnosis or a final clinical interpretation; they are clues a doctor or biomedical engineer can use while reviewing the concept.`
        : "The symptom or health concern the user wants the design to help monitor or support. A medical professional should decide whether this symptom can be measured safely and meaningfully."
    },
    {
      term: intent,
      description: "The intended role of the product concept, such as monitoring, alerting, tracking, or helping a person and care team notice changes.",
      fullDescription: "This describes what the product is trying to help with. For example, a monitoring device might track changes over time, a support tool might help a patient notice patterns, and an alerting concept might suggest when a person should contact a care team. The generated design is still only an early concept."
    },
    {
      term: "Body signals",
      description: topAnatomy.length
        ? `The retrieved graph points toward related anatomy such as ${topAnatomy.join(", ")}. A professional should decide which signals are clinically meaningful.`
        : "Measurements from the body, such as movement, breathing, heart rate, temperature, or other sensor data, depending on the condition.",
      fullDescription: topAnatomy.length
        ? `The retrieved graph points toward related anatomy such as ${topAnatomy.join(", ")}. In plain terms, this means the design may need to consider body measurements connected to those areas or systems. A professional should decide which body signals are clinically meaningful and whether they can be measured reliably.`
        : "Body signals are measurements from the body, such as movement, breathing, heart rate, temperature, oxygen levels, or other sensor data. Which signals matter depends on the condition and should be reviewed by a professional."
    }
  ];

  const solutions = papers.length
    ? papers.map((paper) => ({
        title: paper.title,
        source: [paper.source, paper.venue, paper.year].filter(Boolean).join(" | ") || "Literature source",
        detail: paper.abstract
          ? `A related public paper was found. In simple terms, it may help compare this design idea with prior research: ${plainSnippet(paper.abstract, 150)}`
          : "A related public paper was found. Open the cited source for details.",
        fullDetail: paper.abstract || "No abstract was returned for this paper. The cited source may still be useful for a doctor or engineer to review.",
        url: paper.url
      }))
    : [
        {
          title: "Wearable monitoring concept",
          source: "Generated CAD proposal",
          detail: "The current CAD concept is an early illustrative design based on the generated component list.",
          fullDetail: "The current CAD concept is an early illustrative design based on the generated component list. It should be treated as a conversation starter, not a validated device."
        },
        {
          title: "Clinical information source",
          source: guideline?.source || "Public guideline index",
          detail: guideline ? `${guideline.title}: ${plainSnippet(guideline.text, 150)}` : "No public guideline excerpt was retrieved for this run.",
          fullDetail: guideline?.text || "No public guideline excerpt was retrieved for this run.",
          url: guideline?.url
        }
      ];

  const clinicalGuidance = result.guidelines?.length
    ? result.guidelines.slice(0, 4).map((hit) => ({
        title: hit.title,
        source: hit.source,
        detail: plainSnippet(hit.text, 160),
        fullDetail: hit.text,
        url: hit.url
      }))
    : [
        {
          title: "No clinical guidance excerpt retrieved",
          source: "Local guideline index",
          detail: "No public clinical guidance excerpt was retrieved for this run.",
          fullDetail: "No public clinical guidance excerpt was retrieved for this run. A professional should review trusted clinical guidance before the design is used."
        }
      ];

  return { terminology, solutions, clinicalGuidance };
}

function plainSnippet(text, maxLength = 180) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).replace(/\s+\S*$/, "")}...`;
}

function commonSummary(prompt, result) {
  const condition = result.extraction?.disease ? ` for people with ${result.extraction.disease}` : "";
  const symptom = result.extraction?.symptomPhrase ? ` related to ${result.extraction.symptomPhrase}` : "";
  const intent = result.extraction?.deviceIntent || "smart health monitoring";
  const concept = activeConcept(result);
  const optionCount = result.ideation?.options?.length || 0;
  const conceptText = concept ? ` The currently selected idea is ${concept.title}, a ${concept.formFactor || "device"} concept.` : "";
  return `This early architecture explores ${optionCount || "multiple"} possible ${intent} device idea${optionCount === 1 ? "" : "s"}${condition}${symptom}.${conceptText} These are concept images and trade-off summaries for discussion, not finished medical devices or CAD specifications.`;
}

function TechnicalEvidenceOptions({ result, viewpoint = "engineer" }) {
  const allGroups = [
    {
      title: "Cited Papers",
      icon: BookOpen,
      items: result.literature?.map((paper) => ({
        label: paper.title,
        detail: [paper.venue, paper.year, paper.url].filter(Boolean).join(" | ")
      })) || []
    },
    {
      title: "Definitions",
      icon: FileText,
      items: [
        { label: "Disease", detail: result.subgraph?.disease ? `${result.subgraph.disease.name} (${result.subgraph.disease.source}:${result.subgraph.disease.id})` : result.extraction?.disease || "not detected" },
        { label: "Symptom", detail: result.extraction?.symptomPhrase || "not detected" },
        { label: "Device intent", detail: result.extraction?.deviceIntent || "not detected" }
      ]
    },
    {
      title: "Genes / Proteins",
      icon: Microscope,
      items: result.subgraph?.proteins?.map((node) => ({ label: node.name, detail: `${node.source}:${node.id}` })) || []
    },
    {
      title: "Phenotypes & Anatomy",
      icon: Activity,
      items: [
        ...(result.subgraph?.phenotypes?.map((node) => ({ label: node.name, detail: `Phenotype | ${node.source}:${node.id}` })) || []),
        ...(result.subgraph?.anatomy?.map((node) => ({ label: node.name, detail: `Anatomy | ${node.source}:${node.id}` })) || [])
      ]
    },
    {
      title: "Guidelines & Standards",
      icon: ShieldCheck,
      items: [
        ...(result.guidelines?.map((hit) => ({ label: `${hit.source}: ${hit.title}`, detail: hit.url })) || []),
        ...(result.standardsReferenced?.map((standard) => ({ label: standard.standard, detail: `${standard.publisher} | ${standard.title}` })) || [])
      ]
    }
  ];
  const allowedByViewpoint = {
    common: ["Definitions", "Guidelines & Standards"],
    caregiver: ["Definitions", "Guidelines & Standards"],
    doctor: ["Definitions", "Phenotypes & Anatomy", "Cited Papers", "Guidelines & Standards"],
    engineer: ["Definitions", "Genes / Proteins", "Phenotypes & Anatomy", "Guidelines & Standards"],
    researcher: ["Cited Papers", "Genes / Proteins", "Phenotypes & Anatomy", "Definitions"],
    regulatory: ["Definitions", "Guidelines & Standards"]
  };
  const groups = allGroups.filter((group) => (allowedByViewpoint[viewpoint] || allowedByViewpoint.engineer).includes(group.title));
  const maxItems = {
    common: 3,
    caregiver: 4,
    doctor: 8,
    engineer: 10,
    researcher: 14,
    regulatory: 8
  }[viewpoint] || 8;

  return (
    <article className="panel evidence-options-panel">
      <h3><ClipboardList size={20} />Evidence For {evidenceViewpoints.find((item) => item.id === viewpoint)?.label || "Reviewer"}</h3>
      <div className="evidence-options">
        {groups.map(({ title, icon: Icon, items }) => (
          <details key={title}>
            <summary><Icon size={18} />{title}<span>{items.length}</span></summary>
            <div className="option-list">
              {items.length === 0 && <p>No items retrieved.</p>}
              {items.slice(0, maxItems).map((item, index) => (
                <div className="option-row" key={`${title}-${item.label}-${index}`}>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </div>
              ))}
              {items.length > maxItems && <p>Showing {maxItems} of {items.length} items for this viewpoint.</p>}
            </div>
          </details>
        ))}
      </div>
    </article>
  );
}

function FormattedProposal({ text }) {
  const sections = useMemo(() => {
    const normalized = String(text || "").replace(/\r/g, "").trim();
    if (!normalized) return [];
    const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
    const parsed = [];
    let current = { title: "Design Rationale", body: [] };

    for (const line of lines) {
      const heading = line.match(/^\**\s*([^:*#][^:]{2,80})\s*:\s*$/) || line.match(/^#{1,3}\s+(.+)/);
      if (heading) {
        if (current.body.length) parsed.push(current);
        current = { title: heading[1].replace(/\*\*/g, ""), body: [] };
      } else {
        current.body.push(line.replace(/^[-*]\s+/, ""));
      }
    }

    if (current.body.length) parsed.push(current);
    return parsed.length ? parsed : [{ title: "Design Rationale", body: [normalized] }];
  }, [text]);

  return (
    <article className="panel proposal-panel">
      <h3><Brain size={20} />Proposal Summary</h3>
      <div className="proposal-sections">
        {sections.map((section) => (
          <section className="proposal-section" key={section.title}>
            <h4>{section.title}</h4>
            {section.body.map((item, index) => <p key={`${section.title}-${index}`}>{item}</p>)}
          </section>
        ))}
      </div>
    </article>
  );
}

function ArchitectureCadPanel({ layout }) {
  const assembly = useMemo(() => buildAssembly(layout), [layout]);
  const dimensionText = formatDimensions(layout.dimensions);
  const evidenceParts = assembly.parts.slice(0, 8);

  function downloadStl() {
    downloadCadStl(layout);
  }

  return (
    <article className="panel architecture-cad-panel">
      <div className="architecture-cad-main">
        <div className="architecture-cad-preview" aria-label="Generated CAD design preview">
          <Canvas camera={{ position: [3.5, 2.5, 3.5], fov: 45 }}>
            <ambientLight intensity={0.6} />
            <directionalLight position={[4, 5, 4]} intensity={1} />
            <gridHelper args={[6, 12, "#1463ff", "#0a1f30"]} />
            {assembly.parts.map((part) => <CadPartMesh key={part.id} part={part} />)}
            <OrbitControls />
          </Canvas>
        </div>
        <div className="architecture-cad-copy">
          <span className="eyebrow">CAD design concept</span>
          <h3><Box size={20} />{layout.device}</h3>
          <div className="chip-row">
            <span className="chip">{layout.formFactor || "auto-selected form factor"}</span>
            {dimensionText && <span className="chip">{dimensionText}</span>}
            <span className="chip">{assembly.parts.length} generated layers</span>
          </div>
          <p>{layout.caveat || "Illustrative concept geometry for review, not manufacturing specifications."}</p>
          <button className="primary download-inline" onClick={downloadStl}><Download size={16} />Download STL</button>
        </div>
      </div>
      <div className="architecture-cad-evidence">
        <h4>Generated layers and evidence</h4>
        {evidenceParts.map((part) => (
          <div className="architecture-layer-row" key={part.id}>
            <Check size={16} />
            <span>
              <strong>{part.type}</strong>
              <small>{[part.material, part.placement].filter(Boolean).join(" - ") || "Generated CAD layer"}</small>
              <small>{part.groundedIn}</small>
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function CadPartMesh({ part }) {
  const geometry = useMemo(() => geom3ToBufferGeometry(part.geom3), [part.geom3]);
  return (
    <mesh>
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial color={part.color} metalness={0.3} roughness={0.4} />
    </mesh>
  );
}

function EvidenceGroup({ label, nodes, total }) {
  return (
    <div className="evidence-group">
      <h4>{label} <small>(showing {nodes.length} of {total})</small></h4>
      <div className="chip-row">
        {nodes.length === 0 && <span className="chip chip-empty">none found</span>}
        {nodes.map((node) => (
          <span className="chip" key={node.index} title={`${node.source}:${node.id}`}>{node.name}</span>
        ))}
      </div>
    </div>
  );
}

function evidenceMetrics(result) {
  if (!result) return [];
  const graphCount = result.subgraph
    ? result.subgraph.phenotypes.length + result.subgraph.proteins.length + result.subgraph.anatomy.length
    : 0;
  return [
    `Graph Nodes ${graphCount}`,
    `Papers ${result.literature?.length || 0}`,
    `Guidelines ${result.guidelines?.length || 0}`,
    result.cadLayout ? `CAD Parts ${result.cadLayout.components?.length || 0}` : `Concept Options ${result.ideation?.options?.length || 0}`
  ];
}

function evidenceItems(result) {
  if (!result) return [];
  const items = [];
  if (result.subgraph?.disease) items.push(`PrimeKG disease node: ${result.subgraph.disease.name}`);
  if (result.subgraph?.phenotypes?.length) items.push(`Phenotypes: ${result.subgraph.phenotypes.slice(0, 3).map((node) => node.name).join(", ")}`);
  if (result.literature?.length) items.push(`Papers: ${result.literature.slice(0, 2).map((paper) => paper.title).join("; ")}`);
  if (result.guidelines?.length) items.push(`Guidance: ${result.guidelines.slice(0, 2).map((hit) => `${hit.source} - ${hit.title}`).join("; ")}`);
  if (result.standardsReferenced?.length) items.push(`Standards: ${result.standardsReferenced.slice(0, 4).map((standard) => standard.standard).join(", ")}`);
  return items.length ? items : ["No retrieved evidence is available for the current design."];
}

function cadLayerItems(result) {
  if (!result?.cadLayout?.components?.length) return ["Engineering specs will appear after proceeding from the accepted concept."];
  const dimensions = formatDimensions(result.cadLayout.dimensions);
  return [
    `${result.cadLayout.formFactor || "Auto-selected"} geometry family${dimensions ? ` - ${dimensions}` : ""}`,
    ...result.cadLayout.components.map((component) => `${component.type}: ${[component.material, component.placement].filter(Boolean).join(" - ")}${component.impact ? ` | ${component.impactLabel || "Impact"} ${component.impact}/100` : ""}`)
  ];
}

function cadEvidenceItems(result) {
  if (!result?.cadLayout?.components?.length) return ["Proceed to CAD Design to create component-level specs and evidence links."];
  return result.cadLayout.components.map((component) => `${component.type}: ${component.groundedIn}${component.constraint ? ` | Constraint: ${component.constraint}` : ""}`);
}

function formatDimensions(dimensions) {
  if (!dimensions) return "";
  const values = [dimensions.lengthMm, dimensions.widthMm, dimensions.heightMm].map((value) => Number(value));
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) return "";
  return `${values.map((value) => Math.round(value)).join(" x ")} mm`;
}

function cadInsightCards(result) {
  if (!result) return [];
  const cards = [];
  if (result.extraction?.symptomPhrase) {
    const match = result.subgraph?.phenotypes?.find((node) => node.name.toLowerCase().includes(result.extraction.symptomPhrase.toLowerCase()));
    cards.push({
      title: "Physiologic Target",
      text: match
        ? `${result.extraction.symptomPhrase} maps to PrimeKG phenotype ${match.name}.`
        : `${result.extraction.symptomPhrase} was extracted from the prompt; review retrieved phenotypes for the closest graph-supported signal.`,
      impact: result.kgGrounded ? "Evidence-linked" : "Needs review"
    });
  }
  if (result.literature?.length) {
    cards.push({
      title: "Literature Support",
      text: `${result.literature.length} literature records were retrieved for the disease, symptom, and device intent.`,
      impact: "Retrieved"
    });
  }
  if (result.guidelines?.length) {
    cards.push({
      title: "Clinical Guidance",
      text: `${result.guidelines.length} guideline excerpts were retrieved from the local MedlinePlus/ONC/USCDI index.`,
      impact: "Indexed"
    });
  }
  if (result.cadLayout?.caveat) {
    cards.push({ title: "CAD Caveat", text: result.cadLayout.caveat, impact: "Concept only" });
  }
  return cards;
}

function ExplorePage({ prompt, result, onOpenCad }) {
  if (!result) {
    return (
      <div className="empty-results">
        <Search size={42} />
        <h1>No generated exploration yet</h1>
        <p>Run a New Design search first. This page will then show the retrieved graph, literature, guideline, standards, and CAD evidence for that design.</p>
      </div>
    );
  }

  const metrics = evidenceMetrics(result);
  const conceptOptions = result.ideation?.options || [];
  const selectedConcept = activeConcept(result);
  const selectedTradeoffs = selectedConcept?.tradeoffs || [];

  return (
    <div className="explore-page">
      <section className="explore-overview-grid">
        <Panel title="Knowledge Sources (RAG)" icon={Search} items={["PrimeKG knowledge graph", "Semantic Scholar papers", "Europe PMC papers", "MedlinePlus health topics", "ONC SAFER Guides", "USCDI data classes", "Named standards references"]} />
        <Panel title="Extracted Prompt" icon={SlidersHorizontal} items={[
          `Prompt mode: ${result.promptProfile?.roleLabel || "Not recorded"}`,
          `Engineering search: ${result.promptProfile?.engineeringPrompt || prompt || "not recorded"}`,
          `Disease: ${result.extraction?.disease || "not detected"}`,
          `Symptom: ${result.extraction?.symptomPhrase || "not detected"}`,
          `Device intent: ${result.extraction?.deviceIntent || "not detected"}`
        ]} />
        <article className="panel generated-design-card">
          <h3><UserRound size={20} />Architecture</h3>
          <div className="generated-design-summary">
            <strong>{selectedConcept?.title || "No concept selected"}</strong>
            <span>{selectedConcept?.formFactor || "Select a concept first"}</span>
            {selectedConcept?.evidenceStrength?.overall != null && <span>{selectedConcept.evidenceStrength.overall}/100 overall score</span>}
            <span>{result.kgGrounded ? "PrimeKG grounded" : "Evidence context ready"}</span>
          </div>
          <button className="primary" disabled={!selectedConcept} onClick={onOpenCad}>Proceed to CAD Design</button>
        </article>
      </section>

      <section className="main-area explore-main">
        <h1>Retrieval-Augmented Design Exploration</h1>
        {prompt && <p>{prompt}</p>}
        <div className="metric-row">
          {metrics.map((item) => <div className="metric" key={item}>{item}</div>)}
        </div>
        <div className="concept-grid">
          {conceptOptions.length > 0 ? (
            conceptOptions.map((option, index) => (
              <Concept
                key={option.id}
                title={result.ideation?.recommendedOptionId === option.id ? "Recommended Concept" : `Concept ${index + 1}`}
                component={{ type: option.formFactor, id: option.id, placement: option.bestFor }}
                name={option.title}
                material={option.plainDescription}
                evidence={`${option.evidenceStrength?.overall ?? 0}/100 evidence-backed score`}
              />
            ))
          ) : (
            <Concept title="Generated Concept" name="Design proposal" material="Concept options were not returned for this run." evidence="Try running a new proposal ideation." />
          )}
        </div>
        {selectedTradeoffs.length > 0 && (
          <article className="panel">
            <h3><SlidersHorizontal size={20} />Selected Concept Trade-Offs</h3>
            <div className="solution-list">
              {selectedTradeoffs.map((tradeoff) => (
                <details className="solution-row" key={`${selectedConcept.id}-${tradeoff.label}`}>
                  <summary>
                    <strong>{tradeoff.label}</strong>
                    <span>{tradeoff.rating}</span>
                    <p>{plainSnippet(tradeoff.detail, 170)}</p>
                  </summary>
                  <p>{tradeoff.detail}</p>
                </details>
              ))}
            </div>
          </article>
        )}
        <Panel title="Rationale & Key Evidence" icon={FileText} items={evidenceItems(result)} />
        <CompareTable result={result} />
      </section>
    </div>
  );
}

function CadPage({ prompt, result, onResultUpdate }) {
  const selectedConcept = activeConcept(result);
  const [cadMode, setCadMode] = useState(selectedConcept ? "generated" : "upload");
  const [cadStatus, setCadStatus] = useState("idle");
  const [showPreview, setShowPreview] = useState(false);
  const [specsAccepted, setSpecsAccepted] = useState(false);
  const [cadError, setCadError] = useState(null);
  const [cadRefinement, setCadRefinement] = useState("");
  const [cadRefineAudience, setCadRefineAudience] = useState("engineer");
  const [cadSupportFiles, setCadSupportFiles] = useState([]);
  const specLayout = useMemo(() => result?.cadLayout || buildInstantSpecLayout(result, selectedConcept), [result, selectedConcept]);
  const hasGeneratedSpecs = Boolean(specLayout);
  const showGeneratedDetails = cadMode === "generated" && hasGeneratedSpecs;
  const insights = cadInsightCards({ ...result, cadLayout: specLayout });

  useEffect(() => {
    if (!selectedConcept && cadMode === "generated") setCadMode("upload");
  }, [selectedConcept, cadMode]);

  useEffect(() => {
    setShowPreview(false);
    setSpecsAccepted(false);
  }, [selectedConcept?.id, specLayout?.device]);

  function acceptSpecs() {
    if (!specLayout) return;
    setSpecsAccepted(true);
  }

  function generatePreview() {
    if (!specsAccepted) return;
    setShowPreview(true);
  }

  async function refineCad(event) {
    event.preventDefault();
    const trimmed = cadRefinement.trim();
    if (!trimmed || !specLayout || cadStatus === "loading") return;

    setCadStatus("loading");
    setCadError(null);
    try {
      const documents = await filesToDocuments(cadSupportFiles);
      const response = await fetch("http://127.0.0.1:3001/api/cad-refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, result: { ...result, selectedConcept, cadLayout: specLayout }, audience: cadRefineAudience, documents })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.detail || "CAD refinement failed");
      onResultUpdate?.(data);
      setShowPreview(false);
      setCadRefinement("");
      setCadSupportFiles([]);
      setCadStatus("idle");
    } catch (err) {
      setCadError(err instanceof Error ? err.message : "CAD refinement failed");
      setCadStatus("error");
    }
  }

  return (
    <div className="cad-grid">
      <aside className="left-rail">
        <article className="panel cad-source-panel">
          <h3><Box size={20} />CAD Source</h3>
          <div className="segmented-control cad-source-control" role="group" aria-label="CAD source">
            <button className={cadMode === "generated" ? "active" : ""} disabled={!selectedConcept} onClick={() => setCadMode("generated")}>Generated Specs</button>
            <button className={cadMode === "upload" ? "active" : ""} onClick={() => setCadMode("upload")}>Upload STL</button>
          </div>
          <p>{cadMode === "generated" ? "Use the accepted concept to create engineering specs and an enhanced 3D concept preview." : "Upload an STL file, then drag to rotate and scroll to zoom."}</p>
        </article>
        {showGeneratedDetails && (
          <>
            <Panel title="Generated Model Layers" icon={Layers} items={cadLayerItems({ ...result, cadLayout: specLayout })} />
            <Panel title="Component Evidence" icon={Gauge} items={cadEvidenceItems({ ...result, cadLayout: specLayout })} />
          </>
        )}
      </aside>
      <section className="cad-stage">
        {cadMode === "generated" && specLayout && !showPreview && (
          <SpecFirstStage
            layout={specLayout}
            concept={selectedConcept}
            specsAccepted={specsAccepted}
            onAcceptSpecs={acceptSpecs}
            onGeneratePreview={generatePreview}
          />
        )}
        {cadMode === "generated" && specLayout && showPreview && <GeneratedCadViewer layout={specLayout} prompt={prompt} />}
        {cadMode === "generated" && !specLayout && <div className="cad-pending"><Box size={44} /><h2>Accept a concept first</h2><p>Choose a concept on Architecture before generating engineering specs.</p></div>}
        {cadMode === "upload" && <StlUploadViewer />}
      </section>
      <aside className="right-rail cad-copy">
        <h1>{showGeneratedDetails ? specLayout.device : cadMode === "generated" ? selectedConcept?.title || "Generated CAD Workspace" : "Uploaded STL Workspace"}</h1>
        {showGeneratedDetails && prompt && <p>{prompt}</p>}
        {showGeneratedDetails && insights.length > 0 ? insights.map((card, idx) => (
          <article className="explain" key={card.title}><strong>{idx + 1}. {card.title}</strong><p>{card.text}</p><span>{card.impact}</span></article>
        )) : (
          <article className="explain"><strong>{cadMode === "upload" ? "Inspect a custom STL" : "Engineering spec phase"}</strong><p>{cadMode === "upload" ? "Use the upload viewer to inspect an external STL model. Generated layers, evidence, and acceptance controls stay hidden in this mode." : "The accepted concept is expanded into text specs first, then visualized with component modules layered onto the concept form."}</p><span>{cadMode === "upload" ? "Upload mode" : "Human-gated"}</span></article>
        )}
        {showGeneratedDetails && <EngineeringSpecsPanel layout={specLayout} />}
        {showGeneratedDetails && (
          <article className="panel cad-refine-panel">
            <h3><PenTool size={20} />Refine CAD</h3>
            <div className="refine-depth-row" role="group" aria-label="CAD refinement prompt mode">
              {promptAudiences.map(({ id, label, icon: Icon }) => (
                <button
                  type="button"
                  className={cadRefineAudience === id ? "active" : ""}
                  key={id}
                  onClick={() => setCadRefineAudience(id)}
                >
                  <Icon size={16} />{label}
                </button>
              ))}
            </div>
            <p className="refine-depth-note">{(promptAudiences.find((item) => item.id === cadRefineAudience) || promptAudiences[0]).description}</p>
            <label className="support-upload refine-upload">
              <CloudUpload size={16} />
              <span>{cadSupportFiles.length ? `${cadSupportFiles.length} file${cadSupportFiles.length === 1 ? "" : "s"} attached` : "Add PDF/manual/report"}</span>
              <input type="file" accept=".pdf,.txt,.md" multiple onChange={(event) => setCadSupportFiles(Array.from(event.target.files || []).slice(0, 3))} />
            </label>
            <form className="refine-form cad-refine-form" onSubmit={refineCad}>
              <textarea rows={4} value={cadRefinement} onChange={(event) => setCadRefinement(event.target.value)} placeholder="Refine dimensions, component placement, material assumptions, or constraints..." />
              <button className="primary" disabled={!cadRefinement.trim() || cadStatus === "loading"}>{cadStatus === "loading" ? "Refining..." : "Refine Specs"}</button>
            </form>
            {cadError && <div className="design-status error"><span className="status-dot error" />{cadError}</div>}
          </article>
        )}
        {showGeneratedDetails && (
          <div className="action-row">
            <button className="success" onClick={acceptSpecs}>
              {specsAccepted ? "Specs Accepted" : "Accept Specs"}
            </button>
            <button className="primary" disabled={!specsAccepted} onClick={generatePreview}>
              Generate 3D Preview
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

function EngineeringSpecsPanel({ layout }) {
  const components = layout?.components || [];
  return (
    <article className="panel engineering-specs-panel">
      <h3><ClipboardList size={20} />Engineering Specs</h3>
      <p>{layout?.caveat || "Specs are conceptual and require human review."}</p>
      <div className="spec-list">
        {components.map((component) => (
          <details className="spec-row" key={component.id}>
            <summary>
              <span>
                <strong>{component.type}</strong>
                <small>{component.material}</small>
              </span>
              <b>{component.impactLabel || "Impact"} {component.impact ?? "TBD"}/100</b>
            </summary>
            <p><strong>Use:</strong> {component.placement || "Concept placement to be reviewed."}</p>
            <p><strong>Constraint:</strong> {component.constraint || "Needs qualified engineering and clinical review."}</p>
            <p><strong>Evidence link:</strong> {component.groundedIn || "Selected concept rationale."}</p>
          </details>
        ))}
      </div>
    </article>
  );
}

function SpecFirstStage({ layout, concept, specsAccepted, onAcceptSpecs, onGeneratePreview }) {
  const dimensionText = formatDimensions(layout.dimensions);
  const topComponents = layout.components?.slice(0, 5) || [];
  return (
    <div className="spec-first-stage">
      <span className="eyebrow">Specs before 3D design</span>
      <h2>{layout.device}</h2>
      <p>{concept?.professionalDescription || concept?.plainDescription || layout.caveat}</p>
      <div className="chip-row">
        <span className="chip">{layout.formFactor}</span>
        {dimensionText && <span className="chip">{dimensionText}</span>}
        <span className="chip">{topComponents.length} spec layers</span>
      </div>
      <div className="spec-stage-grid">
        {topComponents.map((component) => (
          <article key={component.id}>
            <strong>{component.type}</strong>
            <span>{component.placement}</span>
            <b>{component.impactLabel || "Impact"} {component.impact ?? "TBD"}/100</b>
          </article>
        ))}
      </div>
      <div className="spec-stage-actions">
        <button className="success" onClick={onAcceptSpecs}>
          {specsAccepted ? <CheckCircle2 size={16} /> : <Check size={16} />}
          {specsAccepted ? "Specs Accepted" : "Accept Specs"}
        </button>
        <button className="primary" disabled={!specsAccepted} onClick={onGeneratePreview}>
          <Box size={16} />Generate Enhanced 3D Preview
        </button>
      </div>
      <p className="spec-approval-note">
        {specsAccepted ? "Specs are accepted. You can now generate the enhanced 3D preview." : "Review and accept the specs before generating the 3D preview."}
      </p>
    </div>
  );
}

function GeneratedCadViewer({ layout, prompt }) {
  const assembly = useMemo(() => buildAssembly(layout), [layout]);
  const dimensionText = formatDimensions(layout.dimensions);

  function downloadStl() {
    downloadCadStl(layout);
  }

  return (
    <div className="generated-cad-stage">
      <div className="stl-toolbar">
        <div>
          <strong>{layout.device}</strong>
          <span className="chip">{layout.formFactor || "auto-selected form factor"}</span>
          {dimensionText && <span className="chip">{dimensionText}</span>}
          {prompt && <span className="stl-file-meta">{prompt}</span>}
        </div>
        <button className="primary download-inline" onClick={downloadStl}>Download STL</button>
      </div>
      <div className="stl-canvas">
        <Canvas camera={{ position: [3.5, 2.5, 3.5], fov: 45 }}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[4, 5, 4]} intensity={1} />
          <gridHelper args={[6, 12, "#1463ff", "#0a1f30"]} />
          {assembly.parts.map((part) => <CadPartMesh key={part.id} part={part} />)}
          <OrbitControls />
        </Canvas>
      </div>
    </div>
  );
}

function StlUploadViewer() {
  const [model, setModel] = useState(null); // { fileName, geometry, dims, triangleCount, maxDim }
  const [error, setError] = useState(null);

  async function loadStlFile(file) {
    if (!file) return;
    setError(null);

    try {
      const buffer = await file.arrayBuffer();
      const geometry = new STLLoader().parse(buffer);
      geometry.computeBoundingBox();
      geometry.center();
      geometry.computeVertexNormals();

      const box = geometry.boundingBox;
      const dims = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
      const maxDim = Math.max(...dims, 0.001);
      const triangleCount = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;

      setModel({ fileName: file.name, geometry, dims, triangleCount, maxDim });
    } catch (err) {
      setError(err instanceof Error ? `Could not parse this STL file: ${err.message}` : "Could not parse this STL file.");
      setModel(null);
    }
  }

  async function handleFile(event) {
    await loadStlFile(event.target.files?.[0]);
  }

  async function handleDrop(event) {
    event.preventDefault();
    await loadStlFile(event.dataTransfer.files?.[0]);
  }

  return (
    <div className="stl-viewer" onDrop={handleDrop} onDragOver={(event) => event.preventDefault()}>
      <div className="stl-toolbar">
        <label className="stl-upload-button">
          <CloudUpload size={16} />
          {model ? "Load a different STL" : "Upload an STL file"}
          <input type="file" accept=".stl" onChange={handleFile} />
        </label>
        {model && (
          <span className="stl-file-meta">
            {model.fileName} · {model.triangleCount.toLocaleString()} triangles · {model.dims.map((d) => d.toFixed(1)).join(" × ")} units
          </span>
        )}
      </div>

      {error && <div className="design-status error"><span className="status-dot error" />{error}</div>}

      {model ? (
        <div className="stl-canvas" key={model.fileName}>
          <Canvas camera={{ position: [model.maxDim * 1.6, model.maxDim * 1.2, model.maxDim * 1.6], fov: 45 }}>
            <ambientLight intensity={0.6} />
            <directionalLight position={[model.maxDim * 2, model.maxDim * 2.5, model.maxDim * 2]} intensity={1} />
            <gridHelper args={[model.maxDim * 4, 12, "#1463ff", "#0a1f30"]} />
            <mesh geometry={model.geometry}>
              <meshStandardMaterial color="#52b9ff" metalness={0.3} roughness={0.4} />
            </mesh>
            <OrbitControls />
          </Canvas>
        </div>
      ) : (
        !error && (
          <div className="stl-empty">
            <Box size={48} />
            <p>Upload or drag an .stl file here, then rotate and zoom it with the mouse.</p>
          </div>
        )
      )}
    </div>
  );
}

function Panel({ title, icon: Icon, items }) {
  return <article className="panel"><h3><Icon size={20} />{title}</h3>{items.map((item) => <div className="list-row" key={item}><Check size={16} />{item}</div>)}</article>;
}

function Donut() {
  return <div className="panel donut-panel"><h3>Knowledge Hub Overview</h3><div className="donut"><span>26,631<br /><small>Total</small></span></div></div>;
}

function conceptVisual(component, name = "") {
  const text = `${component?.type || ""} ${component?.id || ""} ${component?.placement || ""} ${name}`.toLowerCase();
  if (/\b(battery|power|charging|charge)\b/.test(text)) return { Icon: Battery, label: "Power", tone: "green" };
  if (/\b(pcb|controller|processor|electronics|microcontroller|main)\b/.test(text)) return { Icon: CircuitBoard, label: "Controller", tone: "blue" };
  if (/\b(ecg|heart|pulse|oximeter|spo2|ppg)\b/.test(text)) return { Icon: HeartPulse, label: "Vitals", tone: "red" };
  if (/\b(temp|thermal|infrared|heat)\b/.test(text)) return { Icon: Thermometer, label: "Thermal", tone: "yellow" };
  if (/\b(saliva|sweat|microfluidic|fluid|glucose|droplet)\b/.test(text)) return { Icon: Droplets, label: "Fluid", tone: "cyan" };
  if (/\b(sensor|electrode|accelerometer|imu|pressure|optical|probe)\b/.test(text)) return { Icon: Gauge, label: "Sensor", tone: "purple" };
  if (/\b(antenna|wireless|bluetooth|radio|alert|transmit)\b/.test(text)) return { Icon: Zap, label: "Signal", tone: "cyan" };
  if (/\b(housing|enclosure|shell|base|case|mouthguard|cast|patch|clip|strap|band)\b/.test(text)) return { Icon: Box, label: "Structure", tone: "blue" };
  return { Icon: Cpu, label: "Module", tone: "cyan" };
}

function Concept({ title, name, material, evidence, component }) {
  const visual = conceptVisual(component, name);
  const Icon = visual.Icon;
  return (
    <article className="concept">
      <h3>{title}</h3>
      <h2>{name}</h2>
      <div className={`concept-art concept-art-${visual.tone}`}>
        <Icon size={46} />
        <span>{visual.label}</span>
      </div>
      <ul>
        <li>{material}</li>
        {component?.placement && <li>{component.placement}</li>}
        <li>{evidence}</li>
      </ul>
    </article>
  );
}

function CompareTable({ result }) {
  const rows = [
    ["Knowledge graph", result.kgGrounded ? "Matched" : "Missing", result.subgraph?.disease?.name || "No disease node"],
    ["Literature", `${result.literature?.length || 0} papers`, result.literature?.[0]?.title || "No papers retrieved"],
    ["Guidelines", `${result.guidelines?.length || 0} excerpts`, result.guidelines?.[0]?.title || "No guideline excerpts"],
    ["Standards", `${result.standardsReferenced?.length || 0} references`, result.standardsReferenced?.slice(0, 3).map((s) => s.standard).join(", ") || "No standards"],
    ["CAD", result.cadLayout ? `${result.cadLayout.components.length} parts` : "Not generated", result.cadLayout?.caveat || "No CAD caveat"]
  ];
  return <article className="panel"><h3><BarChart3 size={20} />Evidence Summary</h3>{rows.map(([row, value, insight]) => <div className="table-row dynamic-table-row" key={row}><span>{row}</span><b>{value}</b><small>{insight}</small></div>)}</article>;
}

function Chat({ compact }) {
  const context = compact ? "CAD workspace and generative design explanation" : "RAG exploration and concept comparison";
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: compact
        ? "I can help refine the prototype, explain constraints, or suggest CAD-level design changes."
        : "I can compare design options, reason through evidence gaps, and suggest validation steps."
    }
  ]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("idle");

  async function sendMessage(event) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || status === "loading") return;

    const nextMessages = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setDraft("");
    setStatus("loading");

    try {
      const response = await fetch("http://127.0.0.1:3001/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, messages: nextMessages })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.error || "Ollama request failed");
      }

      setMessages((current) => [...current, { role: "assistant", content: data.message || "I did not receive a response from Ollama." }]);
      setStatus("idle");
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `I could not reach the local Ollama chat service. ${error instanceof Error ? error.message : "Please check that Ollama is running."}`
        }
      ]);
      setStatus("error");
    }
  }

  return (
    <article className={compact ? "chat compact" : "chat"}>
      <div className="chat-header">
        <div>
          <h3>AI Co-Pilot</h3>
          <span>{status === "loading" ? "Thinking with Ollama..." : "Ollama: gemma4"}</span>
        </div>
        <span className={status === "error" ? "status-dot error" : "status-dot"} />
      </div>
      <div className="chat-log" aria-live="polite">
        {messages.map((message, idx) => (
          <p className={message.role === "user" ? "chat-message user-msg" : "chat-message"} key={`${message.role}-${idx}`}>
            {message.content}
          </p>
        ))}
        {status === "loading" && <p className="chat-message loading">Generating design guidance...</p>}
      </div>
      <form className="chat-form" onSubmit={sendMessage}>
        <textarea
          aria-label="Ask the AI co-pilot"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about trade-offs, risks, constraints, validation, or next steps..."
          rows={compact ? 2 : 3}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              sendMessage(event);
            }
          }}
        />
        <button type="submit" disabled={status === "loading" || !draft.trim()}><Send size={17} /></button>
      </form>
    </article>
  );
}

createRoot(document.getElementById("root")).render(<App />);
