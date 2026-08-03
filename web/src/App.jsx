import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  BarChart3,
  BookOpen,
  Box,
  Brain,
  Check,
  ChevronDown,
  ClipboardList,
  CloudUpload,
  Cpu,
  Database,
  Eye,
  FileText,
  Gauge,
  History,
  Home,
  Layers,
  MessageSquare,
  Microscope,
  PackageCheck,
  PenTool,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  UsersRound,
  Wrench
} from "lucide-react";
import "./styles.css";

const pages = [
  { id: "pipeline", label: "Pipeline", icon: Activity },
  { id: "knowledge", label: "Knowledge Sources", icon: BookOpen },
  { id: "new", label: "New Design", icon: Home },
  { id: "explore", label: "RAG Exploration", icon: Search },
  { id: "cad", label: "CAD Workspace", icon: Box }
];

const sourceTypes = [
  ["Biomedical Literature", "13,254", BookOpen, "blue"],
  ["Clinical Guidelines", "1,246", ClipboardList, "green"],
  ["Engineering Standards", "3,652", ShieldCheck, "purple"],
  ["Device Specifications", "2,915", Cpu, "cyan"],
  ["Human Factors Guidance", "1,186", UserRound, "yellow"],
  ["Digital Health Architectures", "4,378", Layers, "blue"]
];

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
  const [active, setActive] = useState("pipeline");
  const ActiveIcon = pages.find((page) => page.id === active)?.icon || Activity;
  return (
    <main className="app">
      <header className="topbar">
        <Logo />
        <nav className="top-actions">
          {["Retrieval", "Constraints", "Stakeholders", "History", "Export"].map((item) => (
            <button className="ghost" key={item}>{item}</button>
          ))}
        </nav>
        <button className="avatar">JT <ChevronDown size={16} /></button>
      </header>
      <div className="mobile-tabs">
        {pages.map((page) => {
          const Icon = page.icon;
          return <button key={page.id} className={active === page.id ? "active" : ""} onClick={() => setActive(page.id)}><Icon size={17} />{page.label}</button>;
        })}
      </div>
      <div className="shell">
        <aside className="sidebar">
          {pages.map((page) => {
            const Icon = page.icon;
            return <button key={page.id} className={active === page.id ? "nav-item active" : "nav-item"} onClick={() => setActive(page.id)}><Icon size={21} />{page.label}</button>;
          })}
          <div className="info-panel">
            <h3>Placeholder Panel</h3>
            <p>Use this area for short helper text, upload notes, or contextual metadata.</p>
            <a>Learn more &gt;</a>
          </div>
        </aside>
        <section className="screen">
          <div className="screen-title">
            <ActiveIcon size={22} />
            <span>{pages.find((page) => page.id === active)?.label}</span>
          </div>
          {active === "pipeline" && <PipelinePage />}
          {active === "knowledge" && <KnowledgePage />}
          {active === "new" && <NewDesignPage />}
          {active === "explore" && <ExplorePage />}
          {active === "cad" && <CadPage />}
        </section>
      </div>
    </main>
  );
}

