"use client";

import { Store } from "lucide-react";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/dashboard/page-header";
import { SectionHeader } from "@/components/dashboard/section-header";
import { VendorsKpiTiles } from "@/components/dashboard/vendors/kpi-tiles";
import { TopVendorsFrequencyChart } from "@/components/dashboard/vendors/top-vendors-frequency-chart";
import { TopVendorsSpendChart } from "@/components/dashboard/vendors/top-vendors-spend-chart";
import { VendorFilters } from "@/components/dashboard/vendors/vendor-filters";
import { VendorTable } from "@/components/dashboard/vendors/vendor-table";
import { VendorsSkeleton } from "@/components/dashboard/vendors/vendors-skeleton";
import {
  ApiError,
  type CategoryRead,
  getCategories,
  getVendorsAnalytics,
  type VendorsAnalyticsResponse,
} from "@/lib/api";
import { getToken } from "@/lib/auth";

export default function VendorsPage() {
  const [data, setData] = useState<VendorsAnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState<CategoryRead[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [categoryId, setCategoryId] = useState("");
  // Bumped after a vendor edit/delete to force the refetch effect below to re-run without
  // duplicating its fetch logic - the effect's dependency array, not a separate function.
  const [refreshKey, setRefreshKey] = useState(0);

  // Category dropdown options - fetched once, independent of the vendors data/filter refetch
  // below. A failure here just leaves the dropdown at "All categories" rather than blocking
  // the page, since it's not essential to viewing vendor data.
  useEffect(() => {
    const token = getToken(); // app/dashboard/layout.tsx's auth guard already ensures this
    if (!token) return; // exists by the time this page mounts.
    let cancelled = false;
    getCategories(token)
      .then((res) => {
        if (!cancelled) setCategories(res);
      })
      .catch(() => {
        // dropdown degrades to "All categories" only - not worth surfacing as a page error
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-runs on every filter change, not just on mount - startDate/endDate/categoryId are
  // effect deps. setRefreshing(true) runs inside this first .then, not synchronously in the
  // effect body, so it's a reaction to the fetch starting rather than a direct effect-body
  // setState call (same pattern as Overview's trendLoading). Existing `data` is left in place
  // during a filter-triggered refetch so the page dims instead of flashing back to skeleton.
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (!cancelled) setRefreshing(true);
      })
      .then(() =>
        getVendorsAnalytics(token, {
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          categoryId: categoryId || undefined,
        }),
      )
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Failed to load vendors.",
        );
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, categoryId, refreshKey]);

  if (error) {
    // Not ComingSoon - its "coming soon" copy would misrepresent a real fetch failure as an
    // unbuilt feature.
    return (
      <p className="text-sm text-destructive">
        Couldn&apos;t load vendors: {error}
      </p>
    );
  }

  if (!data) return <VendorsSkeleton />;

  return (
    <div className="flex flex-col gap-6 pt-4">
      <PageHeader
        icon={Store}
        title="Vendors"
        description="Who you're paying and how much"
      />
      <VendorFilters
        categories={categories}
        startDate={startDate}
        endDate={endDate}
        categoryId={categoryId}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onCategoryChange={setCategoryId}
        onClear={() => {
          setStartDate("");
          setEndDate("");
          setCategoryId("");
        }}
      />
      <div
        className="flex flex-col gap-6 transition-opacity"
        style={{ opacity: refreshing ? 0.6 : 1 }}
      >
        <SectionHeader title="Key metrics" className="-mt-4 -mb-3 md:-mt-1" />
        <VendorsKpiTiles kpis={data.kpis} />
        <SectionHeader title="Vendor table" className="-mt-2 -mb-3 md:mt-0" />
        <VendorTable
          rows={data.vendor_table}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
        <SectionHeader title="Charts" className="-mt-2 -mb-3 md:mt-0" />
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-4">
          <TopVendorsSpendChart data={data.top_vendors_by_spend} />
          <TopVendorsFrequencyChart data={data.top_vendors_by_frequency} />
        </div>
      </div>
    </div>
  );
}
