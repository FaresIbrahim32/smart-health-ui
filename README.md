# Smart Health UI

Smart Health by Design is a local web prototype for human-in-the-loop biomedical product ideation and CAD/spec exploration.

The main working app is in `web/`:

- Vite + React frontend
- Local Node API
- Local SQLite auth/session database
- Local PrimeKG and guideline retrieval stores
- Ollama-powered prompt rewriting, extraction, ideation, and refinement
- Three.js/JSCAD CAD fallback and STL export, with optional CadQuery STL export
- Blender-rendered PNG previews and downloadable Blender GLB assets
- Persistent professional profile fields stored with the local account

The `mobile/` folder is an older Expo sample and is not the current primary prototype.

## Current Workflow

After login, the web app now uses a staged workflow:

1. **Design Target** - pick `CAD Design`, `Mobile App Design`, or `Both CAD & Mobile App`.
2. **Workflow Depth** - choose `Typical Flow`, `Phase 1 Only`, or `Phase 2 Only`.
3. **Prompt Page** - choose the prompt author/viewpoint, upload optional PDFs/manuals/reports, and enter the prompt.
4. **Architecture** - Phase 1 returns concept cards only: 3D concept previews, evidence strength, scores, trade-offs, and a recommended option.
5. **Evidence** - separate page for PrimeKG grounding, literature, clinical guidance, standards references, definitions, phenotypes, genes/proteins, and viewpoint-specific evidence depth.
6. **Previous Solutions** - separate page for similar/prior public solution notes and papers.
7. **History** - stores generated versions and refinements.
8. **RAG Exploration** - available after accepting a concept.
9. **CAD Workspace** - shows text-first engineering specs, constraints, impact values, generated layers/components, standards references, 3D preview, STL download, and external `.stl` upload/inspection.
10. **My Profile** - open the upper-right account avatar to edit affiliation, occupation, bio, Google Scholar, GitHub, website, and LinkedIn links.

The upper-right theme control cycles through the three available themes: the original navy theme, the dark black theme, and the light theme.

## Phase 1

Phase 1 is evidence-grounded ideation.

It supports these prompt author modes:

- Everyday user
- Caregiver
- Engineer
- Doctor
- Researcher
- Regulatory reviewer

The pipeline:

1. Ollama rewrites the user prompt into an engineering retrieval prompt.
2. Ollama extracts disease/condition, symptom/function, and device intent.
3. PubTator suggests disease/entity candidates.
4. PrimeKG fuzzy matching finds the best graph disease node when possible.
5. PrimeKG retrieves phenotypes, genes/proteins, and related anatomy.
6. Semantic Scholar and Europe PMC search for literature.
7. A generic relevance profile filters papers using condition, symptom/function, device intent, and prompt context. This avoids hardcoded disease-specific rejection rules.
8. The local guideline RAG store retrieves MedlinePlus, ONC SAFER Guides, and USCDI chunks.
9. Uploaded PDFs/manuals/reports are parsed as supplemental context.
10. Ollama generates multiple concept options with scores and trade-offs.

Raw evidence is hidden from the Architecture page until the user opens the Evidence page. Previous/similar solutions are also on their own page.

### Previous-solution knowledge graph

The app builds a local solution graph from retrieved papers, guideline records, uploaded documents, and the current prompt. It links conditions to prior device families, form factors, sensors, outcomes, anatomy, and source records. This graph is used to ground generic device proposals in relevant precedent without maintaining a hardcoded list of every disease or device.

## Phase 2 Only

Phase 2-only mode is for direct engineering/CAD requests that may not have a disease or biological evidence anchor.

Example:

```text
Generate a knee sleeve CAD concept for a 5'10 adult around 180 lb, soft breathable material, adjustable compression, easy to clean, no biological evidence needed.
```

In this mode:

- PrimeKG/literature/guideline grounding is skipped unless the prompt itself provides clinical context.
- The app focuses on object form, comfort, fit, sizing, weight, cleaning, adjustability, materials, constraints, and standards references.
- Sensors, PCB, battery, alerts, and connectivity are only added when the prompt implies a smart/electronic device.
- The generated result opens directly into CAD Workspace.

## CAD Generation

The CAD Workspace has two source modes:

