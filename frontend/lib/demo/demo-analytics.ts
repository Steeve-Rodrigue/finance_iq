import type {
  AgentInsightsKPIs,
  AgentInsightsResponse,
  BillSizeHistogramBucket,
  BoxplotStats,
  CalendarHeatmapCell,
  CategoriesAnalyticsResponse,
  CategoriesKPIs,
  CategoryCount,
  CategoryEvolutionPoint,
  CategoryMomentumResponse,
  CategorySpend,
  CategorySpendBar,
  CategoryTableRow,
  CategoryTreeNode,
  CategoryTreeResponse,
  ConfidenceByCategory,
  ConfidenceTrendPoint,
  DocumentTypeSpend,
  ElicitationRatePoint,
  ElicitationsAnalyticsResponse,
  ElicitationsByStage,
  ElicitationsKPIs,
  ExtractionStrategyConfidence,
  Granularity,
  ItemFrequency,
  ItemSpend,
  MonthOverMonthRow,
  NewVendorsPoint,
  Outlier,
  OverviewKPIs,
  OverviewResponse,
  PaymentStatusBreakdown,
  PendingQuestion,
  RecentUpload,
  RecurringBill,
  RecurringVendor,
  SpendAnalyticsResponse,
  SpendKPIs,
  SubcategoryLineItemRow,
  TrendPoint,
  UncategorizedTrendPoint,
  UnitPriceTrendPoint,
  VelocityPoint,
  VendorBillHistoryRow,
  VendorDetailResponse,
  VendorEvolutionPoint,
  VendorFrequencyBar,
  VendorSpend,
  VendorSpendBar,
  VendorSpendingTrendPoint,
  VendorTableRow,
  VendorsAnalyticsResponse,
  VendorsKPIs,
  OtherRateTrendPoint,
  LineItemsAnalyticsResponse,
  LineItemsKPIs,
  LineItemTableRow,
} from "@/lib/api";
import { ApiError } from "@/lib/api";
import type { DemoBill, DemoLineItem } from "@/lib/demo/demo-data";
import { getStore } from "@/lib/demo/demo-store";

type Store = ReturnType<typeof getStore>;

// ---- generic helpers -------------------------------------------------------

function money(n: number | null | undefined): string {
  return (n ?? 0).toFixed(2);
}

function moneyOrNull(n: number | null | undefined): string | null {
  return n == null ? null : n.toFixed(2);
}

function pct(n: number): string {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

function confidenceOrNull(n: number | null | undefined): string | null {
  return n == null ? null : n.toFixed(2);
}

function sumAmount(bills: DemoBill[]): number {
  return bills.reduce((acc, b) => acc + (b.total_amount ?? 0), 0);
}

function vendorName(store: Store, id: string | null): string | null {
  if (!id) return null;
  return store.vendors.find((v) => v.id === id)?.name ?? null;
}

function categoryName(store: Store, id: string | null): string {
  if (!id) return "Uncategorized";
  return store.categories.find((c) => c.id === id)?.name ?? "Uncategorized";
}

function groupBy<T>(
  rows: T[],
  keyFn: (row: T) => string | null,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    if (key == null) continue;
    const arr = map.get(key);
    if (arr) arr.push(row);
    else map.set(key, [row]);
  }
  return map;
}

function topN<T>(rows: T[], n: number, sortKey: (r: T) => number): T[] {
  return [...rows].sort((a, b) => sortKey(b) - sortKey(a)).slice(0, n);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Every chart component that renders a `period` string does `new Date(period)` directly (no
// custom parsing) - see e.g. spending-trend-chart.tsx's/category-momentum-chart.tsx's
// formatPeriodLabel/formatTick - so this must always return a real, Date-parseable "YYYY-MM-DD"
// string, one per bucket's start, for every granularity. An earlier version returned a
// "YYYY-Www" label for "week" that isn't a valid date string at all, which crashed those
// components with "date value is not finite in DateTimeFormat.format()" the moment a user
// switched a chart to week granularity.
function periodKey(dateStr: string, granularity: Granularity): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (granularity === "day") return dateStr;
  if (granularity === "year") return isoDate(new Date(Date.UTC(y, 0, 1)));
  if (granularity === "week") {
    const dayOfWeek = d.getUTCDay(); // 0 = Sunday .. 6 = Saturday
    const diffToMonday = (dayOfWeek + 6) % 7;
    return isoDate(new Date(Date.UTC(y, m, d.getUTCDate() - diffToMonday)));
  }
  return isoDate(new Date(Date.UTC(y, m, 1)));
}

function stepDate(d: Date, granularity: Granularity, amount: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  if (granularity === "day") return new Date(Date.UTC(y, m, day + amount));
  if (granularity === "week") return new Date(Date.UTC(y, m, day + amount * 7));
  if (granularity === "year") return new Date(Date.UTC(y + amount, m, day));
  return new Date(Date.UTC(y, m + amount, day));
}

function monthKeyOffset(offsetMonths: number, from = new Date()): string {
  const d = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + offsetMonths, 1),
  );
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function billMonthKey(bill: DemoBill): string | null {
  if (!bill.issue_date) return null;
  return bill.issue_date.slice(0, 7);
}

