# FinanceIQ

> Most expense trackers guess silently and get things wrong. This one knows when it doesn't know — and asks.

A multi-tenant web app where each user uploads their own bills, and a system of agents decides — case by case — how to parse, categorize and audit them, asking the user directly whenever it isn't confident, instead of following one fixed script.

**Status:** Phase 0 (scaffolding) and Phase 1 (auth + data model) are done — JWT auth, all 7 entities, Postgres row-level security enforced through a dedicated non-superuser role, migrations, and an automated cross-user isolation test. Phase 2 (upload + agentic parser + confidence + retry) is next; the parsing approach is already prototyped in [`notebooks/billsense_agent.ipynb`](./notebooks/billsense_agent.ipynb). This README will be reordered to lead with a screenshot and live demo link once Phase 3 (elicitation) lands — see [Part 7 of the roadmap](./roadmap.md#part-7--portfolio-packaging).

**Working name:** BillSense (placeholder).

---

## Why this isn't just an ETL script

A fixed pipeline looks like this:

```
upload → parse → categorize → audit → store
```

Always the same order, always fully automatic, every exception hardcoded in advance. FinanceIQ replaces that with a **decision loop**, reused at three points (parsing, categorizing, auditing):

```
reach a decision point → agent assesses its own confidence
   ├─ high confidence  → act automatically
   ├─ low confidence   → retry with a DIFFERENT approach → reassess
   └─ still uncertain  → ask the user (elicitation) → pause → resume on reply
```

Example: an ambiguous charge like `SQ *MARKET77` doesn't get silently miscategorized — the system asks _"I see a $34 charge from 'SQ \*MARKET77' — is this groceries, or something else?"_ and remembers the answer for that vendor going forward.

Full rationale, including the two objections this design resolves (privacy, "is it really agentic?"), is in [Part 1](./roadmap.md#part-1--what-this-is) and [Part 2](./roadmap.md#part-2--the-core-decision-loop-not-pipeline) of the roadmap.

---

## Tech stack

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2.0 (async) + Alembic, `uv` for dependency management
- **Database:** Postgres, row-level security enforced through a dedicated non-superuser app role (not just policies — the default role Postgres creates is a superuser, which would bypass RLS entirely)
- **Agents:** Claude Agent SDK, called directly from `app/services/` — not Claude Code subagent files, which in this repo are build-tooling used to construct FinanceIQ itself, not part of its runtime. MCP for tool access and elicitation (Phase 3)
- **Tooling:** pytest, ruff, structlog, Docker Compose, GitHub Actions CI

Full technical decisions and reasoning are in [Part 3](./roadmap.md#part-3--technical-decisions-already-made) of the roadmap.

---

## Planned repo structure

```
├── .claude/            # CLAUDE.md hierarchy, skills, and build-tooling agents (not app runtime)
├── mcp-servers/        # finance-data-server — user-scoped tools, elicitation
├── app/                # FastAPI backend: routers, models, schemas, services (incl. the
│                       # parser/categorizer/auditor "agents" themselves), repos, migrations
├── tests/
├── frontend/           # upload, dashboard, and clarify (elicitation) views
├── demo/               # seeded demo account with deliberately ambiguous bills
├── notebooks/          # exploration notebooks, e.g. the Phase 2 parser prototype
└── docs/               # architecture notes, ADRs, exam notes
```

See [Part 4](./roadmap.md#part-4--repo-structure) for the full layout with per-file responsibilities.

---

## Non-negotiables

1. No database query runs without a `user_id` scope. Ever.
2. Every agent returns `{result, confidence, reasoning}` — never a bare result.
3. When confidence is low, retry with a _different_ approach — not the same call again.
4. When still uncertain after retry, ask the user. Never guess silently, never fail silently.
5. Retries are capped at 2.

---

## Build plan

The project is built in 7 phases (0–6), plus an optional OpenRouter experiment (Phase E), totaling roughly 13–17 remaining evenings of part-time work (Phases 0-1 already done). The phase that makes this project _agentic_ rather than "automated with a fallback error state" is:

- **Phase 3 — elicitation:** an ambiguous bill triggers a real question in the UI, the user answers — even after closing and reopening the browser — and the bill completes with no restart.

Phase 2 (upload, parser, confidence, retry) already introduces real decision-making — a bill that reads low-confidence on the first pass gets a genuine retry via a stronger model, not a hand-tuned prompt. But an agent that retries once and then quietly gives up on low confidence still isn't the full pattern: Phase 3 is what stops it from failing silently.

See [Part 5](./roadmap.md#part-5--build-phases) for the full phase-by-phase breakdown with definitions of done, and [Part 8](./roadmap.md#part-8--the-one-thing-not-to-lose) for why Phase 3 must never be cut.

---

## License

Apache 2.0 — see [LICENSE](./LICENSE).
