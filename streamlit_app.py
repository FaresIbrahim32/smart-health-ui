"""PaperLens — a local Streamlit UI for summarizing long research papers.

The summarization core mirrors Untitled25.ipynb:
    pipeline("summarization", model="allenai/led-large-16384-arxiv")

Run with:
    streamlit run streamlit_app.py
"""

from __future__ import annotations

import io
import re
from collections import Counter
from dataclasses import dataclass
from typing import Iterable

import streamlit as st


MODEL_NAME = "allenai/led-large-16384-arxiv"


@dataclass
class Paper:
    name: str
    text: str
    pages: int | None = None


@st.cache_resource(show_spinner=False)
def load_summarizer():
    """Load the notebook's LED model once per Streamlit session."""
    from transformers import pipeline

    return pipeline("summarization", model=MODEL_NAME, device_map="auto")


def extract_pdf(uploaded_file) -> tuple[str, int]:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(uploaded_file.getvalue()))
    pages = []
    for page in reader.pages:
        page_text = page.extract_text() or ""
        if page_text.strip():
            pages.append(page_text)
    return "\n\n".join(pages), len(reader.pages)


def clean_text(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"-\n(?=[a-z])", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if len(s.strip()) > 40]


def extract_highlights(text: str, limit: int = 6) -> list[str]:
    """Small transparent extractive layer for the UI's evidence-backed highlights."""
    items = sentences(text)
    if not items:
        return []
    words = re.findall(r"[a-zA-Z][a-zA-Z-]{3,}", text.lower())
    stop = set("about after again against all also because been being between could first from have into more most other over should some such than that their there these they this through using were which with would".split())
    freq = Counter(w for w in words if w not in stop)
    scored = []
    cue_words = {"result", "found", "showed", "significant", "conclude", "however", "method", "data", "evidence", "effect", "increase", "decrease"}
    for index, sentence in enumerate(items):
        ws = re.findall(r"[a-zA-Z][a-zA-Z-]{3,}", sentence.lower())
        score = sum(freq[w] for w in ws) / max(len(ws), 1)
        score += 1.5 * sum(w in cue_words for w in ws)
        if index < 3:
            score += 0.8
        scored.append((score, sentence))
    return [s for _, s in sorted(scored, reverse=True)[:limit]]


def chunk_text(text: str, max_chars: int = 55_000) -> list[str]:
    """Keep each LED call below its 16,384-token window without cutting mid-word."""
    if len(text) <= max_chars:
        return [text]
    chunks, current = [], []
    size = 0
    for paragraph in re.split(r"\n{2,}", text):
        if size + len(paragraph) > max_chars and current:
            chunks.append("\n\n".join(current))
            current, size = [], 0
        current.append(paragraph)
        size += len(paragraph)
    if current:
        chunks.append("\n\n".join(current))
    return chunks


def summarize(paper_text: str, detail: str, max_length: int, min_length: int) -> str:
    summarizer = load_summarizer()
    chunks = chunk_text(paper_text)
    outputs = []
    for chunk in chunks:
        result = summarizer(chunk, max_length=max_length, min_length=min_length, truncation=True)
        outputs.append(result[0]["summary_text"].strip())
    if len(outputs) == 1:
        return outputs[0]
    synthesis = "\n\n".join(outputs)
    if len(synthesis) > 55_000:
        synthesis = synthesis[:55_000]
    result = summarizer(synthesis, max_length=max_length, min_length=min_length, truncation=True)
    return result[0]["summary_text"].strip()


def format_number(number: int) -> str:
    return f"{number:,}"


