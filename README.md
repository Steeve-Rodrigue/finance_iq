# FinanceIQ

> Most expense trackers guess silently and get things wrong. This one knows when it doesn't know — and asks.

A multi-tenant web app where each user uploads their own bills, and a system of agents decides — case by case — how to parse, categorize, and sub-categorize them, asking the user directly whenever it isn't confident, instead of following one fixed script.

**Live:** frontend on Vercel, backend on Render, Postgres on Neon (all free tier — see [Deployment](#deployment)). Render's free tier sleeps after 15 minutes idle, so the first request after a while can take ~30s to wake up.

**Status:** auth, data model, upload, the parser and categorizer agents, elicitation (ask-the-user), a batch sub-categorizer, the full analytics dashboard, a client-side demo mode, and deployment are all built and live. A planned third pipeline agent — the auditor — was cut; categorizing is now the pipeline's last step, and a resolved bill goes straight to `complete`/`resolved` (the `auditing` stage name still exists in code but nothing sets it anymore).

---

## Why this isn't just an ETL script

A fixed pipeline looks like this:

```
upload → parse → categorize → elicit → store
```

Always the same order, always fully automatic, every exception hardcoded in advance. FinanceIQ replaces that with a **decision loop**, reused by every agent (`app/services/decision_loop.py`):

```
reach a decision point → agent assesses its own confidence
   ├─ high confidence  → act automatically
   ├─ low confidence   → retry with a DIFFERENT approach → reassess
   └─ still uncertain  → ask the user (elicitation) → pause → resume on reply
```

"A different approach" is chosen by the caller, not the loop: the parser escalates to a stronger model; the categorizer re-prompts the same model tier with an added signal (the vendor's own past categorization history). Both share the exact same accept/retry/give-up branching in one function — no agent copy-pastes it.

Example: an ambiguous charge doesn't get silently miscategorized — after a retry still can't resolve it, the system creates a real question in the **Elicitations** dashboard page, the user answers in plain text whenever they get to it (even after closing the browser, even days later), and the bill resumes from exactly where it paused.

---

## How it actually works

No Claude Agent SDK, no MCP server — an earlier design iteration planned both, but the app ended up simpler: every agent is a plain `app/services/` function that calls an LLM through [OpenRouter](https://openrouter.ai)'s OpenAI-compatible API via the standard `openai` Python client (`app/services/llm_client.py`), and asks for strict JSON back.

- **Parser** (`bill_parser_service.py`) — extracts vendor, dates, amounts, and line items directly from the bill's rendered page images (`pdf2image`), sent to a vision-capable model — no local text/OCR extraction step. Retries by escalating from a cheap model to a stronger one.
- **Categorizer** (`categorizer_service.py`) — assigns the bill to one of the user's own categories (creating one if needed), seeded with a suggested taxonomy. Retries with the vendor's categorization history added as context.
- **Sub-categorizer** (`subcategorizer_service.py`) — a batch job, not a per-bill pipeline stage: splits each category's line items into sub-categories (and, where warranted, a second level) purely from reading the items. It can't hang a question on one bill the way the other two agents do, since it works across many bills at once — an unresolved category routes its items to a catch-all "Autre" sub-category instead, honoring the spirit of "never guess silently" without a literal elicitation.

Every agent returns `confidence` and `reasoning` alongside its result (non-negotiable #2 below), and each sets its own high/low confidence thresholds tuned independently rather than sharing one global cutoff.

**Elicitation** is plain REST + Postgres, not an MCP transport: an unresolved bill gets a real `Elicitation` row and is flagged; the answer arrives as ordinary plain text through the dashboard's Elicitations page, gets turned into structured field corrections by one more OpenRouter call (`elicitation_answers.py`), and merges into the bill via an atomic claim (so a duplicate submission can't double-apply it). Nothing about resuming depends on the original request still being alive — the state lives entirely in the database, so it can resume in a separate request, hours or days later, after a server restart.

---

## Non-negotiables

1. No database query runs without a `user_id` scope. Ever — enforced by Postgres row-level security through a dedicated non-superuser app role, not just application code.
2. Every agent returns `{result, confidence, reasoning}` — never a bare result.
3. When confidence is low, retry with a _different_ approach — not the same call again.
4. When still uncertain after retry, ask the user. Never guess silently, never fail silently.
5. Retries are capped at 2 (one first attempt, one retry).

---

## Dashboard

- **Overview** — total spend with month-over-month delta, bills processed, pending elicitations, auto-resolved rate, spending trend, top vendors, spending by category
- **Spend Analytics** — filterable trends, category/vendor evolution, a calendar heatmap, bill-size distribution, recurring-bill and outlier detection, month-over-month comparisons
- **Categories** — spend and bill count by category, category evolution, uncategorized/"Other" rate over time, full CRUD
- **Vendors** — top vendors by spend and frequency, vendor concentration, per-vendor drill-down with its own spending trend and bill history
- **Agent Insights** — confidence trend, confidence by category, extraction-strategy effectiveness
- **Elicitations** — pending/answered/expired questions, answer directly from the list
- **Bills Explorer** — filterable, sortable table with inline editing and upload
- **Line Items** — most-purchased items, spend by item, unit-price trends, sub-category drill-down

A **demo mode** (`/demo`) lets a visitor pick from a seeded mock dataset without signing up — implemented client-side (`frontend/lib/demo/`) by intercepting API calls, rather than a real seeded backend account.

---

## Tech stack

**Backend:** Python 3.11+, `uv`, FastAPI, SQLAlchemy 2.0 (async) + Alembic, Postgres with row-level security, OpenRouter via the `openai` client, `pdf2image` for page rasterization (bills are read directly as images by a vision-capable model), `pydantic-settings`, `structlog`, pytest, ruff.

**Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, ECharts (`echarts-for-react`) for all charts, `react-hook-form` + `zod`, shadcn-style components on `@base-ui/react`, `three`/`@react-three/fiber` for the landing page animation.

**Infra:** Docker Compose (api + web + db + adminer) for local dev, GitHub Actions CI (ruff + pytest against a real Postgres instance), Vercel + Render + Neon for deployment, plus a scheduled GitHub Actions cron pinging the backend to dodge Render's cold starts.

---

## Repo structure

```
├── backend/
│   ├── app/
│   │   ├── routers/          # HTTP layer only — validation + delegation, no business logic
│   │   ├── services/         # business logic: the parser/categorizer/sub-categorizer agents,
│   │   │                     # decision_loop.py, elicitation handling
│   │   ├── repos/            # the only layer that issues database queries
│   │   ├── models/           # SQLAlchemy models
│   │   ├── schemas/          # Pydantic request/response shapes
│   │   └── migrations/       # Alembic
│   ├── tests/                # mirrors app/
│   └── Dockerfile
├── frontend/
│   ├── app/                  # Next.js routes: dashboard/*, login, signup, demo
│   ├── components/           # dashboard, auth, landing, ui (shadcn-style primitives)
│   └── lib/                  # API client, demo mode, auth, chart theming
├── .claude/                  # CLAUDE.md hierarchy, skills, and build-tooling agents — not
│                             # part of the app's runtime
├── docker-compose.yml
└── deployment.md             # Vercel + Render + Neon setup notes
```

---

## Running locally

```bash
git clone <this repo> && cd FinanceIQ

cp backend/.env.example backend/.env    # set OPENROUTER_API_KEY at minimum — get one at openrouter.ai/keys
cp frontend/.env.example frontend/.env.local

docker compose up -d        # api (:8000), web (:3000, hot-reload), db, adminer (:8080)
docker compose exec api alembic upgrade head
```

`docker-compose.yml` lives at the repo root and builds both `backend/` and `frontend/` — one `docker compose up -d` runs the whole stack, no separate `npm install`/`npm run dev` needed. `make test`/`make lint`/`make format` (Makefile targets, also at the root) run the backend's own test/lint suite via `uv`, `cd`-ing into `backend/` first since that's where `pyproject.toml` lives; `make` alone lists every target.

---

## Deployment

```
Vercel (free)   → Next.js frontend, auto-deploys on push to main
Render (free)   → FastAPI backend (Docker), root directory `backend`
Neon (free)     → Postgres, 512MB
```

See [deployment.md](./deployment.md) for the full setup notes (env vars, CORS config, cold-start tradeoffs).

---

## License

Apache 2.0 — see [LICENSE](./LICENSE).
