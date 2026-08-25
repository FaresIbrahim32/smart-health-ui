import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  BarChart3,
  BookOpen,
  Box,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  CloudUpload,
  Cpu,
  Database,
  Download,
  Eye,
  FileText,
  Gauge,
  History,
  Home,
  Layers,
  LogIn,
  MessageSquare,
  Microscope,
  PackageCheck,
  PenTool,
  RefreshCw,
  Search,
  Send,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserPlus,
  UserRound,
  UsersRound,
  Wrench,
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
  { id: "new", label: "New Design", icon: Home },
  { id: "results", label: "Generated Design", icon: CheckCircle2 },
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
    title: "Semantic Scholar",
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
  ["Entity extraction", "Ollama llama3.2 extracts disease, symptom, and device intent."],
  ["Synonym resolution", "NCBI PubTator3 canonicalizes disease names before graph lookup."],
  ["Graph grounding", "PrimeKG supplies disease, phenotype, protein, and anatomy relationships."],
  ["Literature retrieval", "Semantic Scholar returns paper metadata, abstracts, and URLs."],
  ["Guideline retrieval", "MedlinePlus, ONC SAFER Guides, and USCDI chunks are embedded locally."]
];

const AUTH_STORAGE_KEY = "smart-health-session";

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

function safeFileBase(name = "smart-health-design") {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "smart-health-design";
}

function exportData(prompt, result) {
  return {
    prompt,
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
    cadDesign: result.cadLayout,
    warnings: result.warnings || []
  };
}

