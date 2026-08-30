import seed from "@/lib/demo/docs-seed.json";

// Internal "table row" shapes for the demo store - a superset of every *Read type in lib/api.ts
// that this bill/vendor/category/line-item/elicitation resource ever needs across the plain CRUD
// endpoints AND the analytics endpoints. Money/quantity fields stay as JS numbers internally
// (arithmetic is far simpler); demo-router.ts converts to the string-typed API response shapes
// at the boundary, matching how the real backend serializes Decimal columns as strings.
export type DemoCategory = {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
};

export type DemoVendor = {
  id: string;
  user_id: string;
  name: string;
  address: string | null;
  key: string;
  created_at: string;
  updated_at: string;
};

export type DemoBill = {
  id: string;
  category_id: string | null;
  vendor_id: string | null;
  name: string;
  invoice_number: string | null;
  vendor_name_raw: string | null;
  issue_date: string | null;
  due_date: string | null;
  total_amount: number | null;
  subtotal: number | null;
  tax_amount: number | null;
  currency: string | null;
  status: string;
  current_stage: string;
  payment_status: string;
  document_type: string | null;
  confidence: number | null;
  extraction_strategy: string | null;
  reasoning: string | null;
  verified_by_user: boolean;
};

export type DemoLineItem = {
  id: string;
  bill_id: string;
  description: string;
  common_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  line_total: number;
  category_id: string | null;
  subcategory_id: string | null;
  subcategory_name: string | null;
};

export type DemoElicitation = {
  id: string;
  bill_id: string;
  stage: string;
  status: "pending" | "answered" | "expired";
  question: string;
  context: Record<string, unknown>;
  answer: { text: string } | null;
  answered_at: string | null;
};

export type DemoUser = {
  id: string;
  email: string;
  username: string;
  created_at: string;
};

type SeedJson = {
  meta: {
    description: string;
    currency: string;
    demo_user: { email: string; name: string };
  };
  categories: { id: string; name: string; slug: string }[];
  vendors: {
    id: string;
    name: string;
    key: string;
    address: string | null;
  }[];
  bills: {
    id: string;
    name: string;
    vendor_id: string | null;
    category_id: string | null;
    vendor_name_raw: string | null;
    invoice_number: string | null;
    issue_date: string | null;
    due_date: string | null;
    total_amount: number | null;
    subtotal: number | null;
    tax_amount: number | null;
    currency: string;
    status: string;
    current_stage: string;
    payment_status: string;
    document_type: string | null;
    confidence: number;
    extraction_strategy: string;
    reasoning: string;
    verified_by_user: boolean;
  }[];
  line_items: {
    id: string;
    bill_id: string;
    description: string;
    common_name: string | null;
    quantity: number;
    unit_price: number | null;
    line_total: number;
    category_id: string | null;
  }[];
  elicitations: {
    id: string;
    bill_id: string;
    stage: string;
    status: string;
    question: string;
    context: Record<string, unknown>;
    answer: { text: string } | null;
    answered_at: string | null;
  }[];
};

const SEED = seed as SeedJson;

// The seed dataset's bill dates are fixed to whenever docs.json was authored (its latest bill
// is dated 2026-07-22) - without correction, "Total spent this month" and every other
// current-month KPI would read €0 the moment the real calendar moves past that window, making
// the demo look broken rather than just quiet. So every date-bearing field gets shifted by a
// constant number of days, computed once per page load, so the dataset's latest bill always
// lands on today's real date - the whole 6-month shape (and every relative gap between bills,
// due dates, elicitation answers) is preserved, just slid forward or back in time to stay
// current whenever someone actually launches the demo.
function daysBetween(from: Date, to: Date): number {
  const fromUTC = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  );
  const toUTC = Date.UTC(
    to.getUTCFullYear(),
    to.getUTCMonth(),
    to.getUTCDate(),
  );
  return Math.round((toUTC - fromUTC) / 86400000);
}

