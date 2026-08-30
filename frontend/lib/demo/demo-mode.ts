// Sentinel stored in the same localStorage slot a real JWT would occupy (see lib/auth.ts) -
// this lets every existing auth-gated code path (dashboard/layout.tsx, the sidebar's upload
// button, etc.) work completely unmodified: they already do `const token = getToken(); if
// (!token) return;` and pass the string straight into lib/api.ts calls. Those calls funnel
// through request()'s one demo branch (see lib/api.ts), which is the only place that needs to
// recognize this value.
export const DEMO_TOKEN = "__financeiq_demo__";

export function isDemoToken(token: string | null | undefined): boolean {
  return token === DEMO_TOKEN;
}
