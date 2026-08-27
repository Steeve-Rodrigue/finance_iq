"use client";

import { PieChart } from "lucide-react";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/dashboard/page-header";
import { SectionHeader } from "@/components/dashboard/section-header";
import { BillCountByCategoryChart } from "@/components/dashboard/categories/bill-count-by-category-chart";
import { CategoriesKpiTiles } from "@/components/dashboard/categories/kpi-tiles";
import { CategoriesSkeleton } from "@/components/dashboard/categories/categories-skeleton";
import { CategoryEvolutionChart } from "@/components/dashboard/categories/category-evolution-chart";
import { CategoryFilters } from "@/components/dashboard/categories/category-filters";
import { CategoryTable } from "@/components/dashboard/categories/category-table";
import { SpendByCategoryChart } from "@/components/dashboard/categories/spend-by-category-chart";
import {
  ApiError,
  getCategoriesAnalytics,
  type CategoriesAnalyticsResponse,
} from "@/lib/api";
import { getToken } from "@/lib/auth";

export default function CategoriesPage() {
  const [data, setData] = useState<CategoriesAnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  // Bumped after a category create/edit/delete to force the refetch effect below to re-run
  // without duplicating its fetch logic - the effect's dependency array, not a separate
  // function. Same pattern as vendors/page.tsx's refreshKey.
  const [refreshKey, setRefreshKey] = useState(0);

  // Re-runs on every filter change, not just on mount - startDate/endDate are effect deps.
  // setRefreshing(true) runs inside this first .then, not synchronously in the effect body,
  // so it's a reaction to the fetch starting rather than a direct effect-body setState call
  // (same pattern as Overview's trendLoading). Existing `data` is left in place during a
  // filter-triggered refetch so the page dims instead of flashing back to skeleton.
  useEffect(() => {
    const token = getToken(); // app/dashboard/layout.tsx's auth guard already ensures this
    if (!token) return; // exists by the time this page mounts.
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (!cancelled) setRefreshing(true);
      })
      .then(() =>
        getCategoriesAnalytics(token, {
          startDate: startDate || undefined,
          endDate: endDate || undefined,
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
          err instanceof ApiError ? err.message : "Failed to load categories.",
        );
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, refreshKey]);

  if (error) {
    // Not ComingSoon - its "coming soon" copy would misrepresent a real fetch failure as an
    // unbuilt feature.
    return (
      <p className="text-sm text-destructive">
        Couldn&apos;t load categories: {error}
      </p>
    );
  }

  if (!data) return <CategoriesSkeleton />;

  return (
    <div className="flex flex-col gap-6 pt-4">
      <PageHeader
        icon={PieChart}
        title="Categories"
        description="How your spend is sorted"
      />
      <CategoryFilters
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onClear={() => {
          setStartDate("");
          setEndDate("");
        }}
      />
      <div
        className="flex flex-col gap-6 transition-opacity"
        style={{ opacity: refreshing ? 0.6 : 1 }}
      >
        <SectionHeader title="Key metrics" className="-mb-3" />
        <CategoriesKpiTiles kpis={data.kpis} />
        <SectionHeader title="Category table" className="-mt-2 -mb-3 md:mt-0" />
        <CategoryTable
          rows={data.category_table}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
        <SectionHeader title="Charts" className="-mt-2 -mb-3 md:mt-0" />
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-4">
          <SpendByCategoryChart data={data.spend_by_category} />
          <BillCountByCategoryChart data={data.bill_count_by_category} />
        </div>
        <CategoryEvolutionChart data={data.category_evolution} />
      </div>
    </div>
  );
}