function filterBills(
  bills: DemoBill[],
  params: {
    startDate?: string;
    endDate?: string;
    vendorId?: string;
    categoryId?: string;
  },
): DemoBill[] {
  return bills.filter((b) => {
    if (params.startDate && (!b.issue_date || b.issue_date < params.startDate))
      return false;
    if (params.endDate && (!b.issue_date || b.issue_date > params.endDate))
      return false;
    if (params.vendorId && b.vendor_id !== params.vendorId) return false;
    if (params.categoryId && b.category_id !== params.categoryId) return false;
    return true;
  });
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next === undefined
    ? sorted[base]
    : sorted[base] + rest * (next - sorted[base]);
}

function recurringFrom(store: Store, bills: DemoBill[]): RecurringVendor[] {
  const byVendor = groupBy(bills, (b) => b.vendor_id);
  const rows: RecurringVendor[] = [];
  for (const [vendorId, vendorBills] of byVendor) {
    if (vendorBills.length < 2) continue;
    const amounts = vendorBills.map((b) => b.total_amount ?? 0);
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const withinTenPct = amounts.every(
      (a) => Math.abs(a - avg) / (avg || 1) <= 0.5,
    );
    if (!withinTenPct) continue;
    const lastDate = vendorBills
      .map((b) => b.issue_date)
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1);
    rows.push({
      vendor_name: vendorName(store, vendorId) ?? "Unknown vendor",
      avg_amount: money(avg),
      frequency: vendorBills.length,
      last_bill_date: lastDate ?? "",
    });
  }
  return topN(rows, 10, (r) => r.frequency);
}

function monthOverMonth(
  bills: DemoBill[],
  keyFn: (bill: DemoBill) => string,
): MonthOverMonthRow[] {
  const currentKey = monthKeyOffset(0);
  const previousKey = monthKeyOffset(-1);
  const byGroup = groupBy(bills, keyFn);
  return [...byGroup.entries()].map(([name, groupBills]) => {
    const current = sumAmount(
      groupBills.filter((b) => billMonthKey(b) === currentKey),
    );
    const previous = sumAmount(
      groupBills.filter((b) => billMonthKey(b) === previousKey),
    );
    const deltaPct =
      previous > 0 ? ((current - previous) / previous) * 100 : null;
    return {
      name,
      current_month: money(current),
      previous_month: money(previous),
      delta_pct: deltaPct == null ? null : pct(deltaPct),
    };
  });
}

// ---- Overview ---------------------------------------------------------------

export function computeOverview(params?: {
  granularity?: Granularity;
  months?: number;
}): OverviewResponse {
  const store = getStore();
  const granularity = params?.granularity ?? "month";
  const points = params?.months ?? 6;

  const currentKey = monthKeyOffset(0);
  const previousKey = monthKeyOffset(-1);
  const currentBills = store.bills.filter(
    (b) => billMonthKey(b) === currentKey,
  );
  const previousBills = store.bills.filter(
    (b) => billMonthKey(b) === previousKey,
  );
  const currentTotal = sumAmount(currentBills);
  const previousTotal = sumAmount(previousBills);
  const deltaPct =
    previousTotal > 0
      ? ((currentTotal - previousTotal) / previousTotal) * 100
      : null;

  const billsWithElicitation = new Set(
    store.elicitations.map((e) => e.bill_id),
  );
  const autoResolvedRate =
    store.bills.length > 0
      ? ((store.bills.length - billsWithElicitation.size) /
          store.bills.length) *
        100
      : 0;

  const kpis: OverviewKPIs = {
    total_spent_current_month: money(currentTotal),
    total_spent_previous_month: money(previousTotal),
    spend_delta_pct: deltaPct == null ? null : pct(deltaPct),
    bills_processed_current_month: currentBills.length,
    pending_elicitations: store.elicitations.filter(
      (e) => e.status === "pending",
    ).length,
    auto_resolved_rate: pct(autoResolvedRate),
    total_bills: store.bills.length,
  };

  // Buckets by the actual requested granularity (day/week/month/year), not always by whole
  // months relabeled to look like the other granularities - an earlier version always stepped
  // by month here regardless of `granularity`, so switching the chart to "day" or "week" just
  // showed the same monthly totals mislabeled as if they were daily/weekly ones.
  const spending_trend: TrendPoint[] = [];
  const now = new Date();
  for (let i = points - 1; i >= 0; i--) {
    const anchor = stepDate(now, granularity, -i);
    const bucketStart = periodKey(isoDate(anchor), granularity);
    const bucketEnd = isoDate(
      stepDate(new Date(`${bucketStart}T00:00:00Z`), granularity, 1),
    );
    const bucketBills = store.bills.filter(
      (b) =>
        b.issue_date && b.issue_date >= bucketStart && b.issue_date < bucketEnd,
    );
    spending_trend.push({
      period: bucketStart,
      total: money(sumAmount(bucketBills)),
    });
  }

  const byVendor = groupBy(store.bills, (b) => b.vendor_id);
  const top_vendors: VendorSpend[] = topN(
    [...byVendor.entries()].map(([id, bills]) => ({
      vendor_name: vendorName(store, id) ?? "Unknown vendor",
      total: money(sumAmount(bills)),
      _sort: sumAmount(bills),
    })),
    5,
    (r) => r._sort,
  ).map(({ vendor_name, total }) => ({ vendor_name, total }));

  const byCategory = groupBy(
    store.bills,
    (b) => b.category_id ?? "uncategorized",
  );
  const spending_by_category: CategorySpend[] = [...byCategory.entries()].map(
    ([id, bills]) => ({
      category_name:
        id === "uncategorized" ? "Uncategorized" : categoryName(store, id),
      total: money(sumAmount(bills)),
    }),
  );

  const recent_uploads: RecentUpload[] = topN(
    store.bills.filter((b) => b.issue_date),
    8,
    (b) => new Date(b.issue_date as string).getTime(),
  ).map((b) => ({
    bill_id: b.id,
    name: b.name,
    vendor_name: vendorName(store, b.vendor_id),
    total_amount: moneyOrNull(b.total_amount),
    confidence: confidenceOrNull(b.confidence),
    current_stage: b.current_stage,
  }));

  const pending_questions: PendingQuestion[] = store.elicitations
    .filter((e) => e.status === "pending")
    .slice(0, 5)
    .map((e) => pendingQuestionFrom(store, e));

  return {
    kpis,
    spending_trend,
    top_vendors,
    spending_by_category,
    recent_uploads,
    pending_questions,
  };
}

