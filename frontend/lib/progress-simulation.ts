// Neither a real bill upload (once the request body finishes sending) nor the demo endpoint
// gives any mid-request signal for the server-side work that follows - actual bill parsing
// runs the real vision model (60-180s+, see backend/app/services/bill_parser_service.py),
// which has no progress API to report against, only the byte transfer beforehand does. This
// creeps a reported percentage toward `cap` for as long as it's running, so an upload button
// doesn't look frozen during that wait - the caller reports 100% itself once the real response
// actually arrives. Shared by lib/api.ts's real uploadBills and lib/demo/demo-upload.ts's
// demoUploadBills rather than each keeping its own copy of the same timer logic.
export function startProgressSimulation(
  onProgress: (percent: number) => void,
  {
    from = 0,
    cap = 90,
    stepPercent = 3,
    intervalMs = 3000,
  }: {
    from?: number;
    cap?: number;
    stepPercent?: number;
    intervalMs?: number;
  } = {},
): () => void {
  let percent = from;
  onProgress(percent);
  const interval = setInterval(() => {
    percent = Math.min(percent + stepPercent, cap);
    onProgress(percent);
  }, intervalMs);
  return () => clearInterval(interval);
}