function exportMarkdown(prompt, result) {
  const data = exportData(prompt, result);
  const lines = [
    `# ${data.cadDesign?.device || "Smart Health Generated Design"}`,
    "",
    "## Prompt",
    prompt || "No prompt recorded.",
    "",
    "## Extracted Definitions",
    `- Disease: ${data.definitions.disease?.name || data.extraction?.disease || "not detected"}`,
    `- Symptom: ${data.definitions.symptom || "not detected"}`,
    `- Device intent: ${data.definitions.deviceIntent || "not detected"}`,
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
    ...(data.cadDesign?.components?.length ? data.cadDesign.components.map((part) => `- ${part.type}: ${part.material}. Evidence: ${part.groundedIn}`) : ["- No CAD components generated"]),
    "",
    "## Proposal",
    data.proposal || "No proposal generated.",
    "",
    "## Warnings",
    ...(data.warnings.length ? data.warnings.map((warning) => `- ${warning}`) : ["- None"])
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
  const [active, setActive] = useState("new");
  const [topPanel, setTopPanel] = useState(null);
  const [designResult, setDesignResult] = useState(null);
  const [designPrompt, setDesignPrompt] = useState("");
  const [acceptedResult, setAcceptedResult] = useState(null);
  const [acceptedPrompt, setAcceptedPrompt] = useState("");
  const ActiveIcon = pages.find((page) => page.id === active)?.icon || Activity;
  const isDesignComplete = Boolean(designResult?.cadLayout);
  const isDesignAccepted = Boolean(acceptedResult?.cadLayout);

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
    if (item === "Retrieval") {
      setActive(isDesignAccepted ? "explore" : "results");
      setTopPanel(null);
      return;
    }
    if (item === "History") {
      setActive(isDesignComplete ? "results" : "new");
      setTopPanel(null);
      return;
    }
    setTopPanel((current) => (current === item ? null : item));
  }

  if (authStatus !== "signed-in") {
    return <LandingPage onAuth={handleAuth} checking={authStatus === "checking"} />;
  }

  return (
    <main className="app">
      <header className="topbar">
        <Logo />
        <nav className="top-actions">
          {["Retrieval", "Constraints", "Stakeholders", "History", "Export"].map((item) => (
            <button className={topPanel === item ? "ghost active-tool" : "ghost"} key={item} onClick={() => handleTopAction(item)}>{item}</button>
          ))}
        </nav>
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
          const disabled = (page.id === "results" && !isDesignComplete) || (["explore", "cad"].includes(page.id) && !isDesignAccepted);
          return <button key={page.id} className={active === page.id ? "active" : ""} disabled={disabled} onClick={() => setActive(page.id)}><Icon size={17} />{page.label}</button>;
        })}
      </div>
      <div className="shell">
        <aside className="sidebar">
          {pages.map((page) => {
            const Icon = page.icon;
            const disabled = (page.id === "results" && !isDesignComplete) || (["explore", "cad"].includes(page.id) && !isDesignAccepted);
            return <button key={page.id} className={active === page.id ? "nav-item active" : "nav-item"} disabled={disabled} onClick={() => setActive(page.id)}><Icon size={21} />{page.label}</button>;
          })}
          <div className={isDesignComplete ? "info-panel ready" : "info-panel"}>
            <h3>{isDesignComplete ? "Design Ready" : "Generation Gate"}</h3>
            <p>{isDesignComplete ? "Evidence, proposal, and CAD layout are complete. The generated design page is unlocked." : "Run a New Design search. Results unlock after retrieval, reasoning, and CAD layout all finish."}</p>
            <button className="primary inline-primary" disabled={!isDesignComplete} onClick={() => setActive("results")}>Open Generated Design</button>
            {isDesignComplete && !isDesignAccepted && <small>Accept a version before RAG Exploration and CAD Workspace use it.</small>}
          </div>
        </aside>
        <section className="screen">
          <div className="screen-title">
            <ActiveIcon size={22} />
            <span>{pages.find((page) => page.id === active)?.label}</span>
          </div>
          {active === "pipeline" && <PipelinePage />}
          {active === "knowledge" && <KnowledgePage />}
          {active === "new" && (
            <NewDesignPage
              result={designResult}
              onResult={(prompt, result) => {
                setDesignPrompt(prompt);
                setDesignResult(result);
                setAcceptedPrompt("");
                setAcceptedResult(null);
              }}
              onOpenResults={() => setActive("results")}
            />
          )}
          {active === "results" && (
            <DesignResultsPage
              prompt={designPrompt}
              result={designResult}
              accepted={isDesignAccepted && acceptedResult === designResult}
              onRefined={(result) => {
                setDesignResult(result);
                setAcceptedPrompt("");
                setAcceptedResult(null);
              }}
              onAccept={() => {
                setAcceptedPrompt(designPrompt);
                setAcceptedResult(designResult);
                setActive("explore");
              }}
            />
          )}
          {active === "explore" && <ExplorePage prompt={acceptedPrompt} result={acceptedResult} onOpenCad={() => setActive("cad")} />}
          {active === "cad" && <CadPage prompt={acceptedPrompt} result={acceptedResult} />}
        </section>
      </div>
    </main>
  );
}

function TopActionPanel({ panel, prompt, result, onClose }) {
  const hasResult = Boolean(result);
  const fileBase = safeFileBase(result?.cadLayout?.device || "smart-health-generated-design");

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
    downloadBlob(exportStlBlob(buildAssembly(result.cadLayout).unioned), `${fileBase}.stl`);
  }

  async function shareReport() {
    if (!result) return;
    const title = result.cadLayout?.device || "Smart Health Generated Design";
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
          <p>Start with a clinical design prompt, let the system gather sources, then review a clean generated design workspace when the proposal and CAD concept are complete.</p>
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
        <Panel title="Summary" icon={Check} items={["PrimeKG and guideline stores are local SQLite files", "Semantic Scholar and PubTator3 are live API calls", "Standards are metadata-only verify-against references"]} />
      </aside>
    </div>
  );
}

