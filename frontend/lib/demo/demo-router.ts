import {
  ApiError,
  type BillFullRead,
  type BillLineItemRead,
  type BillRead,
  type CategoryRead,
  type ElicitationRead,
  type Granularity,
  type SubcategorizeResponse,
  type UserRead,
  type VendorRead,
} from "@/lib/api";
import {
  computeAgentInsights,
  computeCategoriesAnalytics,
  computeCategoryMomentum,
  computeCategoryTree,
  computeElicitationsAnalytics,
  computeLineItemsAnalytics,
  computeLineItemsForSubcategory,
  computeOverview,
  computeSpendAnalytics,
  computeVendorDetail,
  computeVendorsAnalytics,
} from "@/lib/demo/demo-analytics";
import {
  DEMO_USER,
  type DemoBill,
  type DemoCategory,
  type DemoElicitation,
  type DemoLineItem,
  type DemoVendor,
} from "@/lib/demo/demo-data";
import { getStore, nextId } from "@/lib/demo/demo-store";

// ---- *Read shape converters (money/quantity fields go from the store's plain numbers back to
// the string-typed fields lib/api.ts declares, matching how the real backend serializes
// Decimal columns) ------------------------------------------------------------------------

function toCategoryRead(c: DemoCategory): CategoryRead {
  return { ...c };
}

function toVendorRead(v: DemoVendor): VendorRead {
  return { ...v };
}

function toBillRead(b: DemoBill): BillRead {
  return {
    id: b.id,
    category_id: b.category_id,
    vendor_id: b.vendor_id,
    name: b.name,
    invoice_number: b.invoice_number,
    vendor_name_raw: b.vendor_name_raw,
    issue_date: b.issue_date,
    total_amount: b.total_amount == null ? null : b.total_amount.toFixed(2),
    currency: b.currency,
    status: b.status,
    confidence: b.confidence == null ? null : b.confidence.toFixed(2),
  };
}

function toBillFullRead(b: DemoBill): BillFullRead {
  return {
    ...toBillRead(b),
    due_date: b.due_date,
    payment_status: b.payment_status,
  };
}

function toBillLineItemRead(li: DemoLineItem): BillLineItemRead {
  return {
    id: li.id,
    bill_id: li.bill_id,
    category_id: li.category_id,
    description: li.description,
    common_name: li.common_name,
    quantity: li.quantity == null ? null : String(li.quantity),
    unit_price: li.unit_price == null ? null : li.unit_price.toFixed(2),
    line_total: li.line_total.toFixed(2),
  };
}

function toElicitationRead(e: DemoElicitation): ElicitationRead {
  return {
    id: e.id,
    bill_id: e.bill_id,
    stage: e.stage,
    question: e.question,
    status: e.status,
  };
}

// ---- request/response plumbing ------------------------------------------------------------

type Json = Record<string, unknown>;

