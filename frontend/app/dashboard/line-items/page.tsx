"use client";

import { ReceiptText } from "lucide-react";
import { useEffect, useState } from "react";

import { LineItemsKpiTiles } from "@/components/dashboard/line-items/kpi-tiles";
import { LineItemsSkeleton } from "@/components/dashboard/line-items/line-items-skeleton";
import { LineItemsTable } from "@/components/dashboard/line-items/line-items-table";
import { MostFrequentItemsChart } from "@/components/dashboard/line-items/most-frequent-items-chart";
import { SpendingCategoryTreeChart } from "@/components/dashboard/line-items/spending-category-tree-chart";
import { SubcategoryLineItemsDialog } from "@/components/dashboard/line-items/subcategory-line-items-dialog";
import { TopItemsBySpendChart } from "@/components/dashboard/line-items/top-items-by-spend-chart";
import { PageHeader } from "@/components/dashboard/page-header";
import { SectionHeader } from "@/components/dashboard/section-header";
import {
  ApiError,
  getCategories,
  getCategoryTree,
  getLineItemsAnalytics,
  getVendors,
  subcategorizeLineItems,
  type CategoryRead,
  type CategoryTreeResponse,
  type LineItemsAnalyticsResponse,
  type VendorRead,
} from "@/lib/api";
import { getToken } from "@/lib/auth";

// vendor_id/category_id only scope `line_item_table` server-side - KPIs and the 2 charts
// below are always computed unfiltered (see lib/api.ts's LineItemsAnalyticsResponse comment).
// Still refetches the whole endpoint on filter change like every other page here, since
// there's only the one endpoint to call - the KPI/chart values just happen to come back
// identical each time.
export default function LineItemsPage() {
  const [data, setData] = useState<LineItemsAnalyticsResponse | null>(null);
  const [tree, setTree] = useState<CategoryTreeResponse | null>(null);
  const [vendors, setVendors] = useState<VendorRead[]>([]);
  const [categories, setCategories] = useState<CategoryRead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedSubcategory, setSelectedSubcategory] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [vendorId, setVendorId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Vendor/category dropdown options - fetched once, independent of the analytics refetch
  // below. A failure here just leaves those dropdowns empty rather than blocking the page.
  useEffect(() => {
    const token = getToken(); // app/dashboard/layout.tsx's auth guard already ensures this
    if (!token) return; // exists by the time this page mounts.
    let cancelled = false;
    Promise.all([getVendors(token), getCategories(token)])
      .then(([v, c]) => {
        if (cancelled) return;
        setVendors(v);
        setCategories(c);
      })
      .catch(() => {
        // dropdowns degrade to empty lists - not worth surfacing as a page error
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (!cancelled) setRefreshing(true);
      })
      .then(() =>
        Promise.all([
          getLineItemsAnalytics(token, {
            vendorId: vendorId || undefined,
            categoryId: categoryId || undefined,
          }),
          getCategoryTree(token),
        ]),
      )
      .then(([analyticsRes, treeRes]) => {
        if (cancelled) return;
        setData(analyticsRes);
        setTree(treeRes);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Failed to load line items.",
        );
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vendorId, categoryId, refreshKey]);

  async function handleGenerateSubcategories() {
    const token = getToken();
    if (!token) return;
    setGenerating(true);
    try {
      await subcategorizeLineItems(token);
      setTree(await getCategoryTree(token));
      setError(null);
    } catch (err: unknown) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to generate sub-categories.",
      );
    } finally {
      setGenerating(false);
    }
  }

  if (error) {
    // Not ComingSoon - its "coming soon" copy would misrepresent a real fetch failure as an
    // unbuilt feature.
    return (
      <p className="text-sm text-destructive">
        Couldn&apos;t load line items: {error}
      </p>
    );
  }

  if (!data) return <LineItemsSkeleton />;

  return (
    <div className="flex flex-col gap-6 pt-4">
      <PageHeader
        icon={ReceiptText}
        title="Line Items"
        description="Every product and service, across every bill"
      />
      <div
        className="flex flex-col gap-6 transition-opacity"
        style={{ opacity: refreshing ? 0.6 : 1 }}
      >
        <SectionHeader title="Key metrics" className="mt-3 -mb-3 md:mt-1" />
        <LineItemsKpiTiles kpis={data.kpis} />
        <SectionHeader title="Charts" className="-mt-2 -mb-3 md:mt-0" />
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-4">
          <MostFrequentItemsChart data={data.most_frequent_items} />
          <TopItemsBySpendChart data={data.top_items_by_spend} />
        </div>
        <SectionHeader
          title="Category breakdown"
          className="-mt-2 -mb-3 md:mt-0"
        />
        <SpendingCategoryTreeChart
          data={tree?.root ?? null}
          onGenerate={handleGenerateSubcategories}
          onSelectSubcategory={(id, name) =>
            setSelectedSubcategory({ id, name })
          }
          generating={generating}
        />
        <SectionHeader title="All items" className="-mt-2 -mb-3 md:mt-0" />
        <LineItemsTable
          rows={data.line_item_table}
          vendors={vendors}
          categories={categories}
          vendorId={vendorId}
          categoryId={categoryId}
          onVendorIdChange={setVendorId}
          onCategoryIdChange={setCategoryId}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      </div>
      {selectedSubcategory && (
        <SubcategoryLineItemsDialog
          subcategoryId={selectedSubcategory.id}
          subcategoryName={selectedSubcategory.name}
          open={selectedSubcategory !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedSubcategory(null);
          }}
        />
      )}
    </div>
  );
}