function NewDesignPage({ result, onResult, onOpenResults }) {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const isComplete = Boolean(result?.cadLayout);

  async function runDesignSearch(event) {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || status === "loading") return;

    setStatus("loading");
    setError(null);
    onResult("", null);

    try {
      const response = await fetch("http://127.0.0.1:3001/api/design-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || "Design search failed");
      onResult(trimmed, data);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Design search failed");
      setStatus("error");
    }
  }

  return (
    <div className="new-design">
      <div className="center-copy">
        <h1>Generate a New Smart Health Design</h1>
        <p>Describe the health need once. The workspace will retrieve evidence, reason over it, and prepare a CAD concept before unlocking the generated design page.</p>
      </div>
      <h2>1. What would you like to design?</h2>
      <div className="choice-grid">
        {[[Box, "CAD Design"], [Cpu, "Mobile App Design"], [PackageCheck, "Both CAD & Mobile App"]].map(([Icon, title]) => (
          <button className="choice-card" key={title}><Icon size={48} /><span>{title}</span><p>{title === "CAD Design" ? "Evidence-backed hardware concept and downloadable STL." : title === "Mobile App Design" ? "Companion workflows, monitoring screens, and data needs." : "Coordinate physical device and digital experience."}</p><i /></button>
        ))}
      </div>
      <h2>2. Describe your design goal</h2>
      <div className="prompt-example"><Sparkles size={24} /><div><strong>Example Prompt</strong><p>"Design a non-invasive wearable system for continuously monitoring shortness of breath in patients with Cystic Fibrosis."</p></div></div>
      <form className="composer" onSubmit={runDesignSearch}>
        <MessageSquare size={32} />
        <textarea
          aria-label="Describe your design goal"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe a smart health product concept for a target user group and condition..."
          rows={2}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) runDesignSearch(event);
          }}
        />
        <button type="submit" disabled={status === "loading" || !prompt.trim()}><Send /></button>
      </form>

      {status === "loading" && (
        <div className="generation-panel">
          <h3><RefreshCw size={20} />Generating workspace</h3>
          <GenerationSteps />
        </div>
      )}
      {status === "error" && (
        <div className="design-status error">
          <span className="status-dot error" />
          {error}
        </div>
      )}
      <div className={isComplete ? "results-gate ready" : "results-gate"}>
        <div>
          <strong>{isComplete ? "Generated design is ready" : "Generated design page is locked"}</strong>
          <p>{isComplete ? "Retrieval, proposal generation, and CAD layout are complete." : "The button activates after evidence retrieval and CAD layout generation finish."}</p>
        </div>
        <button className="primary gate-button" disabled={!isComplete} onClick={onOpenResults}>Open Generated Design</button>
      </div>
    </div>
  );
}

function GenerationSteps() {
  return (
    <div className="generation-steps">
      {["Extracting disease, symptom, and device intent", "Resolving disease terminology", "Retrieving graph, literature, and guideline evidence", "Generating proposal and CAD component layout"].map((step) => (
        <div className="generation-step" key={step}><span className="status-dot" />{step}</div>
      ))}
    </div>
  );
}