function parseBody(init?: RequestInit): Json {
  if (!init?.body || typeof init.body !== "string") return {};
  return JSON.parse(init.body) as Json;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function strOrNull(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : null;
}

function numOrNull(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Dispatches a demo-mode request the same way FastAPI's router would: method + path segments
// -> a handler that reads/mutates the module-level store (demo-store.ts) and returns exactly
// what the real endpoint would. This is request()'s ONE demo branch (see lib/api.ts) - every
// exported api.ts function still calls request() unmodified, so nothing else needs to know
// demo mode exists.
export async function demoRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const [rawPath, queryString] = path.split("?");
  const query = new URLSearchParams(queryString ?? "");
  const segments = rawPath.split("/").filter(Boolean);
  const body = parseBody(init);

  // Small artificial delay so the UI's loading states (spinners, skeletons) are visible for a
  // beat instead of flashing instantly, closer to how a real network round trip feels.
  await new Promise((resolve) => setTimeout(resolve, 150));

  return route(method, segments, query, body) as T;
}

function route(
  method: string,
  segments: string[],
  query: URLSearchParams,
  body: Json,
): unknown {
  const store = getStore();

  // GET /users/me
  if (method === "GET" && segments[0] === "users" && segments[1] === "me") {
    const user: UserRead = {
      id: DEMO_USER.id,
      email: DEMO_USER.email,
      username: DEMO_USER.username,
      is_demo: true,
      created_at: DEMO_USER.created_at,
    };
    return user;
  }

  // /categories/ and /categories/:id
  if (segments[0] === "categories") {
    if (segments.length === 1) {
      if (method === "GET") return store.categories.map(toCategoryRead);
      if (method === "POST") {
        const name = str(body.name) ?? "Untitled category";
        const slug = str(body.slug) ?? name.toLowerCase().replace(/\s+/g, "-");
        const now = new Date().toISOString();
        const category = {
          id: nextId("cat", store.categories),
          user_id: DEMO_USER.id,
          name,
          slug,
          created_at: now,
          updated_at: now,
        };
        store.categories.push(category);
        return toCategoryRead(category);
      }
    }
    if (segments.length === 2) {
      const id = segments[1];
      const category = store.categories.find((c) => c.id === id);
      if (!category) throw new ApiError("Category not found.", 404);
      if (method === "GET") return toCategoryRead(category);
      if (method === "PATCH") {
        if (str(body.name) !== undefined)
          category.name = str(body.name) as string;
        if (str(body.slug) !== undefined)
          category.slug = str(body.slug) as string;
        category.updated_at = new Date().toISOString();
        return toCategoryRead(category);
      }
      if (method === "DELETE") {
        const linked = store.bills.some((b) => b.category_id === id);
        if (linked) {
          throw new ApiError(
            "This category has bills linked to it and can't be deleted.",
            409,
          );
        }
        store.categories = store.categories.filter((c) => c.id !== id);
        return undefined;
      }
    }
  }

  // /vendors/ and /vendors/:id
  if (segments[0] === "vendors") {
    if (segments.length === 1 && method === "GET") {
      return store.vendors.map(toVendorRead);
    }
    if (segments.length === 2) {
      const id = segments[1];
      const vendor = store.vendors.find((v) => v.id === id);
      if (!vendor) throw new ApiError("Vendor not found.", 404);
      if (method === "GET") return toVendorRead(vendor);
      if (method === "PATCH") {
        if (str(body.name) !== undefined)
          vendor.name = str(body.name) as string;
        if (strOrNull(body.address) !== undefined) {
          vendor.address = strOrNull(body.address) as string | null;
        }
        if (str(body.key) !== undefined) vendor.key = str(body.key) as string;
        vendor.updated_at = new Date().toISOString();
        return toVendorRead(vendor);
      }
      if (method === "DELETE") {
        const linked = store.bills.some((b) => b.vendor_id === id);
        if (linked) {
          throw new ApiError(
            "This vendor has bills linked to it and can't be deleted.",
            409,
          );
        }
        store.vendors = store.vendors.filter((v) => v.id !== id);
        return undefined;
      }
    }
  }

  // /bills/ and nested routes
  if (segments[0] === "bills") {
    if (segments.length === 1 && method === "GET") {
      return store.bills.map(toBillRead);
    }

    if (segments.length === 2) {
      const id = segments[1];
      const bill = store.bills.find((b) => b.id === id);
      if (!bill) throw new ApiError("Bill not found.", 404);
      if (method === "GET") return toBillFullRead(bill);
      if (method === "PATCH") {
        if (str(body.name) !== undefined) bill.name = str(body.name) as string;
        if (strOrNull(body.invoice_number) !== undefined) {
          bill.invoice_number = strOrNull(body.invoice_number) as string | null;
        }
        if (strOrNull(body.issue_date) !== undefined) {
          bill.issue_date = strOrNull(body.issue_date) as string | null;
        }
        if (strOrNull(body.due_date) !== undefined) {
          bill.due_date = strOrNull(body.due_date) as string | null;
        }
        if (numOrNull(body.total_amount) !== undefined) {
          bill.total_amount = numOrNull(body.total_amount) as number | null;
        }
        if (strOrNull(body.category_id) !== undefined) {
          bill.category_id = strOrNull(body.category_id) as string | null;
        }
        if (strOrNull(body.vendor_id) !== undefined) {
          bill.vendor_id = strOrNull(body.vendor_id) as string | null;
        }
        if (str(body.status) !== undefined)
          bill.status = str(body.status) as string;
        if (str(body.payment_status) !== undefined) {
          bill.payment_status = str(body.payment_status) as string;
        }
        return toBillRead(bill);
      }
      if (method === "DELETE") {
        store.bills = store.bills.filter((b) => b.id !== id);
        store.lineItems = store.lineItems.filter((li) => li.bill_id !== id);
        store.elicitations = store.elicitations.filter((e) => e.bill_id !== id);
        return undefined;
      }
    }

    // /bills/:billId/elicitations/:elicitationId/answer
    if (
      segments.length === 5 &&
      segments[2] === "elicitations" &&
      segments[4] === "answer" &&
      method === "POST"
    ) {
      const billId = segments[1];
      const elicitationId = segments[3];
      const elicitation = store.elicitations.find(
        (e) => e.id === elicitationId && e.bill_id === billId,
      );
      if (!elicitation) throw new ApiError("Elicitation not found.", 404);
      const answerText = str(body.answer_text) ?? "";
      elicitation.status = "answered";
      elicitation.answer = { text: answerText };
      elicitation.answered_at = new Date().toISOString();

      // Only advance the bill to "complete" once every one of its elicitations is answered -
      // a bill can have more than one pending question (see the seed data's b-32), and it
      // isn't actually done while any of them are still open.
      const stillPending = store.elicitations.some(
        (e) => e.bill_id === billId && e.status === "pending",
      );
      if (!stillPending) {
        const bill = store.bills.find((b) => b.id === billId);
        if (bill) bill.current_stage = "complete";
      }

      return toElicitationRead(elicitation);
    }

    // /bills/:billId/line-items/:lineItemId
    if (segments.length === 4 && segments[2] === "line-items") {
      const billId = segments[1];
      const lineItemId = segments[3];
      const lineItem = store.lineItems.find(
        (li) => li.id === lineItemId && li.bill_id === billId,
      );
      if (!lineItem) throw new ApiError("Line item not found.", 404);
      if (method === "GET") return toBillLineItemRead(lineItem);
      if (method === "PATCH") {
        if (strOrNull(body.category_id) !== undefined) {
          lineItem.category_id = strOrNull(body.category_id) as string | null;
        }
        if (str(body.description) !== undefined) {
          lineItem.description = str(body.description) as string;
        }
        if (strOrNull(body.common_name) !== undefined) {
          lineItem.common_name = strOrNull(body.common_name) as string | null;
        }
        if (numOrNull(body.quantity) !== undefined) {
          lineItem.quantity = numOrNull(body.quantity) as number | null;
        }
        if (numOrNull(body.unit_price) !== undefined) {
          lineItem.unit_price = numOrNull(body.unit_price) as number | null;
        }
        if (lineItem.quantity != null && lineItem.unit_price != null) {
          lineItem.line_total = lineItem.quantity * lineItem.unit_price;
        }
        return toBillLineItemRead(lineItem);
      }
      if (method === "DELETE") {
        store.lineItems = store.lineItems.filter((li) => li.id !== lineItemId);
        return undefined;
      }
    }
  }

  // /line-items/subcategorize
  if (
    segments[0] === "line-items" &&
    segments[1] === "subcategorize" &&
    method === "POST"
  ) {
    const categoriesProcessed = new Set<string>();
    let created = 0;
    for (const li of store.lineItems) {
      if (!li.category_id) continue;
      categoriesProcessed.add(li.category_id);
      if (!li.subcategory_name) {
        const subName = li.common_name ?? li.description;
        li.subcategory_name = subName;
        li.subcategory_id = `${li.category_id}::${subName}`;
        created++;
      }
    }
    const response: SubcategorizeResponse = {
      categories_processed: categoriesProcessed.size,
      subcategories_created: created,
    };
    return response;
  }

  // /analytics/*
  if (segments[0] === "analytics" && method === "GET") {
    if (segments.length === 2 && segments[1] === "overview") {
      const months = query.get("months");
      return computeOverview({
        granularity:
          (query.get("granularity") as Granularity | null) ?? undefined,
        months: months ? Number(months) : undefined,
      });
    }
    if (segments.length === 2 && segments[1] === "vendors") {
      return computeVendorsAnalytics({
        startDate: query.get("start_date") ?? undefined,
        endDate: query.get("end_date") ?? undefined,
        categoryId: query.get("category_id") ?? undefined,
      });
    }
    if (segments.length === 3 && segments[1] === "vendors") {
      return computeVendorDetail(segments[2]);
    }
    if (segments.length === 2 && segments[1] === "categories") {
      return computeCategoriesAnalytics({
        startDate: query.get("start_date") ?? undefined,
        endDate: query.get("end_date") ?? undefined,
      });
    }
    if (segments.length === 2 && segments[1] === "agent-insights") {
      return computeAgentInsights();
    }
    if (segments.length === 2 && segments[1] === "elicitations") {
      return computeElicitationsAnalytics();
    }
    if (segments.length === 2 && segments[1] === "line-items") {
      return computeLineItemsAnalytics({
        vendorId: query.get("vendor_id") ?? undefined,
        categoryId: query.get("category_id") ?? undefined,
      });
    }
    if (
      segments.length === 3 &&
      segments[1] === "line-items" &&
      segments[2] === "category-tree"
    ) {
      return computeCategoryTree();
    }
    if (
      segments.length === 4 &&
      segments[1] === "line-items" &&
      segments[2] === "by-subcategory"
    ) {
      return computeLineItemsForSubcategory(segments[3]);
    }
    if (
      segments.length === 3 &&
      segments[1] === "spend" &&
      segments[2] === "category-momentum"
    ) {
      return computeCategoryMomentum({
        startDate: query.get("start_date") ?? undefined,
        endDate: query.get("end_date") ?? undefined,
        granularity:
          (query.get("granularity") as Granularity | null) ?? undefined,
        vendorId: query.get("vendor_id") ?? undefined,
        categoryId: query.get("category_id") ?? undefined,
      });
    }
    if (segments.length === 2 && segments[1] === "spend") {
      return computeSpendAnalytics({
        startDate: query.get("start_date") ?? undefined,
        endDate: query.get("end_date") ?? undefined,
        vendorId: query.get("vendor_id") ?? undefined,
        categoryId: query.get("category_id") ?? undefined,
        granularity:
          (query.get("granularity") as Granularity | null) ?? undefined,
      });
    }
  }

  throw new ApiError(
    `Demo mode has no handler for ${method} /${segments.join("/")}.`,
    404,
  );
}