function pendingQuestionFrom(
  store: Store,
  e: Store["elicitations"][number],
): PendingQuestion {
  const bill = store.bills.find((b) => b.id === e.bill_id);
  return {
    elicitation_id: e.id,
    bill_id: e.bill_id,
    bill_name: bill?.name ?? "Unknown bill",
    vendor_name: bill ? vendorName(store, bill.vendor_id) : null,
    amount: bill ? moneyOrNull(bill.total_amount) : null,
    question: e.question,
  };
}

// ---- Vendors ------------------------------------------------------------

export function computeVendorsAnalytics(params?: {
  startDate?: string;
  endDate?: string;
  categoryId?: string;
}): VendorsAnalyticsResponse {
  const store = getStore();
  const bills = filterBills(store.bills, params ?? {});
  const total = sumAmount(bills);

  const byVendor = groupBy(bills, (b) => b.vendor_id);
  const spendRows = [...byVendor.entries()].map(([id, vendorBills]) => ({
    id,
    name: vendorName(store, id) ?? "Unknown vendor",
    total: sumAmount(vendorBills),
    count: vendorBills.length,
  }));

  const top3 = topN(spendRows, 3, (r) => r.total);
  const top3Total = top3.reduce((acc, r) => acc + r.total, 0);
  const topVendor = topN(spendRows, 1, (r) => r.total)[0];

  const currentKey = monthKeyOffset(0);
  const firstBillMonthByVendor = new Map<string, string>();
  for (const b of store.bills) {
    if (!b.vendor_id || !b.issue_date) continue;
    const key = billMonthKey(b) as string;
    const prev = firstBillMonthByVendor.get(b.vendor_id);
    if (!prev || key < prev) firstBillMonthByVendor.set(b.vendor_id, key);
  }
  const newVendorsThisMonth = [...firstBillMonthByVendor.values()].filter(
    (k) => k === currentKey,
  ).length;

  const kpis: VendorsKPIs = {
    total_vendors: store.vendors.length,
    top_vendor_name: topVendor?.name ?? null,
    top_vendor_total: topVendor ? money(topVendor.total) : null,
    new_vendors_this_month: newVendorsThisMonth,
    vendor_concentration_pct: pct(total > 0 ? (top3Total / total) * 100 : 0),
  };

  const top_vendors_by_spend: VendorSpendBar[] = topN(
    spendRows,
    10,
    (r) => r.total,
  ).map((r) => ({ vendor_name: r.name, total: money(r.total) }));
  const top_vendors_by_frequency: VendorFrequencyBar[] = topN(
    spendRows,
    10,
    (r) => r.count,
  ).map((r) => ({ vendor_name: r.name, bill_count: r.count }));

  const byMonth = groupBy(
    [...firstBillMonthByVendor.entries()],
    ([, month]) => month,
  );
  const new_vendors_over_time: NewVendorsPoint[] = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, rows]) => ({ period, count: rows.length }));

  const recurring_vendors = recurringFrom(store, bills);

  const vendor_table: VendorTableRow[] = store.vendors.map((v) => {
    const vendorBills = bills.filter((b) => b.vendor_id === v.id);
    const vendorTotal = sumAmount(vendorBills);
    const byCat = groupBy(vendorBills, (b) => b.category_id);
    const mostFrequentCat = topN(
      [...byCat.entries()].map(([id, rows]) => ({ id, count: rows.length })),
      1,
      (r) => r.count,
    )[0];
    const lastBill = vendorBills
      .map((b) => b.issue_date)
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1);
    return {
      vendor_id: v.id,
      name: v.name,
      key: v.key,
      bill_count: vendorBills.length,
      total_spent: money(vendorTotal),
      avg_bill_amount: money(
        vendorBills.length > 0 ? vendorTotal / vendorBills.length : 0,
      ),
      last_bill_date: lastBill ?? null,
      most_frequent_category: mostFrequentCat
        ? categoryName(store, mostFrequentCat.id)
        : null,
    };
  });

  return {
    kpis,
    top_vendors_by_spend,
    top_vendors_by_frequency,
    new_vendors_over_time,
    recurring_vendors,
    vendor_table,
  };
}