function DesignResultsPage({ prompt, result, accepted, onRefined, onAccept }) {
  const [audience, setAudience] = useState("common");
  const [refinement, setRefinement] = useState("");
  const [refineStatus, setRefineStatus] = useState("idle");
  const [refineError, setRefineError] = useState(null);

  if (!result?.cadLayout) {
    return (
      <div className="empty-results">
        <Box size={42} />
        <h1>No completed design yet</h1>
        <p>Run a New Design search first. This page unlocks once the evidence and CAD concept are both complete.</p>
      </div>
    );
  }

  const { kgGrounded, subgraph, literature, guidelines, standardsReferenced, proposal, warnings } = result;
  const isProfessional = audience === "professional";

  async function submitRefinement(event) {
    event.preventDefault();
    const trimmed = refinement.trim();
    if (!trimmed || refineStatus === "loading") return;

    setRefineStatus("loading");
    setRefineError(null);
    try {
      const response = await fetch("http://127.0.0.1:3001/api/design-refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, previousPrompt: prompt, previousResult: result })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || "Design refinement failed");
      onRefined(data);
      setRefinement("");
      setRefineStatus("idle");
    } catch (err) {
      setRefineError(err instanceof Error ? err.message : "Design refinement failed");
      setRefineStatus("error");
    }
  }

  return (
    <div className="generated-page">
      <section className="generated-hero">
        <div>
          <span className="eyebrow">Generated design package</span>
          <h1>{result.cadLayout.device}</h1>
          <div className="chip-row"><span className="chip">{result.cadLayout.formFactor || "auto-selected form factor"}</span></div>
          <p>{prompt}</p>
        </div>
        <div className="completion-card">
          <CheckCircle2 size={28} />
          <strong>{accepted ? "Accepted design" : "Draft ready for review"}</strong>
          <span>{accepted ? "RAG Exploration and CAD Workspace are using this version." : "Refine it until it feels right, then accept it."}</span>
        </div>
      </section>

      <article className="panel refine-panel">
        <h3><MessageSquare size={20} />Refine This Design</h3>
        <form className="refine-form" onSubmit={submitRefinement}>
          <textarea
            aria-label="Describe how to improve the generated design"
            value={refinement}
            onChange={(event) => setRefinement(event.target.value)}
            placeholder="Example: make it less bulky, focus on diabetes-friendly glucose alerts, add a caregiver notification component..."
            rows={3}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) submitRefinement(event);
            }}
          />
          <button className="primary" type="submit" disabled={refineStatus === "loading" || !refinement.trim()}>{refineStatus === "loading" ? "Improving..." : "Improve Design"}</button>
        </form>
        {refineError && <div className="design-status error"><span className="status-dot error" />{refineError}</div>}
        {result.refinementHistory?.length > 0 && <p>{result.refinementHistory.length} refinement{result.refinementHistory.length === 1 ? "" : "s"} applied to this draft.</p>}
        <button className="success accept-button" onClick={onAccept} disabled={accepted}>{accepted ? "Accepted" : "I Like This Design"}</button>
      </article>

      <AudienceToggle value={audience} onChange={setAudience} />

      <CadLayoutPanel layout={result.cadLayout} />

      {audience === "common" && <CommonResults prompt={prompt} result={result} />}

      {isProfessional && warnings?.length > 0 && (
        <article className="panel warnings-panel">
          <h3><SlidersHorizontal size={20} />Warnings</h3>
          {warnings.map((w) => <div className="list-row" key={w}>{w}</div>)}
        </article>
      )}

      {isProfessional && <article className="panel">
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

      {isProfessional && <FormattedProposal text={proposal} />}

      {isProfessional && <TechnicalEvidenceOptions result={result} />}

      {isProfessional && <SimilarSolutionsPanel result={result} />}

      {isProfessional && <article className="panel">
        <h3><BookOpen size={20} />Literature Evidence (Semantic Scholar)</h3>
        {literature.length === 0 && <p>No papers retrieved for this prompt.</p>}
        {literature.map((paper) => (
          <div className="paper-card" key={paper.title}>
            <a href={paper.url} target="_blank" rel="noreferrer">{paper.title}</a>
            <span>{[paper.venue, paper.year].filter(Boolean).join(" · ")}</span>
            {paper.abstract && <p>{paper.abstract.slice(0, 220)}...</p>}
          </div>
        ))}
      </article>}

      {isProfessional && <article className="panel">
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
          <h4>Standards to verify against <small>(reference only — not full-text indexed)</small></h4>
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

function AudienceToggle({ value, onChange }) {
  return (
    <article className="panel audience-panel">
      <h3><Eye size={20} />Result Detail Level</h3>
      <div className="segmented-control" role="group" aria-label="Result detail level">
        <button className={value === "common" ? "active" : ""} onClick={() => onChange("common")}>Common user</button>
        <button className={value === "professional" ? "active" : ""} onClick={() => onChange("professional")}>Professional</button>
      </div>
      <p>{value === "common" ? "Shows the CAD concept and plain-language summary without detailed evidence tables." : "Shows citations, genes/proteins, phenotypes, guidelines, standards, and CAD rationale."}</p>
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
        source: [paper.venue, paper.year].filter(Boolean).join(" | ") || "Semantic Scholar",
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
  const componentCount = result.cadLayout?.components?.length || 0;
  return `This generated concept proposes a ${intent}${condition}${symptom}. The CAD preview shows a simple wearable-style design with ${componentCount} main parts, meant to help communicate the idea visually. It is a starting point for discussion, not a finished medical device.`;
}

function TechnicalEvidenceOptions({ result }) {
  const groups = [
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

  return (
    <article className="panel evidence-options-panel">
      <h3><ClipboardList size={20} />Technical Evidence Options</h3>
      <div className="evidence-options">
        {groups.map(({ title, icon: Icon, items }) => (
          <details key={title}>
            <summary><Icon size={18} />{title}<span>{items.length}</span></summary>
            <div className="option-list">
              {items.length === 0 && <p>No items retrieved.</p>}
              {items.map((item, index) => (
                <div className="option-row" key={`${title}-${item.label}-${index}`}>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </div>
              ))}
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

function CadLayoutPanel({ layout }) {
  const assembly = useMemo(() => buildAssembly(layout), [layout]);

  function downloadStl() {
    const blob = exportStlBlob(assembly.unioned);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${layout.device.replace(/\s+/g, "-").toLowerCase()}.stl`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <article className="panel">
      <h3><Box size={20} />CAD Design Concept: {layout.device}</h3>
      <div className="chip-row"><span className="chip">{layout.formFactor || "auto-selected form factor"}</span></div>
      <div className="design-status">
        <span className="status-dot" />
        {layout.caveat}
      </div>
      <div className="cad-preview-canvas">
        <Canvas camera={{ position: [3.5, 2.5, 3.5], fov: 45 }}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[4, 5, 4]} intensity={1} />
          <gridHelper args={[6, 12, "#1463ff", "#0a1f30"]} />
          {assembly.parts.map((part) => <CadPartMesh key={part.id} part={part} />)}
          <OrbitControls />
        </Canvas>
      </div>
      <button className="primary" onClick={downloadStl}>Download STL</button>
      <div className="evidence-group">
        <h4>Component evidence</h4>
        {assembly.parts.map((part) => (
          <div className="list-row" key={part.id}>
            <Check size={16} />
            <span><strong>{part.type}</strong> ({part.material}) — {part.groundedIn}</span>
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
    `CAD Parts ${result.cadLayout?.components?.length || 0}`
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
  if (!result?.cadLayout?.components?.length) return ["No generated CAD components yet."];
  return result.cadLayout.components.map((component) => `${component.type}: ${component.material}`);
}

function cadEvidenceItems(result) {
  if (!result?.cadLayout?.components?.length) return ["Run a New Design search to generate component evidence."];
  return result.cadLayout.components.map((component) => `${component.type}: ${component.groundedIn}`);
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
      text: `${result.literature.length} Semantic Scholar papers were retrieved for the disease, symptom, and device intent.`,
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
  const components = result.cadLayout?.components || [];

  return (
    <div className="explore-grid">
      <aside className="left-rail">
        <Panel title="Knowledge Sources (RAG)" icon={Search} items={["PrimeKG knowledge graph", "Semantic Scholar papers", "MedlinePlus health topics", "ONC SAFER Guides", "USCDI data classes", "Named standards references"]} />
        <Panel title="Extracted Prompt" icon={SlidersHorizontal} items={[
          `Disease: ${result.extraction?.disease || "not detected"}`,
          `Symptom: ${result.extraction?.symptomPhrase || "not detected"}`,
          `Device intent: ${result.extraction?.deviceIntent || "not detected"}`
        ]} />
      </aside>
      <section className="main-area">
        <h1>Retrieval-Augmented Design Exploration</h1>
        {prompt && <p>{prompt}</p>}
        <div className="metric-row">
          {metrics.map((item) => <div className="metric" key={item}>{item}</div>)}
        </div>
        <div className="concept-grid">
          {components.length > 0 ? (
            components.slice(0, 4).map((component, index) => (
              <Concept key={component.id} title={`Component ${index + 1}`} name={component.type} material={component.material} evidence={component.groundedIn} />
            ))
          ) : (
            <Concept title="Generated Concept" name={result.cadLayout?.device || "Design proposal"} material="CAD layout not available" evidence="The proposal was generated, but no CAD component layout was returned." />
          )}
        </div>
        <Panel title="Rationale & Key Evidence" icon={FileText} items={evidenceItems(result)} />
        <CompareTable result={result} />
      </section>
      <aside className="right-rail chat-rail">
        <Panel title="Generated Design" icon={UserRound} items={[
          result.cadLayout?.device || "No CAD concept generated",
          result.kgGrounded ? "PrimeKG grounded" : "No PrimeKG match",
          `${result.warnings?.length || 0} warnings`
        ]} />
        <Chat />
        <button className="primary" disabled={!result.cadLayout} onClick={onOpenCad}>Proceed to CAD Design</button>
      </aside>
    </div>
  );
}

function CadPage({ prompt, result }) {
  const insights = cadInsightCards(result);

  return (
    <div className="cad-grid">
      <aside className="left-rail">
        <Panel title="Generated Model Layers" icon={Layers} items={cadLayerItems(result)} />
        <Panel title="Component Evidence" icon={Gauge} items={cadEvidenceItems(result)} />
      </aside>
      <section className="cad-stage">
        {result?.cadLayout ? <GeneratedCadViewer layout={result.cadLayout} prompt={prompt} /> : <StlUploadViewer />}
      </section>
      <aside className="right-rail cad-copy">
        <h1>{result?.cadLayout?.device || "CAD Workspace"}</h1>
        {prompt && <p>{prompt}</p>}
        {insights.length > 0 ? insights.map((card, idx) => (
          <article className="explain" key={card.title}><strong>{idx + 1}. {card.title}</strong><p>{card.text}</p><span>{card.impact}</span></article>
        )) : (
          <article className="explain"><strong>No generated CAD yet</strong><p>Run a New Design search to populate this workspace with generated layers, component evidence, and a CAD preview.</p><span>Waiting</span></article>
        )}
        <Chat compact />
        <div className="action-row"><button className="success">Accept Design</button><button className="primary">Proceed to Prototype</button></div>
      </aside>
    </div>
  );
}

function GeneratedCadViewer({ layout, prompt }) {
  const assembly = useMemo(() => buildAssembly(layout), [layout]);

  function downloadStl() {
    const blob = exportStlBlob(assembly.unioned);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${layout.device.replace(/\s+/g, "-").toLowerCase()}.stl`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="generated-cad-stage">
      <div className="stl-toolbar">
        <div>
          <strong>{layout.device}</strong>
          <span className="chip">{layout.formFactor || "auto-selected form factor"}</span>
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

  async function handleFile(event) {
    const file = event.target.files?.[0];
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

  return (
    <div className="stl-viewer">
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
            <p>Upload an .stl file to view and rotate/zoom it here.</p>
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

function Concept({ title, name, material, evidence }) {
  return <article className="concept"><h3>{title}</h3><h2>{name}</h2><div className="concept-art"><Box size={46} /></div><ul><li>{material}</li><li>{evidence}</li></ul></article>;
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
          <span>{status === "loading" ? "Thinking with Ollama..." : "Ollama: llama3.2"}</span>
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