function PipelinePage() {
  const columns = [
    ["1", "Retrieval-Grounded Generative Reasoning", "AI retrieves and reasons over placeholder biomedical evidence.", BookOpen, "blue"],
    ["2", "Multimodal Human Feedback Integration", "Stakeholder inputs refine decisions and priorities.", UsersRound, "green"],
    ["3", "Explainable Chain-of-Thought Design Synthesis", "Transparent placeholder steps compare candidate concepts.", Brain, "purple"],
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
              {[BookOpen, ClipboardList, ShieldCheck, Cpu, UsersRound].slice(0, num === "1" ? 5 : 3).map((Mini, idx) => (
                <div className="list-row" key={idx}><Mini size={19} />Placeholder source {idx + 1}</div>
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
        <p>Curated placeholder knowledge to power evidence-informed, human-centered design.</p>
        <div className="source-grid">
          {sourceTypes.map(([title, count, Icon, color]) => (
            <article className={`source-card accent-${color}`} key={title}>
              <Icon size={46} />
              <h2>{title}</h2>
              <p>Placeholder description for this source category and its role in the design process.</p>
              <ul><li>Placeholder source</li><li>Placeholder repository</li><li>Placeholder standard</li></ul>
              <button>{count} sources</button>
            </article>
          ))}
        </div>
      </section>
      <aside className="right-rail">
        <Donut />
        <Panel title="Source Types" icon={Layers} items={sourceTypes.map(([title, count]) => `${title}: ${count}`)} />
        <Panel title="Summary" icon={Check} items={["Last updated: Just now", "Auto-update: Enabled", "Quality score: High"]} />
      </aside>
    </div>
  );
}

function NewDesignPage() {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function runDesignSearch(event) {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || status === "loading") return;

    setStatus("loading");
    setError(null);
    setResult(null);

    try {
      const response = await fetch("http://127.0.0.1:3001/api/design-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || "Design search failed");
      setResult(data);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Design search failed");
      setStatus("error");
    }
  }

  return (
    <div className="new-design">
      <div className="center-copy">
        <h1>Welcome to Smart Health by Design</h1>
        <p>Describe your design goal and explore placeholder health solutions with evidence and stakeholder insight.</p>
      </div>
      <h2>1. What would you like to design?</h2>
      <div className="choice-grid">
        {[[Box, "CAD Design"], [Cpu, "Mobile App Design"], [PackageCheck, "Both CAD & Mobile App"]].map(([Icon, title]) => (
          <button className="choice-card" key={title}><Icon size={48} /><span>{title}</span><p>Placeholder description for this design mode.</p><i /></button>
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
        <div className="design-status">
          <span className="status-dot" />
          Grounding in PrimeKG, searching literature, and reasoning about your prompt — this can take up to a minute...
        </div>
      )}
      {status === "error" && (
        <div className="design-status error">
          <span className="status-dot error" />
          {error}
        </div>
      )}
      {result && <DesignSearchResult result={result} />}
    </div>
  );
}

function DesignSearchResult({ result }) {
  const { kgGrounded, subgraph, literature, guidelines, standardsReferenced, proposal, warnings } = result;
  return (
    <div className="design-results">
      {warnings?.length > 0 && (
        <article className="panel warnings-panel">
          <h3><SlidersHorizontal size={20} />Warnings</h3>
          {warnings.map((w) => <div className="list-row" key={w}>{w}</div>)}
        </article>
      )}

      <article className="panel">
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
      </article>

      <article className="panel">
        <h3><BookOpen size={20} />Literature Evidence (Semantic Scholar)</h3>
        {literature.length === 0 && <p>No papers retrieved for this prompt.</p>}
        {literature.map((paper) => (
          <div className="paper-card" key={paper.title}>
            <a href={paper.url} target="_blank" rel="noreferrer">{paper.title}</a>
            <span>{[paper.venue, paper.year].filter(Boolean).join(" · ")}</span>
            {paper.abstract && <p>{paper.abstract.slice(0, 220)}...</p>}
          </div>
        ))}
      </article>

      <article className="panel">
        <h3><ShieldCheck size={20} />Clinical & Regulatory Guidance</h3>
        {guidelines.length === 0 && <p>No guideline excerpts retrieved for this prompt.</p>}
        {guidelines.map((hit) => (
          <div className="paper-card" key={`${hit.source}-${hit.title}-${hit.text.slice(0, 20)}`}>
            <a href={hit.url} target="_blank" rel="noreferrer">{hit.title}</a>
            <span>{hit.source}</span>
            <p>{hit.text.slice(0, 220)}...</p>
          </div>
        ))}
        <div className="evidence-group">
          <h4>Standards to verify against <small>(reference only — not full-text indexed)</small></h4>
          <div className="chip-row">
            {standardsReferenced.map((s) => (
              <span className="chip" key={s.standard} title={s.title}>{s.standard}</span>
            ))}
          </div>
        </div>
      </article>

      <article className="panel">
        <h3><Brain size={20} />Proposed Direction (reasoning only, not implemented)</h3>
        <p className="proposal-text">{proposal}</p>
      </article>
    </div>
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

function ExplorePage() {
  return (
    <div className="explore-grid">
      <aside className="left-rail">
        <Panel title="Knowledge Sources (RAG)" icon={Search} items={["Biomedical Literature", "Clinical Guidelines", "Engineering Standards", "Device Specifications", "Stakeholder Requirements"]} />
        <Panel title="Filters & Constraints" icon={SlidersHorizontal} items={["Design goals", "Key constraints", "Performance", "Usability", "Safety"]} />
      </aside>
      <section className="main-area">
        <h1>Retrieval-Augmented Design Exploration</h1>
        <div className="metric-row">
          {["Sources Retrieved 1,428", "Evidence Chunks 3,801", "Confidence 0.86 High", "Updated Just now"].map((item) => <div className="metric" key={item}>{item}</div>)}
        </div>
        <div className="concept-grid">
          <Concept title="Option A" name="Full-Palate Retainer" />
          <Concept title="Option B" name="Adaptive Fit Mouthguard" />
        </div>
        <Panel title="Rationale & Key Evidence" icon={FileText} items={["Biomedical placeholder", "Clinical placeholder", "Engineering placeholder", "Human factors placeholder"]} />
        <CompareTable />
      </section>
      <aside className="right-rail chat-rail">
        <Panel title="Your Viewpoint" icon={UserRound} items={["Patient", "Caregiver", "Clinician", "Engineer", "Researcher"]} />
        <Chat />
        <button className="primary">Proceed to CAD Design</button>
      </aside>
    </div>
  );
}

function CadPage() {
  return (
    <div className="cad-grid">
      <aside className="left-rail">
        <Panel title="Model Layers" icon={Layers} items={["Flexible PCB (Main)", "PPG Sensors", "Temp Sensors", "Battery Module", "Biomaterial Casing", "Reference Arch"]} />
        <Panel title="Layer Controls" icon={Gauge} items={["Opacity: 60%", "Material: Medical Grade TPU", "Thickness: 1.2 mm", "Color: Safety yellow"]} />
      </aside>
      <section className="cad-stage">
        <div className="toolbar">{[PenTool, RefreshCw, Search, Eye, Box, Layers].map((Icon, idx) => <button key={idx}><Icon size={18} /></button>)}</div>
        <div className="model-art"><div className="arc arc-1" /><div className="arc arc-2" /><div className="sensor s1" /><div className="sensor s2" /><span>3D Placeholder Model</span></div>
        <div className="layer-tabs"><button>PCB Only</button><button>Sensors</button><button>Casing</button><button>All Layers</button></div>
      </section>
      <aside className="right-rail cad-copy">
        <h1>Generative Design Explanation</h1>
        {["Physiologic Constraints", "Hardware Constraints", "Software Constraints"].map((title, idx) => (
          <article className="explain" key={title}><strong>{idx + 1}. {title}</strong><p>Placeholder justification bullets explaining impact, trade-offs, and design evidence.</p><span>{idx < 2 ? "High Impact" : "Medium Impact"}</span></article>
        ))}
        <Chat compact />
        <div className="action-row"><button className="success">Accept Design</button><button className="primary">Proceed to Prototype</button></div>
      </aside>
    </div>
  );
}

function Panel({ title, icon: Icon, items }) {
  return <article className="panel"><h3><Icon size={20} />{title}</h3>{items.map((item) => <div className="list-row" key={item}><Check size={16} />{item}</div>)}</article>;
}

function Donut() {
  return <div className="panel donut-panel"><h3>Knowledge Hub Overview</h3><div className="donut"><span>26,631<br /><small>Total</small></span></div></div>;
}

function Concept({ title, name }) {
  return <article className="concept"><h3>{title}</h3><h2>{name}</h2><div className="mouthguard" /><ul><li>Placeholder evidence point</li><li>Placeholder design trade-off</li><li>Placeholder usability note</li></ul></article>;
}

function CompareTable() {
  return <article className="panel"><h3><BarChart3 size={20} />Trade-Off Summary</h3>{["Comfort", "Signal Quality", "Wearability", "Manufacturability", "Overall"].map((row) => <div className="table-row" key={row}><span>{row}</span><b>Medium</b><em>vs</em><b>High</b><small>Placeholder insight</small></div>)}</article>;
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