def render_attention_strip():
    st.markdown(
        """
        <div class="attention-strip" aria-label="Transformer attention visualization">
          <div class="attention-label">ATTENTION PATH</div>
          <div class="attention-flow">
            <span class="token">abstract</span><i></i><span class="token">method</span><i></i>
            <span class="token active">results</span><i></i><span class="token">limits</span><i></i>
            <span class="token">signal</span>
          </div>
          <div class="attention-meta">LED · 16K CONTEXT</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


st.set_page_config(page_title="PaperLens · Research distiller", page_icon="◒", layout="wide", initial_sidebar_state="expanded")

st.markdown(
    """
    <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;600;700&display=swap');
    :root { --ink:#17251e; --muted:#68746c; --line:#dfe6df; --paper:#fbfcf8; --mint:#d8f2df; --green:#0d6547; --acid:#d6ff54; }
    .stApp { background:var(--paper); color:var(--ink); }
    [data-testid="stHeader"] { background:transparent; }
    .block-container { max-width: 1380px; padding-top: 2rem; padding-bottom: 4rem; }
    h1,h2,h3,p,div,span,label,button { font-family:'Space Grotesk', sans-serif; }
    h1 { letter-spacing:-.065em; font-size:clamp(3rem, 6vw, 6.8rem); line-height:.9; font-weight:600; margin:0; }
    h2 { letter-spacing:-.04em; font-size:2.25rem; margin:.2rem 0 1rem; }
    h3 { letter-spacing:-.03em; }
    .mono, .eyebrow, .attention-label, .attention-meta { font-family:'DM Mono', monospace; }
    .eyebrow { color:var(--green); font-size:.72rem; letter-spacing:.12em; text-transform:uppercase; margin-bottom:1rem; }
    .hero { border-bottom:1px solid var(--line); padding:2rem 0 2.7rem; margin-bottom:2rem; }
    .hero p { max-width:600px; color:var(--muted); font-size:1.1rem; line-height:1.5; margin-top:1.5rem; }
    .badge { display:inline-flex; padding:.35rem .65rem; background:var(--acid); color:var(--ink); font:500 .68rem 'DM Mono'; letter-spacing:.08em; margin-top:1rem; }
    .attention-strip { display:flex; align-items:center; gap:1.25rem; border:1px solid var(--line); background:#f4f8f1; padding:.8rem 1rem; margin:0 0 1.5rem; }
    .attention-label,.attention-meta { font-size:.62rem; letter-spacing:.1em; color:var(--green); white-space:nowrap; }
    .attention-flow { display:flex; align-items:center; gap:.5rem; flex:1; }
    .token { font:500 .68rem 'DM Mono'; border:1px solid #c8d4ca; padding:.3rem .45rem; color:#526057; background:white; }
    .token.active { background:var(--green); color:white; border-color:var(--green); }
    .attention-flow i { display:block; height:1px; flex:1; min-width:18px; background:linear-gradient(90deg,#b9cabd,#d6ff54,#b9cabd); }
    .section-label { border-top:1px solid var(--line); padding-top:.8rem; color:var(--green); font:500 .7rem 'DM Mono'; letter-spacing:.1em; text-transform:uppercase; }
    .upload-card { background:white; border:1px solid var(--line); padding:1.3rem; min-height:220px; }
    .stat { border-top:2px solid var(--ink); padding-top:.6rem; }
    .stat .value { font-size:1.8rem; font-weight:600; letter-spacing:-.05em; }
    .stat .label { color:var(--muted); font: .65rem 'DM Mono'; text-transform:uppercase; letter-spacing:.08em; }
    .summary-card { background:white; border:1px solid var(--line); padding:1.7rem; margin-top:1rem; }
    .summary-card p { font-size:1.08rem; line-height:1.7; }
    .highlight { border-left:3px solid var(--green); padding:.75rem 1rem; background:#f3f8ef; margin:.6rem 0; line-height:1.5; }
    .notice { background:#fff8dc; border:1px solid #eadca2; padding:1rem 1.1rem; color:#5a512d; }
    [data-testid="stFileUploaderDropzone"] { background:#f5f9f2; border:1px dashed #9fb7a2; border-radius:0; }
    .stButton > button { border-radius:0; font-family:'DM Mono'; text-transform:uppercase; letter-spacing:.06em; font-size:.72rem; padding:.8rem 1rem; }
    .stButton > button[kind="primary"] { background:var(--green); border-color:var(--green); color:white; }
    </style>
    """,
    unsafe_allow_html=True,
)

with st.sidebar:
    st.markdown("## ◒ PaperLens")
    st.caption("Research, distilled.")
    st.markdown("<div class='section-label'>MODEL CONTROLS</div>", unsafe_allow_html=True)
    detail = st.selectbox("Summary depth", ["Detailed", "Balanced", "Fast"], index=0)
    if detail == "Detailed":
        max_length, min_length = 420, 160
    elif detail == "Balanced":
        max_length, min_length = 300, 100
    else:
        max_length, min_length = 180, 60
    st.caption("Uses LED-large trained for long arXiv papers. The first run downloads the model and may take a few minutes.")
    st.markdown("<div class='section-label'>OUTPUT</div>", unsafe_allow_html=True)
    st.checkbox("Show evidence highlights", value=True, key="show_highlights")
    st.checkbox("Show extracted text", value=False, key="show_text")

st.markdown("<div class='eyebrow'>LONG-FORM RESEARCH · LOCAL AI</div>", unsafe_allow_html=True)
st.markdown("<div class='hero'><h1>Read less.<br><em>Understand more.</em></h1><p>Drop in a research paper and get the thesis, method, findings, and caveats in one clear pass — powered by the same long-document transformer from your notebook.</p><span class='badge'>◒ ATTENTION-BASED PAPER DISTILLER</span></div>", unsafe_allow_html=True)
render_attention_strip()

left, right = st.columns([1.35, .65], gap="large")
with left:
    st.markdown("<div class='section-label'>01 / LOAD A PAPER</div>", unsafe_allow_html=True)
    uploaded = st.file_uploader("Upload a PDF or plain-text paper", type=["pdf", "txt"], label_visibility="collapsed")
    if uploaded:
        try:
            if uploaded.name.lower().endswith(".pdf"):
                raw_text, page_count = extract_pdf(uploaded)
            else:
                raw_text, page_count = uploaded.getvalue().decode("utf-8", errors="ignore"), None
            paper = Paper(uploaded.name, clean_text(raw_text), page_count)
            st.session_state.paper = paper
        except Exception as exc:
            st.error(f"Could not read this file: {exc}")

    paper = st.session_state.get("paper")
    if paper:
        st.markdown(f"**{paper.name}**")
        s1, s2, s3 = st.columns(3)
        with s1: st.markdown(f"<div class='stat'><div class='value'>{format_number(len(paper.text.split()))}</div><div class='label'>words extracted</div></div>", unsafe_allow_html=True)
        with s2: st.markdown(f"<div class='stat'><div class='value'>{paper.pages or '—'}</div><div class='label'>pages detected</div></div>", unsafe_allow_html=True)
        with s3: st.markdown(f"<div class='stat'><div class='value'>{len(chunk_text(paper.text))}</div><div class='label'>attention windows</div></div>", unsafe_allow_html=True)
        if not paper.text:
            st.warning("No selectable text was found. This PDF may be scanned; run OCR first.")
        summarize_clicked = st.button("Summarize this paper →", type="primary", use_container_width=True, disabled=not bool(paper.text))
    else:
        st.markdown("<div class='upload-card'><h3>Start with a paper</h3><p>PDFs work best. Text extraction stays on this machine, and the summary is generated locally once the model is installed.</p><p class='mono' style='color:#68746c;font-size:.72rem'>SUPPORTED · PDF / TXT</p></div>", unsafe_allow_html=True)
        summarize_clicked = False

with right:
    st.markdown("<div class='section-label'>WHAT YOU’LL GET</div>", unsafe_allow_html=True)
    st.markdown("### A useful first read")
    st.markdown("A concise thesis, the paper’s strongest evidence, important limitations, and a set of high-signal sentences pulled from the source.")
    st.markdown("<div class='notice'><b>Privacy note</b><br>Files are processed by this local Streamlit process. Nothing is uploaded to a third-party summarization API.</div>", unsafe_allow_html=True)

if paper and summarize_clicked:
    with st.spinner("Following the paper’s attention path…"):
        try:
            st.session_state.summary = summarize(paper.text, detail, max_length, min_length)
            st.session_state.highlights = extract_highlights(paper.text)
            st.session_state.summary_name = paper.name
        except Exception as exc:
            st.error("The model could not summarize this paper. Check the install steps below.")
            st.exception(exc)

if st.session_state.get("summary"):
    st.markdown("<div class='section-label' style='margin-top:3rem'>02 / YOUR DISTILLATION</div>", unsafe_allow_html=True)
    st.markdown(f"## {st.session_state.get('summary_name', 'Paper summary')}")
    st.markdown("<div class='summary-card'><div class='eyebrow'>MODEL SYNTHESIS</div>" + st.session_state.summary + "</div>", unsafe_allow_html=True)
    if st.session_state.get("show_highlights", True) and st.session_state.get("highlights"):
        st.markdown("### Evidence highlights")
        for item in st.session_state.highlights:
            st.markdown(f"<div class='highlight'>{item}</div>", unsafe_allow_html=True)
    st.download_button("Download summary", st.session_state.summary, file_name="paperlens-summary.txt", mime="text/plain")
    if st.session_state.get("show_text"):
        with st.expander("View extracted text"):
            st.write(paper.text)

with st.expander("Setup / first run"):
    st.code("python -m pip install -r requirements-streamlit.txt\nstreamlit run streamlit_app.py", language="bash")
    st.caption("The app uses pypdf for extraction and transformers + PyTorch for the LED summarizer in Untitled25.ipynb.")
