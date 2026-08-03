# Smart Health UI

This deliverable includes two implementations of the provided 5-page UI sample:

- `web/` - Vite + React web app
- `mobile/` - Expo + React Native mobile app

Both apps share the same 5-page concept (Pipeline, Knowledge Sources, New Design, RAG Exploration, CAD Workspace). Most of the UI is still placeholder content, with two exceptions in `web/`:

- **AI Co-Pilot chat** (RAG Exploration / CAD Workspace pages) - a chat widget backed by a local Ollama model.
- **New Design page** - a real evidence-grounded design-search pipeline (see below), not a placeholder.

## New Design page: the design-search pipeline

Submitting a prompt on the New Design page (e.g. *"Design a non-invasive wearable system for continuously monitoring shortness of breath in patients with Cystic Fibrosis."*) runs a multi-step pipeline (`POST /api/design-search` in `web/server.js`) before any reasoning happens, so the final proposal is grounded in retrieved evidence instead of the model inventing clinical context:

1. **Entity extraction** - Ollama pulls `{disease, symptomPhrase, deviceIntent}` out of the free-text prompt.
2. **Synonym resolution** - the extracted disease name is passed through NCBI's PubTator3 autocomplete API to resolve aliases/typos (e.g. "mucoviscidosis") to their canonical MeSH/MONDO term before graph lookup.
3. **Knowledge-graph grounding** - the canonical disease name is matched against [PrimeKG](https://github.com/mims-harvard/PrimeKG) (129K nodes / 8.1M edges, indexed locally in SQLite), and the pipeline traverses real `disease_phenotype_positive`, `disease_protein`, and `anatomy_protein_present` edges to pull an evidence subgraph (phenotypes, genes/proteins, related anatomy).
4. **Literature search** - Semantic Scholar is queried (rate-limited to the API's 1 req/sec) using the disease/symptom/device terms.
5. **Clinical & regulatory guidance** - a local RAG layer over MedlinePlus health topics, ONC SAFER Guides, and USCDI data classes (embedded once with Ollama's `nomic-embed-text`, retrieved by cosine similarity) surfaces relevant guideline excerpts. AAMI/IEEE/ISO/ASME standards are copyrighted, so they're only ever surfaced as a static named-reference list ("verify against ISO 14971...") - their text is never fetched or stored.
6. **Grounded proposal** - a final Ollama call reasons only over the retrieved subgraph, papers, and guideline excerpts, explicitly maps user-mentioned symptoms to graph phenotypes (or says plainly when there's no direct edge), and produces a reasoning-only wearable/monitoring proposal.

The New Design page renders each of these as its own panel: Knowledge Graph Grounding, Literature Evidence, Clinical & Regulatory Guidance, and Proposed Direction.

## Setup (web)

Requires **Node >= 22.5** (for the built-in `node:sqlite` module) and a local [Ollama](https://ollama.com) install.

```bash
# Pull the models the pipeline uses
ollama pull llama3.2
ollama pull nomic-embed-text
```

Create a `.env` file at the repo root (`smart-health-ui/.env`, already gitignored) with a Semantic Scholar API key:

```
S2_API = your-semantic-scholar-key
```

Build the two local data stores once (both write into the gitignored `web/data/`):

```bash
cd web
pnpm install

# Downloads the PrimeKG CSVs from Harvard Dataverse first (nodes.csv, edges.csv),
# then run (defaults to ~/Downloads/dataverse_files, override with PRIMEKG_SRC=<dir>):
pnpm run build:kg

# Downloads + embeds MedlinePlus, ONC SAFER Guides, and USCDI (~4-5k chunks,
# a few minutes one-time since it calls Ollama's embedding endpoint per chunk):
pnpm run build:guidelines
```

## Run Web

```bash
cd web
pnpm install
pnpm dev
```

## Run Mobile

```bash
cd mobile
pnpm install
pnpm start
```
