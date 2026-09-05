// Neither a real bill upload (once the request body finishes sending) nor the demo endpoint
// gives any mid-request signal for the server-side work that follows - actual bill parsing
// runs the real vision model, which has no progress API to report against, only the byte
// transfer beforehand does. This creeps a reported percentage toward `cap` for as long as it's
// running, so an upload button doesn't look frozen during that wait - the caller reports 100%
// itself once the real response actually arrives. Shared by lib/api.ts's real uploadBills and
// lib/demo/demo-upload.ts's demoUploadBills rather than each keeping its own copy of the same
// timer logic.

// Real, live-measured average wall-clock time for a bill to finish parsing (both PARSER_MODEL
// and RETRY_MODEL, after reasoning was disabled across every agent - see that change's commit
// for the 15.7s/17.6s samples this is based on). The target duration both callers below pace
// their simulated creep against, so the bar's pace reflects real-world timing instead of an
// arbitrary guess - update this if the real average measurably drifts.
export const AVERAGE_PARSE_DURATION_MS = 68_000;

// Paced by duration + tick count, not a fixed step/interval: a fixed step/interval reaches very
// different real times depending on how many percentage points `[from, cap]` actually spans -
// e.g. the real upload's post-byte-upload creep only covers 90->99 (9 points) while the demo
// upload's covers 0->90 (90 points), so sharing one step/interval pair made one of the two
// finish 10x faster than the other and sit frozen at `cap` for most of the real wait. Deriving
// both from the same target duration makes each call site's own span reach its own cap at
// roughly the same real elapsed time, regardless of how many points that span covers.
export function startProgressSimulation(
  onProgress: (percent: number) => void,
  {
    from = 0,
    cap = 90,
    durationMs = AVERAGE_PARSE_DURATION_MS,
    ticks = 24,
  }: { from?: number; cap?: number; durationMs?: number; ticks?: number } = {},
): () => void {
  const stepPercent = (cap - from) / ticks;
  const intervalMs = durationMs / ticks;

  let percent = from;
  onProgress(Math.round(percent));
  const interval = setInterval(() => {
    percent = Math.min(percent + stepPercent, cap);
    onProgress(Math.round(percent));
  }, intervalMs);
  return () => clearInterval(interval);
}