export function computeVendorDetail(vendorId: string): VendorDetailResponse {
  const store = getStore();
  const vendor = store.vendors.find((v) => v.id === vendorId);
  if (!vendor) throw new ApiError("Vendor not found.", 404);

  const bills = store.bills.filter((b) => b.vendor_id === vendorId);
  const total = sumAmount(bills);

  const byMonth = groupBy(bills, (b) => billMonthKey(b));
  const spending_trend: VendorSpendingTrendPoint[] = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, rows]) => ({ period, total: money(sumAmount(rows)) }));

  const bills_history: VendorBillHistoryRow[] = [...bills]
    .sort((a, b) => (b.issue_date ?? "").localeCompare(a.issue_date ?? ""))
    .map((b) => ({
      bill_id: b.id,
      name: b.name,
      total_amount: moneyOrNull(b.total_amount),
      issue_date: b.issue_date,
      status: b.status,
      confidence: confidenceOrNull(b.confidence),
    }));

  return {
    vendor_id: vendor.id,
    name: vendor.name,
    address: vendor.address,
    total_spent: money(total),
    bill_count: bills.length,
    avg_bill_amount: money(bills.length > 0 ? total / bills.length : 0),
    spending_trend,
    bills_history,
  };
}

// ---- Categories -----------------------------------------------------------

export function computeCategoriesAnalytics(params?: {
  startDate?: string;
  endDate?: string;
}): CategoriesAnalyticsResponse {
  const store = getStore();
  const bills = filterBills(store.bills, params ?? {});
  const total = sumAmount(bills);

  const byCategory = groupBy(bills, (b) => b.category_id ?? "uncategorized");
  const catRows = [...byCategory.entries()].map(([id, rows]) => ({
    id,
    name: id === "uncategorized" ? "Uncategorized" : categoryName(store, id),
    total: sumAmount(rows),
    count: rows.length,
  }));
  const mostExpensive = topN(catRows, 1, (r) => r.total)[0];

  const otherCategory = store.categories.find((c) => c.slug === "other");
  const otherTotal = otherCategory
    ? sumAmount(bills.filter((b) => b.category_id === otherCategory.id))
    : 0;

  const kpis: CategoriesKPIs = {
    total_categories: store.categories.length,
    most_expensive_category_name: mostExpensive?.name ?? null,
    most_expensive_category_total: mostExpensive
      ? money(mostExpensive.total)
      : null,
    uncategorized_bills_count: bills.filter((b) => !b.category_id).length,
    other_rate: pct(total > 0 ? (otherTotal / total) * 100 : 0),
  };

  const spend_by_category: CategorySpendBar[] = topN(
    catRows,
    20,
    (r) => r.total,
  ).map((r) => ({ category_name: r.name, total: money(r.total) }));
  const bill_count_by_category: CategoryCount[] = catRows.map((r) => ({
    category_name: r.name,
    bill_count: r.count,
  }));

  const byMonthCat = groupBy(bills, (b) => {
    const month = billMonthKey(b);
    return month ? `${month}::${b.category_id ?? "uncategorized"}` : null;
  });
  const category_evolution: CategoryEvolutionPoint[] = [...byMonthCat.entries()]
    .map(([key, rows]) => {
      const [period, catId] = key.split("::");
      return {
        period,
        category_name:
          catId === "uncategorized"
            ? "Uncategorized"
            : categoryName(store, catId),
        total: money(sumAmount(rows)),
      };
    })
    .sort((a, b) => a.period.localeCompare(b.period));

  const byMonth = groupBy(bills, (b) => billMonthKey(b));
  const uncategorized_trend: UncategorizedTrendPoint[] = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, rows]) => {
      const uncategorized = rows.filter((b) => !b.category_id);
      return {
        period,
        count: uncategorized.length,
        total: money(sumAmount(uncategorized)),
      };
    });

  const other_rate_trend: OtherRateTrendPoint[] = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, rows]) => {
      const monthTotal = sumAmount(rows);
      const monthOther = sumAmount(
        rows.filter((b) => otherCategory && b.category_id === otherCategory.id),
      );
      return {
        period,
        other_rate: pct(monthTotal > 0 ? (monthOther / monthTotal) * 100 : 0),
      };
    });

  const category_table: CategoryTableRow[] = store.categories.map((c) => {
    const catBills = bills.filter((b) => b.category_id === c.id);
    const catTotal = sumAmount(catBills);
    return {
      category_id: c.id,
      name: c.name,
      bill_count: catBills.length,
      total_spent: money(catTotal),
      avg_bill_amount: money(
        catBills.length > 0 ? catTotal / catBills.length : 0,
      ),
      pct_of_total_spend: pct(total > 0 ? (catTotal / total) * 100 : 0),
    };
  });

  return {
    kpis,
    spend_by_category,
    bill_count_by_category,
    category_evolution,
    uncategorized_trend,
    other_rate_trend,
    category_table,
  };
}

