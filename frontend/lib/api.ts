import { isDemoToken } from "@/lib/demo/demo-mode";
import { demoRequest } from "@/lib/demo/demo-router";
import { demoUploadBills } from "@/lib/demo/demo-upload";
import { startProgressSimulation } from "@/lib/progress-simulation";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type FastApiValidationError = { msg?: string };

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const detail = body?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return (detail as FastApiValidationError[])
        .map((error) => error.msg)
        .filter(Boolean)
        .join(", ");
    }
  } catch {
    // response body wasn't JSON — fall through to the generic message
  }
  return "Something went wrong. Please try again.";
}

// Every caller attaches `Authorization: Bearer <token>` as a plain header object (never a
// Headers instance) - see any exported function below. Demo mode's sentinel token rides along
// in that same header, so this is the one place request() needs to recognize it.
function bearerToken(init?: RequestInit): string | null {
  const headers = init?.headers as Record<string, string> | undefined;
  const value = headers?.Authorization;
  return value?.startsWith("Bearer ") ? value.slice("Bearer ".length) : null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (isDemoToken(bearerToken(init))) {
    return demoRequest<T>(path, init);
  }

  // FormData bodies (file uploads) must NOT get a manual Content-Type - the browser sets its
  // own with the multipart boundary parameter, which a fixed "application/json" would clobber.
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(await parseErrorMessage(response), response.status);
  }

  // 204 No Content (e.g. DELETE endpoints) has no body to parse - response.json() would throw
  // on the empty string.
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export type TokenResponse = {
  access_token: string;
  token_type: string;
};

export type UserRead = {
  id: string;
  email: string;
  username: string;
  is_demo: boolean;
  created_at: string;
};

export function login(email: string, password: string): Promise<TokenResponse> {
  return request<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function signup(
  email: string,
  username: string,
  password: string,
): Promise<UserRead> {
  return request<UserRead>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, username, password }),
  });
}