function shiftDateStr(dateStr: string, offsetDays: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function shiftDateTimeStr(isoStr: string, offsetDays: number): string {
  const d = new Date(isoStr);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString();
}

const LATEST_SEED_ISSUE_DATE = SEED.bills.reduce<string | null>(
  (latest, b) =>
    b.issue_date && (!latest || b.issue_date > latest) ? b.issue_date : latest,
  null,
);

const DATE_OFFSET_DAYS = LATEST_SEED_ISSUE_DATE
  ? daysBetween(new Date(`${LATEST_SEED_ISSUE_DATE}T00:00:00Z`), new Date())
  : 0;

// A fixed anchor timestamp for created_at/updated_at fields the seed JSON doesn't carry
// (CategoryRead/VendorRead require them, but nothing in the dashboard UI sorts or displays by
// them for these two resources - see demo-router.ts's grep-confirmed usage).
const SEED_TIMESTAMP = "2026-01-05T09:00:00Z";

export const DEMO_USER: DemoUser = {
  id: "demo-user",
  email: SEED.meta.demo_user.email,
  username: SEED.meta.demo_user.name,
  created_at: SEED_TIMESTAMP,
};

export const DEMO_CURRENCY = SEED.meta.currency;

// Builds fresh, independent arrays on every call (never returns/shares the SEED literal's own
// objects) so demo-store.ts can reseed from scratch on every "Try the demo" click without any
// separate deep-clone step or risk of a previous session's mutations leaking into the next one.
export function createSeedCategories(): DemoCategory[] {
  return SEED.categories.map((c) => ({
    id: c.id,
    user_id: DEMO_USER.id,
    name: c.name,
    slug: c.slug,
    created_at: SEED_TIMESTAMP,
    updated_at: SEED_TIMESTAMP,
  }));
}

export function createSeedVendors(): DemoVendor[] {
  return SEED.vendors.map((v) => ({
    id: v.id,
    user_id: DEMO_USER.id,
    name: v.name,
    address: v.address,
    key: v.key,
    created_at: SEED_TIMESTAMP,
    updated_at: SEED_TIMESTAMP,
  }));
}

export function createSeedBills(): DemoBill[] {
  return SEED.bills.map((b) => ({
    id: b.id,
    category_id: b.category_id,
    vendor_id: b.vendor_id,
    name: b.name,
    invoice_number: b.invoice_number,
    vendor_name_raw: b.vendor_name_raw,
    issue_date: b.issue_date
      ? shiftDateStr(b.issue_date, DATE_OFFSET_DAYS)
      : null,
    due_date: b.due_date ? shiftDateStr(b.due_date, DATE_OFFSET_DAYS) : null,
    total_amount: b.total_amount,
    subtotal: b.subtotal,
    tax_amount: b.tax_amount,
    currency: b.currency,
    status: b.status,
    current_stage: b.current_stage,
    payment_status: b.payment_status,
    document_type: b.document_type,
    confidence: b.confidence,
    extraction_strategy: b.extraction_strategy,
    reasoning: b.reasoning,
    verified_by_user: b.verified_by_user,
  }));
}

export function createSeedLineItems(): DemoLineItem[] {
  return SEED.line_items.map((li) => ({
    id: li.id,
    bill_id: li.bill_id,
    description: li.description,
    common_name: li.common_name,
    quantity: li.quantity,
    unit_price: li.unit_price,
    line_total: li.line_total,
    category_id: li.category_id,
    subcategory_id: null,
    subcategory_name: null,
  }));
}

export function createSeedElicitations(): DemoElicitation[] {
  return SEED.elicitations.map((e) => ({
    id: e.id,
    bill_id: e.bill_id,
    stage: e.stage,
    status: e.status as DemoElicitation["status"],
    question: e.question,
    context: e.context,
    answer: e.answer,
    answered_at: e.answered_at
      ? shiftDateTimeStr(e.answered_at, DATE_OFFSET_DAYS)
      : null,
  }));
}