// ---- Line items -------------------------------------------------------------

function lineItemTableRow(store: Store, li: DemoLineItem): LineItemTableRow {
  const bill = store.bills.find((b) => b.id === li.bill_id);
  return {
    line_item_id: li.id,
    bill_id: li.bill_id,
    bill_name: bill?.name ?? "Unknown bill",
    description: li.description,
    common_name: li.common_name,
    quantity: li.quantity == null ? null : String(li.quantity),
    unit_price: li.unit_price == null ? null : money(li.unit_price),
    line_total: money(li.line_total),
    vendor_name: bill ? vendorName(store, bill.vendor_id) : null,
    category_name: li.category_id ? categoryName(store, li.category_id) : null,
  };
}

export function computeLineItemsAnalytics(params?: {
  vendorId?: string;
  categoryId?: string;
}): LineItemsAnalyticsResponse {
  const store = getStore();

  const byCommonName = groupBy(store.lineItems, (li) => li.common_name);
  const freqRows = [...byCommonName.entries()].map(([name, rows]) => ({
    name,
    count: rows.length,
    total: rows.reduce((acc, li) => acc + li.line_total, 0),
  }));
  const mostPurchased = topN(freqRows, 1, (r) => r.count)[0];

  const kpis: LineItemsKPIs = {
    total_line_items: store.lineItems.length,
    most_purchased_item_name: mostPurchased?.name ?? null,
    most_purchased_item_count: mostPurchased?.count ?? null,
    categorization_gap_pct: pct(
      store.lineItems.length > 0
        ? (store.lineItems.filter((li) => !li.category_id).length /
            store.lineItems.length) *
            100
        : 0,
    ),
  };

  const most_frequent_items: ItemFrequency[] = topN(
    freqRows,
    10,
    (r) => r.count,
  ).map((r) => ({ common_name: r.name, count: r.count }));
  const top_items_by_spend: ItemSpend[] = topN(
    freqRows,
    10,
    (r) => r.total,
  ).map((r) => ({ common_name: r.name, total: money(r.total) }));

  const byNameMonth = groupBy(store.lineItems, (li) => {
    const bill = store.bills.find((b) => b.id === li.bill_id);
    const month = bill ? billMonthKey(bill) : null;
    return li.common_name && month ? `${li.common_name}::${month}` : null;
  });
  const unit_price_trend: UnitPriceTrendPoint[] = [...byNameMonth.entries()]
    .map(([key, rows]) => {
      const [common_name, period] = key.split("::");
      const prices = rows
        .map((r) => r.unit_price)
        .filter((p): p is number => p != null);
      const avg =
        prices.length > 0
          ? prices.reduce((a, b) => a + b, 0) / prices.length
          : 0;
      return { common_name, period, avg_unit_price: money(avg) };
    })
    .sort((a, b) => a.period.localeCompare(b.period));

  let lineItemRows = store.lineItems;
  if (params?.categoryId) {
    lineItemRows = lineItemRows.filter(
      (li) => li.category_id === params.categoryId,
    );
  }
  if (params?.vendorId) {
    lineItemRows = lineItemRows.filter((li) => {
      const bill = store.bills.find((b) => b.id === li.bill_id);
      return bill?.vendor_id === params.vendorId;
    });
  }
  const line_item_table: LineItemTableRow[] = lineItemRows.map((li) =>
    lineItemTableRow(store, li),
  );

  return {
    kpis,
    most_frequent_items,
    top_items_by_spend,
    unit_price_trend,
    line_item_table,
  };
}

export function computeCategoryTree(): CategoryTreeResponse {
  const store = getStore();
  const total = store.lineItems.reduce((acc, li) => acc + li.line_total, 0);

  const categoryTotals = store.categories.map((cat) => {
    const items = store.lineItems.filter((li) => li.category_id === cat.id);
    const catTotal = items.reduce((acc, li) => acc + li.line_total, 0);
    const bySub = groupBy(items, (li) => li.subcategory_name ?? "Non classé");
    const children: CategoryTreeNode[] = [...bySub.entries()].map(
      ([subName, rows]) => {
        const subTotal = rows.reduce((acc, li) => acc + li.line_total, 0);
        return {
          id: subName === "Non classé" ? null : `${cat.id}::${subName}`,
          name: subName,
          total: money(subTotal),
          pct_of_parent: pct(catTotal > 0 ? (subTotal / catTotal) * 100 : 0),
          children: [],
        };
      },
    );
    const node: CategoryTreeNode = {
      id: cat.id,
      name: cat.name,
      total: money(catTotal),
      pct_of_parent: pct(total > 0 ? (catTotal / total) * 100 : 0),
      children,
    };
    return { catTotal, node };
  });
  const categoryNodes: CategoryTreeNode[] = categoryTotals
    .filter((entry) => entry.catTotal > 0)
    .map((entry) => entry.node);

  return {
    root: {
      id: null,
      name: "Total",
      total: money(total),
      pct_of_parent: "100.00",
      children: categoryNodes,
    },
  };
}

