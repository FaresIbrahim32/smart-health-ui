# Smart Health UI

This project includes two implementations of the Smart Health by Design UI:

- `web/` - Vite + React web app
- `mobile/` - Expo + React Native mobile app

The `web/` app is now the main working prototype. It includes local account auth, an evidence-grounded design-search pipeline, iterative design refinement, audience-specific result views, dynamic RAG/CAD pages, export tools, shadcn-style light/dark theming, and real STL/CAD preview support. The `mobile/` app remains the original Expo UI sample.

## Latest web workflow

1. **Landing + account flow** - users start on a landing page with sign up / log in. Accounts are stored locally in `web/data/auth.sqlite` with salted PBKDF2 password hashes; browser sessions are restored with a local session token.
2. **New Design** - users enter a clinical/product design prompt. The app retrieves biomedical evidence, generates a proposal, and creates a CAD component layout.
3. **Architecture** - the generated output appears on a separate architecture page only after retrieval, reasoning, and CAD layout generation finish.
4. **Iterative refinement** - if the user does not like the design, they can submit follow-up prompts such as "make it less bulky" or "adapt this for diabetes caregiver alerts." The backend sends the previous proposal, CAD layout, and retrieved evidence back to the LLM for revision.
5. **Accept design** - RAG Exploration and CAD Workspace stay locked until the user accepts a generated draft with **I Like This Design**.
6. **RAG Exploration + CAD Workspace** - after acceptance, these pages render the accepted design's actual evidence, layers, components, and CAD rationale instead of static sample content.
7. **Export** - the top nav export panel can share/download a Markdown report, JSON data package, and generated STL. The export includes cited papers, definitions, phenotypes, genes/proteins, anatomy, clinical guidance, standards references, proposal text, warnings, and CAD details.

The web UI uses shadcn-inspired design tokens with a persisted dark/light theme toggle in the top bar.

## Result views

The Architecture page supports two user modes:

- **Common user** - shows the final CAD concept, a plain-language summary, common disease/terminology explanations, expandable clinical guidance, and a human-review note. Detailed biomedical evidence is hidden by default.
- **Professional** - reveals the full technical proposal, PrimeKG grounding, cited papers, definitions, genes/proteins, phenotypes/anatomy, clinical guidance, standards references, and similar/previous solutions. Long text is rendered in expandable rows with source links preserved.

## CAD behavior

Generated CAD previews are no longer forced into a bracelet shape. The backend asks the LLM for a broad `formFactor`, approximate dimensions, component placement hints, and evidence-linked parts. The browser still uses deterministic JSCAD for the live preview, while STL downloads first try the stronger optional CadQuery backend generator and fall back to JSCAD if CadQuery is not installed.

- `wristband`
- `mouthguard`
- `cast`
- `patch`
- `handheld`
- `clip-on`

The CAD Workspace can also upload and inspect arbitrary `.stl` files with a Three.js STL viewer.

To enable stronger CadQuery STL exports:

```bash
cd web
python3 -m pip install -r requirements-cadquery.txt
pnpm dev
```

## New Design page: the design-search pipeline

Submitting a prompt on the New Design page (e.g. *"Design a non-invasive wearable system for continuously monitoring shortness of breath in patients with Cystic Fibrosis."*) runs a multi-step pipeline (`POST /api/design-search` in `web/server.js`) before any reasoning happens, so the final proposal is grounded in retrieved evidence instead of the model inventing clinical context:

1. **Entity extraction** - Ollama pulls `{disease, symptomPhrase, deviceIntent}` out of the free-text prompt.
2. **Synonym resolution** - the extracted disease name is passed through NCBI's PubTator3 autocomplete API to resolve aliases/typos (e.g. "mucoviscidosis") to their canonical MeSH/MONDO term before graph lookup.
3. **Knowledge-graph grounding** - the canonical disease name is matched against [PrimeKG](https://github.com/mims-harvard/PrimeKG) (129K nodes / 8.1M edges, indexed locally in SQLite), and the pipeline traverses real `disease_phenotype_positive`, `disease_protein`, and `anatomy_protein_present` edges to pull an evidence subgraph (phenotypes, genes/proteins, related anatomy).
4. **Literature search** - Semantic Scholar is queried (rate-limited to the API's 1 req/sec) using the disease/symptom/device terms.
5. **Clinical & regulatory guidance** - a local RAG layer over MedlinePlus health topics, ONC SAFER Guides, and USCDI data classes (embedded once with Ollama's `nomic-embed-text`, retrieved by cosine similarity) surfaces relevant guideline excerpts. AAMI/IEEE/ISO/ASME standards are copyrighted, so they're only ever surfaced as a static named-reference list ("verify against ISO 14971...") - their text is never fetched or stored.
6. **Grounded proposal** - a final Ollama call reasons only over the retrieved subgraph, papers, and guideline excerpts, explicitly maps user-mentioned symptoms to graph phenotypes (or says plainly when there's no direct edge), and produces a reasoning-only wearable/monitoring proposal.

The design-search result is used by the Architecture, RAG Exploration, CAD Workspace, and Export flows.

## Iterative refinement API

`POST /api/design-refine` accepts a follow-up prompt plus the previous design result. It reuses the prior evidence blocks and asks Ollama to revise the proposal and CAD layout while staying grounded in the retrieved sources.

The accepted design is separate from the current draft: users can refine repeatedly, and RAG/CAD pages update only after the user accepts the version they like.

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

Build the two local evidence stores once (both write into the gitignored `web/data/`):

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

The local auth database is created automatically at `web/data/auth.sqlite` when the web API starts.

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