- **Generated Specs** - accepts the selected concept, shows engineering specs first, then creates the preview after human approval.
- **Upload STL** - loads a user-provided STL for browser inspection with mouse rotation and zoom.

The generated preview pipeline is:

1. Blender receives the structured device layout and builds a procedural form-specific model.
2. Blender renders a PNG preview with its own camera, lights, materials, shell geometry, support features, and component layers.
3. The UI displays that Blender-rendered image and exposes a GLB download.
4. JSCAD remains available as a browser-side fallback and for deterministic STL geometry.

Blender is detected at `/Applications/Blender.app/Contents/MacOS/Blender` by default. Override it with `BLENDER_BIN` when using another installation:

```env
BLENDER_BIN=/path/to/Blender
```

Blender form families currently include bottles/cups, helmets/headgear, sleeves/textiles/casts, wristbands/belts/rings, gloves, insoles, swords, and an adaptive fallback. The generator is procedural: the model uses the requested form factor and component list rather than relying on one fixed device shape.

## Accounts

Accounts are local to this project.

- Auth database: `web/data/auth.sqlite`
- Passwords: salted PBKDF2 hashes
- Browser sessions: local session token storage

If you sign up, your account is saved locally on this machine for this project.

The profile page uses the same SQLite user record and stores optional professional metadata:

- affiliation
- occupation
- short bio
- Google Scholar URL
- GitHub URL
- website URL
- LinkedIn URL

Profile links must use `http://` or `https://` and are not sent to the retrieval providers.

## Requirements

- Node.js `>= 22.5`
- pnpm
- Ollama running locally

Pull the Ollama models:

```bash
ollama pull gemma3:4b
ollama pull nomic-embed-text
```

The app reads `.env` from the repo root. Recommended `.env`:

```env
OLLAMA_MODEL=gemma3:4b
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_CHAT_TIMEOUT_MS=90000

# Optional but recommended. The code also accepts S2_API_KEY.
S2_API=your-semantic-scholar-key
```

Europe PMC does not require an API key.

## First-Time Setup

Install dependencies:

```bash
cd /Users/Fares/Desktop/shield/smart-health-ui
pnpm --dir web install
```

Build the local evidence stores:

```bash
cd /Users/Fares/Desktop/shield/smart-health-ui/web

# PrimeKG local SQLite database.
# Put PrimeKG nodes.csv and edges.csv in ~/Downloads/dataverse_files,
# or set PRIMEKG_SRC=/path/to/dataverse_files.
pnpm run build:kg

# Local guideline/RAG database.
# This calls Ollama embeddings and can take a few minutes.
pnpm run build:guidelines
```

The generated databases live in `web/data/`, which is gitignored.

## Run From VS Code Terminal

Use two terminals. This is the most reliable setup.

Terminal 1, backend API:

```bash
cd /Users/Fares/Desktop/shield/smart-health-ui/web
node server.js
```

Terminal 2, frontend:

```bash
cd /Users/Fares/Desktop/shield/smart-health-ui/web
./node_modules/.bin/vite --host 127.0.0.1
```

Open:

```text
http://127.0.0.1:5173
```

If port `3001` is already in use:

```bash
lsof -ti :3001 | xargs kill
node server.js
```

If port `5173` is already in use, Vite will usually choose the next available port and print it in the terminal.

## Optional Single Command

There is also a combined script:

```bash
cd /Users/Fares/Desktop/shield/smart-health-ui
pnpm --dir web dev
```

If this has problems in VS Code or leaves the API running, use the two-terminal method above.

## Build Check

```bash
cd /Users/Fares/Desktop/shield/smart-health-ui/web
./node_modules/.bin/vite build
node --check server.js
git diff --check
```

Check the running API:

```bash
curl http://127.0.0.1:3001/api/health
```

The health response reports the active Ollama model and whether the local PrimeKG store is available.

## Optional CadQuery STL Export

The browser preview uses deterministic JSCAD. STL download first tries the optional CadQuery backend route and falls back to JSCAD if CadQuery is unavailable.

To enable CadQuery:

```bash
cd /Users/Fares/Desktop/shield/smart-health-ui/web
python3 -m pip install -r requirements-cadquery.txt
```

## Mobile Sample

The mobile sample is still available, but it is not the active prototype path:

```bash
cd /Users/Fares/Desktop/shield/smart-health-ui/mobile
pnpm install
pnpm start
```