export function computeLineItemsForSubcategory(
  subcategoryId: string,
): SubcategoryLineItemRow[] {
  const store = getStore();
  const [catId, subName] = subcategoryId.split("::");
  const items = store.lineItems.filter((li) => {
    if (li.category_id !== catId) return false;
    const name = li.subcategory_name ?? "Non classé";
    return subName ? name === subName : true;
  });
  return items.map((li) => ({
    ...lineItemTableRow(store, li),
    subcategory_name: li.subcategory_name ?? "Non classé",
  }));
}

// ---- Elicitations -----------------------------------------------------------

export function computeElicitationsAnalytics(): ElicitationsAnalyticsResponse {
  const store = getStore();
  const pending = store.elicitations.filter((e) => e.status === "pending");
  const answered = store.elicitations.filter((e) => e.status === "answered");
  const expired = store.elicitations.filter((e) => e.status === "expired");

  const confidences = store.bills
    .map((b) => b.confidence)
    .filter((c): c is number => c != null);
  const avgConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : null;

  const kpis: ElicitationsKPIs = {
    pending_count: pending.length,
    answered_count: answered.length,
    expired_count: expired.length,
    expiration_rate: pct(
      store.elicitations.length > 0
        ? (expired.length / store.elicitations.length) * 100
        : 0,
    ),
    avg_confidence: confidenceOrNull(avgConfidence),
    uncategorized_bills_count: store.bills.filter((b) => !b.category_id).length,
  };

  const byMonth = groupBy(store.elicitations, (e) => {
    const bill = store.bills.find((b) => b.id === e.bill_id);
    return bill ? billMonthKey(bill) : null;
  });
  const elicitation_rate_over_time: ElicitationRatePoint[] = [
    ...byMonth.entries(),
  ]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, rows]) => ({ period, count: rows.length }));

  const byStage = groupBy(store.elicitations, (e) => e.stage);
  const elicitations_by_stage: ElicitationsByStage[] = [
    ...byStage.entries(),
  ].map(([stage, rows]) => ({ stage, count: rows.length }));

  const pending_questions: PendingQuestion[] = pending.map((e) =>
    pendingQuestionFrom(store, e),
  );

  return {
    kpis,
    elicitation_rate_over_time,
    elicitations_by_stage,
    pending_questions,
  };
}

// ---- Agent insights -----------------------------------------------------------

export function computeAgentInsights(): AgentInsightsResponse {
  const store = getStore();
  const confidences = store.bills
    .map((b) => b.confidence)
    .filter((c): c is number => c != null);
  const avgConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : null;

  const billsWithElicitation = new Set(
    store.elicitations.map((e) => e.bill_id),
  );
  const autoResolvedRate =
    store.bills.length > 0
      ? ((store.bills.length - billsWithElicitation.size) /
          store.bills.length) *
        100
      : 0;
  const ocrBills = store.bills.filter(
    (b) => b.extraction_strategy === "ocr_preprocessing",
  );

  const kpis: AgentInsightsKPIs = {
    avg_confidence: confidenceOrNull(avgConfidence),
    auto_resolved_rate: pct(autoResolvedRate),
    ocr_rate: pct(
      store.bills.length > 0 ? (ocrBills.length / store.bills.length) * 100 : 0,
    ),
    bills_in_backlog: store.bills.filter((b) => b.current_stage !== "complete")
      .length,
  };

  const byMonth = groupBy(store.bills, (b) => billMonthKey(b));
  const confidence_trend: ConfidenceTrendPoint[] = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, rows]) => {
      const cs = rows
        .map((b) => b.confidence)
        .filter((c): c is number => c != null);
      const avg =
        cs.length > 0 ? cs.reduce((a, b) => a + b, 0) / cs.length : null;
      return { period, avg_confidence: confidenceOrNull(avg) };
    });

  const byCategory = groupBy(
    store.bills,
    (b) => b.category_id ?? "uncategorized",
  );
  const confidence_by_category: ConfidenceByCategory[] = [
    ...byCategory.entries(),
  ].map(([id, rows]) => {
    const cs = rows
      .map((b) => b.confidence)
      .filter((c): c is number => c != null);
    const avg =
      cs.length > 0 ? cs.reduce((a, b) => a + b, 0) / cs.length : null;
    return {
      category_name:
        id === "uncategorized" ? "Uncategorized" : categoryName(store, id),
      avg_confidence: confidenceOrNull(avg),
      bill_count: rows.length,
    };
  });

  const byStrategy = groupBy(store.bills, (b) => b.extraction_strategy);
  const extraction_strategy_effectiveness: ExtractionStrategyConfidence[] = [
    ...byStrategy.entries(),
  ].map(([strategy, rows]) => {
    const cs = rows
      .map((b) => b.confidence)
      .filter((c): c is number => c != null);
    const avg =
      cs.length > 0 ? cs.reduce((a, b) => a + b, 0) / cs.length : null;
    return {
      extraction_strategy: strategy,
      avg_confidence: confidenceOrNull(avg),
      bill_count: rows.length,
    };
  });

  return {
    kpis,
    confidence_trend,
    confidence_by_category,
    extraction_strategy_effectiveness,
  };
}

