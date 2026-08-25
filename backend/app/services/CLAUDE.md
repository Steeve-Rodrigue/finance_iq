# app/services/ conventions

- Services contain business logic; routers contain no logic beyond validation and delegation.
- Services never touch the database directly - they call repos.
- Services own confidence handling: interpreting scores, triggering retry, raising elicitation.
- Elicitation state must be persisted before pausing, so a restart doesn't lose an in-flight bill.

## The agent output contract

Every decision-point agent (parser, categorizer, and eventually the auditor) returns:

```json
{ "result": {}, "confidence": 0.0, "reasoning": "why this confidence level" }
```

In practice `result`'s fields are flattened directly into the returned dict alongside
`confidence`/`reasoning` (see `bill_parser_service.call_parser`'s and
`categorizer_service.call_categorizer`'s actual return shape) rather than nested under a
literal `"result"` key - the schema above is the _contract_, not a literal wire format to copy.

## The decision loop is one shared function

`app/services/decision_loop.py::run(attempt_first, attempt_retry, ...)` is called by every
agent - if a change would require copy-pasting the accept/retry/give-up branching, that's the
wrong change, extend the shared function instead. What "a different approach" means for the
retry attempt is entirely up to the caller:

- **Parser** (`bill_parser_service.py`): escalate to a stronger model (`PARSER_MODEL` →
  `RETRY_MODEL`), same input.
- **Categorizer** (`categorizer_service.py`): re-prompt the _same_ model tier with an added
  signal - this vendor's own past categorization history - not a stronger model.
- **Auditor** (not built yet): expected to follow the same shape once it exists.

Confidence thresholds are **not** shared globally - each agent sets its own
`HIGH_CONFIDENCE_THRESHOLD`/`LOW_CONFIDENCE_FLOOR` module constants and passes them into
`decision_loop.run` explicitly. They're provisional per agent, tuned against real samples, not
one-size-fits-all (see `.claude/skills/confidence-rubric/SKILL.md` for the parser's).

## Elicitation: one flow, dispatched by stage

When an agent can't resolve confidently even after retry, it persists a real `Elicitation` row
(`stage`, `question`, `context={"partial_result": ...}`) instead of guessing or failing
silently (non-negotiable #4), and flags the bill (`bills.status = FLAGGED`) so it surfaces
wherever "flagged bills have a pending answer waiting" is assumed (e.g. `clarify.html`).

The user answers in **plain text**, not JSON - `app/services/elicitation_answers.py`'s
`parse_elicitation_answer` (one shared OpenRouter call, not owned by any one agent) turns that
into structured field corrections, which get merged into the stage's own `partial_result`
(human's values win) and persisted through that stage's normal persistence function.

`app/routers/elicitations.py`'s `answer_elicitation` dispatches to the right agent's resume
function by `elicitation.stage` (`_RESUME_BY_STAGE`) - each agent owns its own
`resume_*_from_elicitation_answer`, since each stage merges into and persists different data,
but all of them:

1. Do a fast-path `status != PENDING` check first (cheap rejection, saves an LLM call on the
   common sequential "already answered" case).
2. Call `elicitations_service.claim_pending_elicitation` - an **atomic** `UPDATE ... WHERE
status = 'pending'`, not a read-then-write - immediately before persisting anything. This is
   the actual concurrency guard: two concurrent/retried answer submissions for the same
   elicitation must not both persist (that would duplicate line items), and a plain status
   check can't prevent that since both requests could pass it before either writes.
3. Persist, then reset `bills.status` back to `PENDING` (un-flagging), inside the stage's own
   `persist_*_result` function so callers can't forget it.

Real pause/resume, not a same-process fallback: nothing in the resume path depends on the
original request that created the elicitation still being alive - the state it needs lives
entirely in Postgres (the `Elicitation` row), so resuming can happen in a separate request,
hours or days later, after a server restart.

## Chaining stages

A resolved parse doesn't stop at "parsed" - `bill_parser_service.parse_and_persist_bill` (and
its elicitation-resume counterpart) call `categorizer_service.categorize_and_persist_bill`
immediately afterward, continuing the pipeline automatically rather than requiring a separate
manually-triggered step per stage. Each stage's own persistence function
(`persist_bill_result`, `persist_categorization_result`) sets `bills.current_stage` to the
_next_ stage on success (`CATEGORIZING`, `AUDITING`) - that's what the next stage's entry
point picks up from, not a separate "what stage are we in" branch.

## Shared LLM plumbing

`app/services/llm_client.py` owns the one `AsyncOpenAI` client (pointed at OpenRouter) and
`extract_json` (the find-`{`-to-`}`-and-parse-with-a-clear-error-on-failure helper) - every
agent's own `call_*` function uses these rather than constructing its own client or duplicating
JSON extraction. A malformed/unparseable model response is caught by a `_call_*_safe` wrapper
per agent and degraded to `confidence=0.0` (triggering the normal retry/elicit path) rather
than crashing `decision_loop.run` on the first attempt before the retry ever gets a chance -
see `bill_parser_service._call_parser_safe` / `categorizer_service._call_categorizer_safe`.
