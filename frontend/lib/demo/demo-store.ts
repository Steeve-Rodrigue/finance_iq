import {
  createSeedBills,
  createSeedCategories,
  createSeedElicitations,
  createSeedLineItems,
  createSeedVendors,
  type DemoBill,
  type DemoCategory,
  type DemoElicitation,
  type DemoLineItem,
  type DemoVendor,
} from "@/lib/demo/demo-data";

type DemoStore = {
  categories: DemoCategory[];
  vendors: DemoVendor[];
  bills: DemoBill[];
  lineItems: DemoLineItem[];
  elicitations: DemoElicitation[];
};

// Module-level singleton, not React state/Context: every function in lib/api.ts that this
// simulates (getBills, updateBill, answerElicitation, ...) is a plain async function, not a
// hook, so it can't read useState/Context. This plays the role "the database" plays for the
// real backend - an in-memory table set that mock handlers (demo-router.ts) mutate in place.
// Every dashboard page already re-fetches its own data right after a mutation it initiated
// (e.g. elicitations/page.tsx's refreshKey bump), so the next fetch reading these mutated
// arrays is what makes the UI feel "live" - no React re-render propagation from this module is
// needed for that to work.
let store: DemoStore | null = null;

// `selectedBillIds`, when given, restricts the seeded store to that subset of bills (the
// app/demo bill-picker page) - vendors/categories/elicitations/line items with no remaining
// bill referencing them are dropped too, so every page stays internally consistent with what
// was picked (a vendor filter dropdown never lists a vendor with zero visible bills, etc.).
// Omitting it (or passing undefined) seeds every bill, matching the pre-picker default.
function seedStore(selectedBillIds?: string[]): DemoStore {
  const bills = createSeedBills();
  const lineItems = createSeedLineItems();
  const elicitations = createSeedElicitations();
  const categories = createSeedCategories();
  const vendors = createSeedVendors();

  if (!selectedBillIds) {
    return { categories, vendors, bills, lineItems, elicitations };
  }

  const keep = new Set(selectedBillIds);
  const keptBills = bills.filter((b) => keep.has(b.id));
  const keptVendorIds = new Set(
    keptBills.map((b) => b.vendor_id).filter((id): id is string => id != null),
  );
  const keptCategoryIds = new Set(
    keptBills
      .map((b) => b.category_id)
      .filter((id): id is string => id != null),
  );

  return {
    categories: categories.filter((c) => keptCategoryIds.has(c.id)),
    vendors: vendors.filter((v) => keptVendorIds.has(v.id)),
    bills: keptBills,
    lineItems: lineItems.filter((li) => keep.has(li.bill_id)),
    elicitations: elicitations.filter((e) => keep.has(e.bill_id)),
  };
}

export function getStore(): DemoStore {
  if (!store) store = seedStore();
  return store;
}

// Called by the demo bill-picker page (app/demo/page.tsx) right before starting a new demo
// session, so a visitor who logs out and comes back through the picker always gets a clean
// store scoped to whatever they pick this time, not whatever they left mutated last time.
// Passing no argument (e.g. a direct re-entry) seeds every bill.
export function resetDemoStore(selectedBillIds?: string[]): void {
  store = seedStore(selectedBillIds);
}

// Generates the next id in the same "prefix-NN" shape the seed data already uses (e.g. "b-41"
// after the seed's "b-01".."b-40"), so newly created/uploaded demo rows type-check against the
// same bare `id: string` fields as everything else - nothing in the explored dashboard
// components validates id format beyond that.
export function nextId(prefix: string, existing: { id: string }[]): string {
  let max = 0;
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  for (const row of existing) {
    const match = pattern.exec(row.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${String(max + 1).padStart(2, "0")}`;
}
