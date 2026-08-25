# FinanceIQ

## Project identity

FinanceIQ is a multi-tenant bill-tracking app where a system of agents decides — case by case — how to parse, categorize, and audit each bill, asking the user directly whenever it isn't confident, instead of following one fixed script. It is **not** a fixed pipeline (`upload → parse → categorize → audit → store`, always in that order, always automatic).

Any change that removes a decision point and replaces it with hardcoded sequencing is a regression, regardless of whether tests pass.

## Non-negotiables

1. No database query runs without a `user_id` scope. Ever.
2. Every agent returns `{result, confidence, reasoning}` — never a bare result.
3. When confidence is low, retry with a _different_ approach — not the same call again.
4. When still uncertain after retry, ask the user. Never guess silently, never fail silently.
5. Retries are capped at 2.

## Tech stack

Python 3.11+, `uv` for deps, FastAPI, SQLAlchemy 2.0 (async) + Alembic, Postgres with row-level security, pydantic-settings, structlog, pytest, ruff, Docker Compose.

## Conventions

- Formatting and linting is `ruff` — don't hand-format.
- Structured logging via `structlog`, never bare `print`.
- Config comes from `app/config.py` (pydantic-settings), never `os.getenv` scattered in code.
- Type hints required on all function signatures.
- Tests live in `/tests`, mirroring the `app/` structure.

## Vocabulary

- **Bill** — one uploaded document belonging to one user.
- **Decision point** — a place where an agent assesses confidence and branches.
- **Elicitation** — pausing to ask the user a question, then resuming.
- **Flagged** — surfaced for human attention, distinct from _pending_ (awaiting an elicitation answer).

## Build phases

Full detail and Definition-of-Done for each phase lives in `roadmap.md` — this is just the map. Don't skip ahead: each phase's DoD must actually be true before the next one starts.

0. **Scaffolding** ✅ Done — runnable skeleton: `uv`, Docker Compose (api+db+adminer), ruff, pre-commit, CI, `/health` with a real DB check.
1. **Auth and data model** ✅ Done — all 7 entities from the ERD, JWT auth, Postgres row-level security (enforced via a dedicated non-superuser role, not just policies), automated cross-user isolation test at the database level.
2. **Upload, agentic parser, confidence, and retry** — merges what were originally three separate phases (plain-function parser → add confidence → add retry): `notebooks/billsense_agent.ipynb` validated that an agentic parser with `{result, confidence, reasoning}` built in from the start is barely more work than a "plain" one, so build them together. Parser is an `app/services/` function calling `claude_agent_sdk.query()` directly (not a `.claude/agents/*.md` file — see `roadmap.md` Part 4). Retry = escalate to a stronger model (Haiku → Sonnet), capped at 2, not the same call repeated.
3. **Elicitation: ask the user** — MCP server with elicitation; real pause/resume (no restart); `clarify.html` for pending questions. The branch that makes this agentic, not automated-with-a-fallback. The decision _logic_ is already validated in the notebook above — this phase builds the real pause/resume transport, not the logic.
4. **Categorizer and auditor** — same loop reused for two more agents; decision loop refactored into one shared function called by all three.
5. **Dashboard and demo seeding** — recruiter-facing dashboard; seeded demo account with deliberately ambiguous bills so elicitation visibly triggers.
6. **Deploy and package** — hosted demo, case study, README reordered outcome-first.

Optional **Phase E — OpenRouter experiment**: time-boxed, only after phases 0-6 are done and working on Claude, on a separate branch.

**If time runs short: cut phase 5's chart or phase 6's polish before ever cutting phase 3.** Phases 0-2 produce a working app that already does some deciding (confidence + retry) but still fails non-negotiable #4 the moment it gives up quietly instead of asking. Phase 3 (elicitation) is what closes that gap and is the one phase that can't be cut.