// ---- Spend --------------------------------------------------------------------

export function computeSpendAnalytics(params?: {
  startDate?: string;
  endDate?: string;
  vendorId?: string;
  categoryId?: string;
  granularity?: Granularity;
}): SpendAnalyticsResponse {
  const store = getStore();
  const granularity = params?.granularity ?? "month";
  const bills = filterBills(store.bills, params ?? {});
  const total = sumAmount(bills);
  const topBill = topN(bills, 1, (b) => b.total_amount ?? 0)[0];

  const kpis: SpendKPIs = {
    total_spent: money(total),
    bills_count: bills.length,
    average_bill_amount: money(bills.length > 0 ? total / bills.length : 0),
    highest_bill_amount: topBill ? moneyOrNull(topBill.total_amount) : null,
    highest_bill_vendor_name: topBill
      ? vendorName(store, topBill.vendor_id)
      : null,
  };

  const byPeriod = groupBy(
    bills.filter((b) => b.issue_date),
    (b) => periodKey(b.issue_date as string, granularity),
  );
  const spending_trend: TrendPoint[] = [...byPeriod.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, rows]) => ({ period, total: money(sumAmount(rows)) }));

  const byMonthCat = groupBy(
    bills.filter((b) => b.issue_date),
    (b) => `${billMonthKey(b)}::${b.category_id ?? "uncategorized"}`,
  );
  const category_evolution: CategoryEvolutionPoint[] = [...byMonthCat.entries()]
    .map(([key, rows]) => {
      const [period, catId] = key.split("::");
      return {
        period,
        category_name:
          catId === "uncategorized"
            ? "Uncategorized"
            : categoryName(store, catId),
        total: money(sumAmount(rows)),
      };
    })
    .sort((a, b) => a.period.localeCompare(b.period));

  const byVendor = groupBy(bills, (b) => b.vendor_id);
  const top5VendorIds = topN(
    [...byVendor.entries()].map(([id, rows]) => ({
      id,
      total: sumAmount(rows),
    })),
    5,
    (r) => r.total,
  ).map((r) => r.id);
  const byMonthVendor = groupBy(
    bills.filter(
      (b) => b.vendor_id && top5VendorIds.includes(b.vendor_id) && b.issue_date,
    ),
    (b) => `${billMonthKey(b)}::${b.vendor_id}`,
  );
  const vendor_evolution: VendorEvolutionPoint[] = [...byMonthVendor.entries()]
    .map(([key, rows]) => {
      const [period, vendorId] = key.split("::");
      return {
        period,
        vendor_name: vendorName(store, vendorId) ?? "Unknown vendor",
        total: money(sumAmount(rows)),
      };
    })
    .sort((a, b) => a.period.localeCompare(b.period));

  const currentYear = new Date().getUTCFullYear();
  const byDate = groupBy(
    bills.filter(
      (b) => b.issue_date && b.issue_date.startsWith(String(currentYear)),
    ),
    (b) => b.issue_date,
  );
  const spending_heatmap: CalendarHeatmapCell[] = [...byDate.entries()].map(
    ([date, rows]) => ({ date, total: money(sumAmount(rows)) }),
  );

  const buckets: [number, number][] = [
    [0, 25],
    [25, 50],
    [50, 100],
    [100, 200],
    [200, 500],
    [500, Infinity],
  ];
  const bill_size_distribution: BillSizeHistogramBucket[] = buckets.map(
    ([start, end]) => ({
      range_start: money(start),
      range_end: Number.isFinite(end) ? money(end) : "∞",
      count: bills.filter(
        (b) => (b.total_amount ?? 0) >= start && (b.total_amount ?? 0) < end,
      ).length,
    }),
  );

  const daysInMonth = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0),
  ).getUTCDate();
  const currentKey = monthKeyOffset(0);
  const previousKey = monthKeyOffset(-1);
  const spending_velocity: VelocityPoint[] = [];
  let cumCurrent = 0;
  let cumPrevious = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, "0");
    cumCurrent += sumAmount(
      store.bills.filter((b) => b.issue_date === `${currentKey}-${dayStr}`),
    );
    cumPrevious += sumAmount(
      store.bills.filter((b) => b.issue_date === `${previousKey}-${dayStr}`),
    );
    spending_velocity.push({
      day_of_month: day,
      cumulative_current_month: money(cumCurrent),
      cumulative_previous_month: money(cumPrevious),
    });
  }

  const byMonthForBoxplot = groupBy(
    bills.filter((b) => b.issue_date),
    (b) => billMonthKey(b),
  );
  const spending_boxplot: BoxplotStats[] = [...byMonthForBoxplot.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, rows]) => {
      const sorted = rows.map((r) => r.total_amount ?? 0).sort((a, b) => a - b);
      return {
        month,
        min: money(sorted[0] ?? 0),
        q1: money(quantile(sorted, 0.25)),
        median: money(quantile(sorted, 0.5)),
        q3: money(quantile(sorted, 0.75)),
        max: money(sorted.at(-1) ?? 0),
      };
    });

  const byCategoryAll = groupBy(bills, (b) => b.category_id ?? "uncategorized");
  const spending_by_category: CategorySpend[] = [
    ...byCategoryAll.entries(),
  ].map(([id, rows]) => ({
    category_name:
      id === "uncategorized" ? "Uncategorized" : categoryName(store, id),
    total: money(sumAmount(rows)),
  }));

  const top_vendors: VendorSpend[] = topN(
    [...byVendor.entries()].map(([id, rows]) => ({
      vendor_name: vendorName(store, id) ?? "Unknown vendor",
      total: money(sumAmount(rows)),
      _sort: sumAmount(rows),
    })),
    5,
    (r) => r._sort,
  ).map(({ vendor_name, total }) => ({ vendor_name, total }));

  const byPaymentStatus = groupBy(bills, (b) => b.payment_status);
  const payment_status_breakdown: PaymentStatusBreakdown[] = [
    ...byPaymentStatus.entries(),
  ].map(([status, rows]) => ({
    payment_status: status,
    total: money(sumAmount(rows)),
    count: rows.length,
  }));

  const byDocType = groupBy(bills, (b) => b.document_type ?? "unknown");
  const spend_by_document_type: DocumentTypeSpend[] = [
    ...byDocType.entries(),
  ].map(([type, rows]) => ({
    document_type: type,
    total: money(sumAmount(rows)),
  }));

  const recurring_bills: RecurringBill[] = recurringFrom(store, bills);

  const outlierCandidates = bills
    .filter((b) => b.vendor_id && b.total_amount != null)
    .map((b) => {
      const vendorBills = bills.filter(
        (v) => v.vendor_id === b.vendor_id && v.id !== b.id,
      );
      const avg =
        vendorBills.length > 0
          ? sumAmount(vendorBills) / vendorBills.length
          : (b.total_amount ?? 0);
      const deviation = avg > 0 ? (b.total_amount ?? 0) / avg : 1;
      const row: Outlier = {
        bill_id: b.id,
        bill_name: b.name,
        vendor_name: vendorName(store, b.vendor_id) ?? "Unknown vendor",
        total_amount: money(b.total_amount),
        vendor_average: money(avg),
        deviation_ratio: deviation.toFixed(2),
      };
      return { deviationDelta: Math.abs(deviation - 1), row };
    });
  const outliers: Outlier[] = topN(
    outlierCandidates,
    5,
    (r) => r.deviationDelta,
  ).map((entry) => entry.row);

  const month_over_month_by_category = monthOverMonth(bills, (b) =>
    categoryName(store, b.category_id),
  );
  const month_over_month_by_vendor = monthOverMonth(
    bills,
    (b) => vendorName(store, b.vendor_id) ?? "Unknown vendor",
  );

  return {
    kpis,
    spending_trend,
    category_evolution,
    vendor_evolution,
    spending_heatmap,
    bill_size_distribution,
    spending_velocity,
    spending_boxplot,
    spending_by_category,
    top_vendors,
    payment_status_breakdown,
    spend_by_document_type,
    recurring_bills,
    outliers,
    month_over_month_by_category,
    month_over_month_by_vendor,
  };
}

export function computeCategoryMomentum(params?: {
  startDate?: string;
  endDate?: string;
  granularity?: Granularity;
  vendorId?: string;
  categoryId?: string;
}): CategoryMomentumResponse {
  const store = getStore();
  const granularity = params?.granularity ?? "month";
  const bills = filterBills(store.bills, params ?? {});

  const byPeriodCat = groupBy(
    bills.filter((b) => b.issue_date),
    (b) =>
      `${periodKey(b.issue_date as string, granularity)}::${b.category_id ?? "uncategorized"}`,
  );
  const points: CategoryEvolutionPoint[] = [...byPeriodCat.entries()]
    .map(([key, rows]) => {
      const [period, catId] = key.split("::");
      return {
        period,
        category_name:
          catId === "uncategorized"
            ? "Uncategorized"
            : categoryName(store, catId),
        total: money(sumAmount(rows)),
      };
    })
    .sort((a, b) => a.period.localeCompare(b.period));

  return { points };
}