export function getCurrentUser(token: string): Promise<UserRead> {
  return request<UserRead>("/users/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// backend/app/schemas/categories.py's CategoryRead - used wherever a page needs the user's
// category list (e.g. the Vendors/Spend Analytics filter bars' category dropdown).
export type CategoryRead = {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
};

export function getCategories(token: string): Promise<CategoryRead[]> {
  // Trailing slash matches the router's actual path exactly (backend/app/routers/
  // categories.py mounts list_categories at "/") - avoids a 307 redirect that could drop the
  // Authorization header on this cross-origin (different port) request.
  return request<CategoryRead[]>("/categories/", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getCategory(
  token: string,
  categoryId: string,
): Promise<CategoryRead> {
  return request<CategoryRead>(`/categories/${categoryId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export type CategoryCreateBody = { name: string; slug: string };
export type CategoryUpdateBody = { name?: string; slug?: string };

export function createCategory(
  token: string,
  body: CategoryCreateBody,
): Promise<CategoryRead> {
  return request<CategoryRead>("/categories/", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

export function updateCategory(
  token: string,
  categoryId: string,
  body: CategoryUpdateBody,
): Promise<CategoryRead> {
  return request<CategoryRead>(`/categories/${categoryId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

export function deleteCategory(
  token: string,
  categoryId: string,
): Promise<void> {
  return request<void>(`/categories/${categoryId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export type OverviewKPIs = {
  total_spent_current_month: string;
  total_spent_previous_month: string;
  spend_delta_pct: string | null;
  bills_processed_current_month: number;
  pending_elicitations: number;
  auto_resolved_rate: string;
  total_bills: number;
};

export type TrendPoint = { period: string; total: string };
export type VendorSpend = { vendor_name: string; total: string };
export type CategorySpend = { category_name: string; total: string };

export type RecentUpload = {
  bill_id: string;
  name: string;
  vendor_name: string | null;
  total_amount: string | null;
  confidence: string | null;
  current_stage: string;
};

export type PendingQuestion = {
  elicitation_id: string;
  bill_id: string;
  bill_name: string;
  vendor_name: string | null;
  amount: string | null;
  question: string;
};

export type OverviewResponse = {
  kpis: OverviewKPIs;
  spending_trend: TrendPoint[];
  top_vendors: VendorSpend[];
  spending_by_category: CategorySpend[];
  recent_uploads: RecentUpload[];
  pending_questions: PendingQuestion[];
};

export type Granularity = "day" | "week" | "month" | "year";

export function getOverview(
  token: string,
  params?: { granularity?: Granularity; months?: number },
): Promise<OverviewResponse> {
  const query = new URLSearchParams();
  if (params?.granularity) query.set("granularity", params.granularity);
  if (params?.months) query.set("months", String(params.months));
  const qs = query.toString();
  return request<OverviewResponse>(`/analytics/overview${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// docs/vendor - schema and example response for GET /analytics/vendors.
export type VendorsKPIs = {
  total_vendors: number;
  top_vendor_name: string | null;
  top_vendor_total: string | null;
  new_vendors_this_month: number;
  vendor_concentration_pct: string;
};

export type VendorSpendBar = { vendor_name: string; total: string };
export type VendorFrequencyBar = { vendor_name: string; bill_count: number };
export type NewVendorsPoint = { period: string; count: number };
export type RecurringVendor = {
  vendor_name: string;
  avg_amount: string;
  frequency: number;
  last_bill_date: string;
};

export type VendorTableRow = {
  vendor_id: string;
  name: string;
  key: string;
  bill_count: number;
  total_spent: string;
  avg_bill_amount: string;
  last_bill_date: string | null;
  most_frequent_category: string | null;
};

export type VendorsAnalyticsResponse = {
  kpis: VendorsKPIs;
  top_vendors_by_spend: VendorSpendBar[];
  top_vendors_by_frequency: VendorFrequencyBar[];
  new_vendors_over_time: NewVendorsPoint[];
  recurring_vendors: RecurringVendor[];
  vendor_table: VendorTableRow[];
};

export function getVendorsAnalytics(
  token: string,
  params?: { startDate?: string; endDate?: string; categoryId?: string },
): Promise<VendorsAnalyticsResponse> {
  const query = new URLSearchParams();
  if (params?.startDate) query.set("start_date", params.startDate);
  if (params?.endDate) query.set("end_date", params.endDate);
  if (params?.categoryId) query.set("category_id", params.categoryId);
  const qs = query.toString();
  return request<VendorsAnalyticsResponse>(
    `/analytics/vendors${qs ? `?${qs}` : ""}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

// docs/vendor - schema for GET /analytics/vendors/{vendor_id}, backing the Vendors "vendor
// detail (drill-down)" page from frontend/CLAUDE.md.
export type VendorSpendingTrendPoint = { period: string; total: string };

export type VendorBillHistoryRow = {
  bill_id: string;
  name: string;
  total_amount: string | null;
  issue_date: string | null;
  status: string;
  confidence: string | null;
};

export type VendorDetailResponse = {
  vendor_id: string;
  name: string;
  address: string | null;
  total_spent: string;
  bill_count: number;
  avg_bill_amount: string;
  spending_trend: VendorSpendingTrendPoint[];
  bills_history: VendorBillHistoryRow[];
};

export function getVendorDetail(
  token: string,
  vendorId: string,
): Promise<VendorDetailResponse> {
  return request<VendorDetailResponse>(`/analytics/vendors/${vendorId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// backend/app/schemas/vendors.py - the plain CRUD vendor resource (GET/PATCH/DELETE
// /vendors/{id}), distinct from the read-only VendorDetailResponse above: this is the shape
// the edit form needs (name/address/key together - neither analytics response carries all
// three at once).
export type VendorRead = {
  id: string;
  user_id: string;
  name: string;
  address: string | null;
  key: string;
  created_at: string;
  updated_at: string;
};

export type VendorUpdateBody = {
  name?: string;
  address?: string | null;
  key?: string;
};

// Plain unfiltered list (GET /vendors/), for the Bills Explorer vendor filter dropdown - not
// the aggregated analytics list (getVendorsAnalytics's vendor_table).
export function getVendors(token: string): Promise<VendorRead[]> {
  return request<VendorRead[]>("/vendors/", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getVendor(
  token: string,
  vendorId: string,
): Promise<VendorRead> {
  return request<VendorRead>(`/vendors/${vendorId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function updateVendor(
  token: string,
  vendorId: string,
  body: VendorUpdateBody,
): Promise<VendorRead> {
  return request<VendorRead>(`/vendors/${vendorId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

export function deleteVendor(token: string, vendorId: string): Promise<void> {
  return request<void>(`/vendors/${vendorId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export type BillUploadResult = {
  filename: string;
  // Full BillRead shape isn't needed yet - Bill Detail (which would use it) isn't built. Kept
  // loose rather than duplicating the backend schema for fields nothing here reads.
  bill: { id: string } | null;
  error: string | null;
};

// XMLHttpRequest, not fetch: `onProgress` needs real upload-progress events (bytes sent vs.
// total), which fetch has no API for on the request body side - only XHR's xhr.upload
// exposes that. Mirrors request()'s error-parsing shape (FastAPI's `detail` field) so callers
// get the same ApiError either way.
//
// Byte-upload progress only covers the request body actually being sent - for a bill-sized
// PDF that's near-instant (milliseconds), while the real vision-model parsing that follows
// (backend/app/services/bill_parser_service.py) takes ~20s on average (live-measured after
// disabling reasoning across every agent), and XHR has no progress signal for that
// server-side work at all. The percentage budget is deliberately lopsided the other way from
// how long each phase actually takes: `upload.onprogress` only climbs to 8% (the byte
// transfer is over almost immediately, so it doesn't need much visual real estate), then
// `upload.onloadend` (fires once the request body has finished sending, success or fail)
// hands off to lib/progress-simulation.ts's shared creep across the wide 8->96 span for the
// ~20s wait that actually needs to look alive - the earlier 90->99 split gave the long wait
// only 9 points to creep through, which read as "stuck at 90%" even though it was technically
// still moving. Same wide-span approach lib/demo/demo-upload.ts's demoUploadBills uses (its
// 0->90 span) for the live demo upload.
export function uploadBills(
  token: string,
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<BillUploadResult[]> {
  if (isDemoToken(token)) return demoUploadBills(files, onProgress);

  const formData = new FormData();
  for (const file of files) formData.append("files", file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/bills/upload`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    let stopSimulation: (() => void) | null = null;

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 8));
        }
      };
      xhr.upload.onloadend = () => {
        stopSimulation = startProgressSimulation(onProgress, {
          from: 8,
          cap: 96,
        });
      };
    }

    xhr.onload = () => {
      stopSimulation?.();
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        try {
          resolve(JSON.parse(xhr.responseText) as BillUploadResult[]);
        } catch {
          reject(
            new ApiError(
              "Received an invalid response from the server.",
              xhr.status,
            ),
          );
        }
        return;
      }

      let message = "Something went wrong. Please try again.";
      try {
        const body = JSON.parse(xhr.responseText);
        const detail = body?.detail;
        if (typeof detail === "string") {
          message = detail;
        } else if (Array.isArray(detail)) {
          message = (detail as FastApiValidationError[])
            .map((error) => error.msg)
            .filter(Boolean)
            .join(", ");
        }
      } catch {
        // response body wasn't JSON — fall through to the generic message
      }
      reject(new ApiError(message, xhr.status));
    };

    xhr.onerror = () => {
      stopSimulation?.();
      reject(new ApiError("Network error - please check your connection.", 0));
    };

    xhr.send(formData);
  });
}

// docs/vendor - schema and example response for GET /analytics/categories.
export type CategoriesKPIs = {
  total_categories: number;
  most_expensive_category_name: string | null;
  most_expensive_category_total: string | null;
  uncategorized_bills_count: number;
  other_rate: string;
};

export type CategorySpendBar = { category_name: string; total: string };
export type CategoryCount = { category_name: string; bill_count: number };
export type CategoryEvolutionPoint = {
  period: string;
  category_name: string;
  total: string;
};
export type UncategorizedTrendPoint = {
  period: string;
  count: number;
  total: string;
};
export type OtherRateTrendPoint = { period: string; other_rate: string };

export type CategoryTableRow = {
  category_id: string;
  name: string;
  bill_count: number;
  total_spent: string;
  avg_bill_amount: string;
  pct_of_total_spend: string;
};

export type CategoriesAnalyticsResponse = {
  kpis: CategoriesKPIs;
  spend_by_category: CategorySpendBar[];
  bill_count_by_category: CategoryCount[];
  category_evolution: CategoryEvolutionPoint[];
  uncategorized_trend: UncategorizedTrendPoint[];
  other_rate_trend: OtherRateTrendPoint[];
  category_table: CategoryTableRow[];
};

export function getCategoriesAnalytics(
  token: string,
  params?: { startDate?: string; endDate?: string },
): Promise<CategoriesAnalyticsResponse> {
  const query = new URLSearchParams();
  if (params?.startDate) query.set("start_date", params.startDate);
  if (params?.endDate) query.set("end_date", params.endDate);
  const qs = query.toString();
  return request<CategoriesAnalyticsResponse>(
    `/analytics/categories${qs ? `?${qs}` : ""}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

// backend/app/schemas/analytics/agent_insights.py's schema for GET /analytics/agent-insights.
// avg_confidence fields are the raw 0-1 scale (same as ConfidenceBadge's `value` prop, and
// bills.confidence itself) - NOT the 0-100 scale formatPercent expects, so callers must
// multiply by 100 first. auto_resolved_rate/ocr_rate ARE already 0-100, like every other
// *_rate/*_pct field elsewhere in this file.
export type AgentInsightsKPIs = {
  avg_confidence: string | null;
  auto_resolved_rate: string;
  ocr_rate: string | null;
  bills_in_backlog: number;
};

export type ConfidenceTrendPoint = {
  period: string;
  avg_confidence: string | null;
};

export type ConfidenceByCategory = {
  category_name: string;
  avg_confidence: string | null;
  bill_count: number;
};

export type ExtractionStrategyConfidence = {
  extraction_strategy: string;
  avg_confidence: string | null;
  bill_count: number;
};

export type AgentInsightsResponse = {
  kpis: AgentInsightsKPIs;
  confidence_trend: ConfidenceTrendPoint[];
  confidence_by_category: ConfidenceByCategory[];
  extraction_strategy_effectiveness: ExtractionStrategyConfidence[];
  // confidence_distribution/current_stage_funnel also come back from the API, but
  // frontend/CLAUDE.md defers building UI for both in v1 - deliberately not typed here.
};

export function getAgentInsights(
  token: string,
): Promise<AgentInsightsResponse> {
  return request<AgentInsightsResponse>("/analytics/agent-insights", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// backend/app/schemas/analytics/elicitations.py's schema for GET /analytics/elicitations.
// avg_confidence is the raw 0-1 scale (see AgentInsightsKPIs' comment above) -
// expiration_rate IS already 0-100, like every other *_rate field elsewhere in this file.
export type ElicitationsKPIs = {
  pending_count: number;
  answered_count: number;
  expired_count: number;
  expiration_rate: string;
  avg_confidence: string | null;
  uncategorized_bills_count: number;
};

export type ElicitationRatePoint = { period: string; count: number };
export type ElicitationsByStage = { stage: string; count: number };

export type ElicitationsAnalyticsResponse = {
  kpis: ElicitationsKPIs;
  elicitation_rate_over_time: ElicitationRatePoint[];
  elicitations_by_stage: ElicitationsByStage[];
  // PendingQuestion (bill_id, bill_name, vendor_name, amount, question) is already defined
  // above, for Overview's pending-questions preview - this endpoint returns the full list.
  pending_questions: PendingQuestion[];
};

export function getElicitationsAnalytics(
  token: string,
): Promise<ElicitationsAnalyticsResponse> {
  return request<ElicitationsAnalyticsResponse>("/analytics/elicitations", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// backend/app/schemas/elicitations.py's ElicitationRead - returned by the answer endpoint.
// Only the fields this app's UI actually reads are typed; the rest (context/answer objects,
// timestamps) aren't needed here.
export type ElicitationRead = {
  id: string;
  bill_id: string;
  stage: string;
  question: string;
  status: string;
};

// POST /bills/{bill_id}/elicitations/{elicitation_id}/answer - the real pause/resume entry
// point (backend/app/routers/elicitations.py), not a plain field update. answer_text is
// free-text ("it's from Atelier du Bois, paid by card"), turned into structured field
// corrections server-side via an OpenRouter call - a 422 means that call couldn't parse the
// reply into usable JSON, which the caller should surface as "please rephrase", not a generic
// error.
export function answerElicitation(
  token: string,
  billId: string,
  elicitationId: string,
  answerText: string,
): Promise<ElicitationRead> {
  return request<ElicitationRead>(
    `/bills/${billId}/elicitations/${elicitationId}/answer`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ answer_text: answerText }),
    },
  );
}

// backend/app/schemas/bills.py's BillRead, trimmed to what Bills Explorer's table/filters
// actually read (name, vendor/category ids to resolve against getVendors/getCategories,
// amount+currency, issue date, status, confidence) - not the full schema (subtotal,
// tax_amount, payment_method, reasoning, field_confidences, raw_text, storage_key/file_hash
// etc. aren't shown anywhere on this page).
export type BillRead = {
  id: string;
  category_id: string | null;
  vendor_id: string | null;
  name: string;
  invoice_number: string | null;
  vendor_name_raw: string | null;
  issue_date: string | null;
  total_amount: string | null;
  currency: string | null;
  status: string;
  confidence: string | null;
};

// GET /bills/ takes no query params at all (backend/app/routers/bills.py's list_bills) - every
// filter/search/sort/pagination on the Bills Explorer page happens client-side against this
// one fetched list, there's no server-side filtering to call into.
export function getBills(token: string): Promise<BillRead[]> {
  return request<BillRead[]>("/bills/", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function deleteBill(token: string, billId: string): Promise<void> {
  return request<void>(`/bills/${billId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// backend/app/schemas/bills.py's full BillRead - unlike the list-trimmed BillRead above, this
// is what BillEditDialog fetches fresh on open (GET /bills/{id}) since the fields it edits
// (due_date, payment_status) aren't in the trimmed list type.
export type BillFullRead = {
  id: string;
  category_id: string | null;
  vendor_id: string | null;
  name: string;
  invoice_number: string | null;
  vendor_name_raw: string | null;
  issue_date: string | null;
  due_date: string | null;
  total_amount: string | null;
  currency: string | null;
  status: string;
  payment_status: string;
  confidence: string | null;
};

export function getBill(token: string, billId: string): Promise<BillFullRead> {
  return request<BillFullRead>(`/bills/${billId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export type BillUpdateBody = {
  name?: string;
  invoice_number?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  total_amount?: string | null;
  category_id?: string | null;
  vendor_id?: string | null;
  status?: string;
  payment_status?: string;
};

export function updateBill(
  token: string,
  billId: string,
  body: BillUpdateBody,
): Promise<BillRead> {
  return request<BillRead>(`/bills/${billId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

// backend/app/schemas/analytics/line_items.py's schema for GET /analytics/line-items. Note:
// vendor_id/category_id only filter `line_item_table` server-side - the KPIs and the 3 charts
// below are always computed unfiltered (see backend/app/services/analytics/
// line_items_service.py: filters is only passed to get_line_item_table). So the vendor/
// category dropdowns on this page are a table-scoped filter, not a page-wide one like Vendors/
// Categories - they live in LineItemsTable's own filter row, not a page-top filter bar.
export type LineItemsKPIs = {
  total_line_items: number;
  most_purchased_item_name: string | null;
  most_purchased_item_count: number | null;
  categorization_gap_pct: string;
};

export type ItemFrequency = { common_name: string; count: number };
export type ItemSpend = { common_name: string; total: string };
export type UnitPriceTrendPoint = {
  common_name: string;
  period: string;
  avg_unit_price: string;
};

export type LineItemTableRow = {
  line_item_id: string;
  bill_id: string;
  bill_name: string;
  description: string;
  common_name: string | null;
  quantity: string | null;
  unit_price: string | null;
  line_total: string;
  vendor_name: string | null;
  category_name: string | null;
};

export type LineItemsAnalyticsResponse = {
  kpis: LineItemsKPIs;
  most_frequent_items: ItemFrequency[];
  top_items_by_spend: ItemSpend[];
  unit_price_trend: UnitPriceTrendPoint[];
  line_item_table: LineItemTableRow[];
};

export function getLineItemsAnalytics(
  token: string,
  params?: { vendorId?: string; categoryId?: string },
): Promise<LineItemsAnalyticsResponse> {
  const query = new URLSearchParams();
  if (params?.vendorId) query.set("vendor_id", params.vendorId);
  if (params?.categoryId) query.set("category_id", params.categoryId);
  const qs = query.toString();
  return request<LineItemsAnalyticsResponse>(
    `/analytics/line-items${qs ? `?${qs}` : ""}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

// backend/app/schemas/analytics/line_items.py's CategoryTreeNode/CategoryTreeResponse, from
// GET /analytics/line-items/category-tree - category -> sub-category -> (agent-decided)
// sub-sub-category, as one tree rooted at a synthetic "Total" node. `id` is null only for that
// root and for the synthetic "Non classé" leaf (items in a category the sub-categorizer hasn't
// covered yet). Fed to the radial tree chart directly - see
// spending-category-tree-chart.tsx's toEChartsNode.
export type CategoryTreeNode = {
  id: string | null;
  name: string;
  total: string;
  pct_of_parent: string;
  children: CategoryTreeNode[];
};

export type CategoryTreeResponse = {
  root: CategoryTreeNode;
};

export function getCategoryTree(token: string): Promise<CategoryTreeResponse> {
  return request<CategoryTreeResponse>("/analytics/line-items/category-tree", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// backend/app/schemas/analytics/line_items.py's SubcategoryLineItemRow, from GET
// /analytics/line-items/by-subcategory/{id} - the line items behind one category-tree node's
// total (clicking a subcategory/sub-subcategory node in the chart). For a node with children,
// the backend already includes every descendant's items too, not just that node's own direct
// assignments - hence subcategory_name here (which leaf each row actually belongs to).
export type SubcategoryLineItemRow = {
  line_item_id: string;
  bill_id: string;
  bill_name: string;
  description: string;
  common_name: string | null;
  quantity: string | null;
  unit_price: string | null;
  line_total: string;
  vendor_name: string | null;
  category_name: string | null;
  subcategory_name: string;
};

export function getLineItemsForSubcategory(
  token: string,
  subcategoryId: string,
): Promise<SubcategoryLineItemRow[]> {
  return request<SubcategoryLineItemRow[]>(
    `/analytics/line-items/by-subcategory/${subcategoryId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

// backend/app/schemas/line_items.py's SubcategorizeResponse, from POST
// /line-items/subcategorize - the sub-categorizer agent's batch entry point. Not under
// /analytics (it's a mutating action with real LLM calls and writes, not a read) - triggered
// by the "Generate sub-categories" button on the Line Items page.
export type SubcategorizeResponse = {
  categories_processed: number;
  subcategories_created: number;
};

export function subcategorizeLineItems(
  token: string,
): Promise<SubcategorizeResponse> {
  return request<SubcategorizeResponse>("/line-items/subcategorize", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// backend/app/schemas/bill_line_items.py's BillLineItemUpdate, for the Line Items table's
// "edit (description, common_name, quantity, unit_price, category)" row action. PATCH
// /bills/{bill_id}/line-items/{line_item_id} - nested under the bill, hence billId here (same
// shape as answerElicitation's bill_id + elicitation_id nesting above).
export type LineItemUpdateBody = {
  category_id?: string | null;
  description?: string;
  common_name?: string | null;
  quantity?: string | null;
  unit_price?: string | null;
};

// backend/app/schemas/bill_line_items.py's BillLineItemRead - the PATCH endpoint's actual
// response shape, distinct from the analytics LineItemTableRow above (no resolved
// vendor_name/category_name/bill_name, `id` not `line_item_id`).
export type BillLineItemRead = {
  id: string;
  bill_id: string;
  category_id: string | null;
  description: string;
  common_name: string | null;
  quantity: string | null;
  unit_price: string | null;
  line_total: string;
};

// LineItemTableRow (the analytics row the table renders) has category_name but not
// category_id - the edit dialog needs the id for its dropdown, so it fetches the plain CRUD
// resource fresh on open, same reasoning as VendorEditDialog/CategoryFormDialog.
export function getLineItem(
  token: string,
  billId: string,
  lineItemId: string,
): Promise<BillLineItemRead> {
  return request<BillLineItemRead>(
    `/bills/${billId}/line-items/${lineItemId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

export function updateLineItem(
  token: string,
  billId: string,
  lineItemId: string,
  body: LineItemUpdateBody,
): Promise<BillLineItemRead> {
  return request<BillLineItemRead>(
    `/bills/${billId}/line-items/${lineItemId}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    },
  );
}

export function deleteLineItem(
  token: string,
  billId: string,
  lineItemId: string,
): Promise<void> {
  return request<void>(`/bills/${billId}/line-items/${lineItemId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// backend/app/schemas/analytics/spend.py's schema for GET /analytics/spend. Reuses
// TrendPoint/CategorySpend/VendorSpend (Overview) and CategoryEvolutionPoint (Categories) -
// backend/app/services/analytics/spend_service.py itself imports those same three schemas
// from app.schemas.analytics.overview rather than redefining them, so this mirrors that.
export type SpendKPIs = {
  total_spent: string;
  bills_count: number;
  average_bill_amount: string;
  highest_bill_amount: string | null;
  highest_bill_vendor_name: string | null;
};

export type VendorEvolutionPoint = {
  period: string;
  vendor_name: string;
  total: string;
};

// A real annual calendar heatmap (Jan 1 - Dec 31 of the current year), not a day-of-week x
// week-of-month pattern aggregated across all time - see backend/app/repos/analytics/
// spend_repo.py's get_spending_calendar.
export type CalendarHeatmapCell = {
  date: string;
  total: string;
};

export type BillSizeHistogramBucket = {
  range_start: string;
  range_end: string;
  count: number;
};

export type VelocityPoint = {
  day_of_month: number;
  cumulative_current_month: string;
  cumulative_previous_month: string;
};

export type PaymentStatusBreakdown = {
  payment_status: string;
  total: string;
  count: number;
};

export type DocumentTypeSpend = { document_type: string; total: string };

export type RecurringBill = {
  vendor_name: string;
  avg_amount: string;
  frequency: number;
  last_bill_date: string;
};

export type Outlier = {
  bill_id: string;
  bill_name: string;
  vendor_name: string;
  total_amount: string;
  vendor_average: string;
  deviation_ratio: string;
};

export type MonthOverMonthRow = {
  name: string;
  current_month: string;
  previous_month: string;
  delta_pct: string | null;
};

// backend/app/schemas/analytics/spend.py's BoxplotStats - five-number summary (min/Q1/median/
// Q3/max) of bill amounts within one month, for the spending distribution boxplot.
export type BoxplotStats = {
  month: string;
  min: string;
  q1: string;
  median: string;
  q3: string;
  max: string;
};

export type SpendAnalyticsResponse = {
  kpis: SpendKPIs;
  spending_trend: TrendPoint[];
  category_evolution: CategoryEvolutionPoint[];
  vendor_evolution: VendorEvolutionPoint[];
  spending_heatmap: CalendarHeatmapCell[];
  bill_size_distribution: BillSizeHistogramBucket[];
  spending_velocity: VelocityPoint[];
  spending_boxplot: BoxplotStats[];
  spending_by_category: CategorySpend[];
  top_vendors: VendorSpend[];
  payment_status_breakdown: PaymentStatusBreakdown[];
  spend_by_document_type: DocumentTypeSpend[];
  recurring_bills: RecurringBill[];
  outliers: Outlier[];
  month_over_month_by_category: MonthOverMonthRow[];
  month_over_month_by_vendor: MonthOverMonthRow[];
};

// backend/app/schemas/analytics/spend.py's CategoryMomentumResponse, from the standalone GET
// /analytics/spend/category-momentum endpoint - fetched independently of the main
// /analytics/spend payload (whose own category_evolution field stays fixed at month), so this
// isn't part of SpendAnalyticsResponse. Every distinct period in range is included (not just
// the last two), same shape as CategoryEvolutionPoint - only `granularity` varies, following
// the page-top SpendFilters selector like everything else on the page.
export type CategoryMomentumResponse = {
  points: CategoryEvolutionPoint[];
};

export function getCategoryMomentum(
  token: string,
  params?: {
    startDate?: string;
    endDate?: string;
    granularity?: Granularity;
    vendorId?: string;
    categoryId?: string;
  },
): Promise<CategoryMomentumResponse> {
  const query = new URLSearchParams();
  if (params?.startDate) query.set("start_date", params.startDate);
  if (params?.endDate) query.set("end_date", params.endDate);
  if (params?.granularity) query.set("granularity", params.granularity);
  if (params?.vendorId) query.set("vendor_id", params.vendorId);
  if (params?.categoryId) query.set("category_id", params.categoryId);
  const qs = query.toString();
  return request<CategoryMomentumResponse>(
    `/analytics/spend/category-momentum${qs ? `?${qs}` : ""}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

export function getSpendAnalytics(
  token: string,
  params?: {
    startDate?: string;
    endDate?: string;
    vendorId?: string;
    categoryId?: string;
    granularity?: Granularity;
  },
): Promise<SpendAnalyticsResponse> {
  const query = new URLSearchParams();
  if (params?.startDate) query.set("start_date", params.startDate);
  if (params?.endDate) query.set("end_date", params.endDate);
  if (params?.vendorId) query.set("vendor_id", params.vendorId);
  if (params?.categoryId) query.set("category_id", params.categoryId);
  if (params?.granularity) query.set("granularity", params.granularity);
  const qs = query.toString();
  return request<SpendAnalyticsResponse>(
    `/analytics/spend${qs ? `?${qs}` : ""}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}
