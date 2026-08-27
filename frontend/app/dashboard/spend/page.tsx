"use client";

import { LineChart } from "lucide-react";
import { useEffect, useState } from "react";

import { CategoryMomentumChart } from "@/components/dashboard/spend/category-momentum-chart";
import { SpendKpiTiles } from "@/components/dashboard/spend/kpi-tiles";
import { MonthOverMonthTable } from "@/components/dashboard/spend/month-over-month-table";
import { OutliersTable } from "@/components/dashboard/spend/outliers-table";
import { SpendAnalyticsSkeleton } from "@/components/dashboard/spend/spend-analytics-skeleton";
import { SpendFilters } from "@/components/dashboard/spend/spend-filters";
import { SpendingBoxplotChart } from "@/components/dashboard/spend/spending-boxplot-chart";
import { SpendingByCategoryChart } from "@/components/dashboard/spend/spending-by-category-chart";
import { SpendingHeatmapChart } from "@/components/dashboard/spend/spending-heatmap-chart";
import { SpendingTrendChart } from "@/components/dashboard/spend/spending-trend-chart";
import { SpendingVelocityChart } from "@/components/dashboard/spend/spending-velocity-chart";
import { TopVendorsChart } from "@/components/dashboard/spend/top-vendors-chart";
import { VendorEvolutionChart } from "@/components/dashboard/spend/vendor-evolution-chart";
import { PageHeader } from "@/components/dashboard/page-header";
import { SectionHeader } from "@/components/dashboard/section-header";
import {
  ApiError,
  getCategories,
  getSpendAnalytics,
  getVendors,
  type CategoryRead,
  type Granularity,
  type SpendAnalyticsResponse,
  type VendorRead,
} from "@/lib/api";
import { getToken } from "@/lib/auth";

// The one filter bar in this app that drives the whole page (KPIs above it + all 12
// charts/tables below), not just a table - see spend-filters.tsx's comment. Sits under the KPI
// tiles rather than above them (unlike every other page's filter bar), since the KPIs read
// like a summary header, not something gated behind the filters.
export default function SpendAnalyticsPage() {
  const [data, setData] = useState<SpendAnalyticsResponse | null>(null);
  const [vendors, setVendors] = useState<VendorRead[]>([]);
  const [categories, setCategories] = useState<CategoryRead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [granularity, setGranularity] = useState<Granularity>("day");

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
        getSpendAnalytics(token, {
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          vendorId: vendorId || undefined,
          categoryId: categoryId || undefined,
          granularity,
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
          err instanceof ApiError
            ? err.message
            : "Failed to load spend analytics.",
        );
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, vendorId, categoryId, granularity]);

  if (error) {
    // Not ComingSoon - its "coming soon" copy would misrepresent a real fetch failure as an
    // unbuilt feature.
    return (
      <p className="text-sm text-destructive">
        Couldn&apos;t load spend analytics: {error}
      </p>
    );
  }

  if (!data) return <SpendAnalyticsSkeleton />;

  return (
    <div className="flex flex-col gap-6 pt-4">
      <PageHeader
        icon={LineChart}
        title="Spend Analytics"
        description="Trends, patterns, and detections across all your bills"
      />
      <div
        className="flex flex-col gap-6 transition-opacity"
        style={{ opacity: refreshing ? 0.6 : 1 }}
      >
        <SectionHeader title="Key metrics" className="-mb-3" />
        <SpendKpiTiles kpis={data.kpis} />

        <SpendFilters
          vendors={vendors}
          categories={categories}
          startDate={startDate}
          endDate={endDate}
          vendorId={vendorId}
          categoryId={categoryId}
          granularity={granularity}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onVendorIdChange={setVendorId}
          onCategoryIdChange={setCategoryId}
          onGranularityChange={setGranularity}
          onClear={() => {
            setStartDate("");
            setEndDate("");
            setVendorId("");
            setCategoryId("");
            setGranularity("day");
          }}
        />

        <SectionHeader title="Trends" className="-mt-2 -mb-3 md:mt-0" />
        <SpendingTrendChart
          data={data.spending_trend}
          granularity={granularity}
        />
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-4">
          <CategoryMomentumChart
            startDate={startDate}
            endDate={endDate}
            granularity={granularity}
            vendorId={vendorId}
            categoryId={categoryId}
          />
          <VendorEvolutionChart
            data={data.vendor_evolution}
            granularity={granularity}
          />
        </div>

        <SectionHeader title="Patterns" className="-mt-2 -mb-3 md:mt-0" />
        <SpendingHeatmapChart data={data.spending_heatmap} />
        <SpendingVelocityChart data={data.spending_velocity} />

        <SectionHeader title="Breakdowns" className="-mt-2 -mb-3 md:mt-0" />
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-4">
          <SpendingByCategoryChart data={data.spending_by_category} />
          <TopVendorsChart data={data.top_vendors} />
        </div>

        <SectionHeader title="Detections" className="-mt-2 -mb-3 md:mt-0" />
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-4">
          <SpendingBoxplotChart data={data.spending_boxplot} />
          <OutliersTable outliers={data.outliers} />
          <MonthOverMonthTable
            title="Month over month, by category"
            nameColumnLabel="Category"
            rows={data.month_over_month_by_category}
          />
          <MonthOverMonthTable
            title="Month over month, by vendor"
            nameColumnLabel="Vendor"
            rows={data.month_over_month_by_vendor}
          />
        </div>
      </div>
    </div>
  );
}
