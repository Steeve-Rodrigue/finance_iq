"use client";

import { Home } from "lucide-react";
import { useEffect, useState } from "react";

import { KpiTiles } from "@/components/dashboard/overview/kpi-tiles";
import { OverviewSkeleton } from "@/components/dashboard/overview/overview-skeleton";
import { PendingQuestions } from "@/components/dashboard/overview/pending-questions";
import { RecentUploads } from "@/components/dashboard/overview/recent-uploads";
import { SpendingByCategoryChart } from "@/components/dashboard/overview/spending-by-category-chart";
import { SpendingTrendChart } from "@/components/dashboard/overview/spending-trend-chart";
import { TopVendorsChart } from "@/components/dashboard/overview/top-vendors-chart";
import { PageHeader } from "@/components/dashboard/page-header";
import { SectionHeader } from "@/components/dashboard/section-header";
import {
  ApiError,
  getOverview,
  type Granularity,
  type OverviewResponse,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useUploadProgress } from "@/lib/upload-progress-context";

export default function OverviewPage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Spending trend chart's own granularity/points controls - proposal calls for both
  // configurable, per frontend/CLAUDE.md's Overview section. Refetches the whole overview
  // endpoint (the only one that exists), but only the trend chart shows a loading state so
  // the rest of the page doesn't flash.
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [points, setPoints] = useState(24);
  const [trendLoading, setTrendLoading] = useState(false);
  // Also refetches when an upload finishes from the sidebar's global uploader (see
  // upload-progress-context.tsx) - otherwise KPIs/recent uploads/pending questions here stay
  // stale until the user navigates away and back.
  const { uploadVersion } = useUploadProgress();

  useEffect(() => {
    const token = getToken(); // app/dashboard/layout.tsx's auth guard already ensures this
    if (!token) return; // exists by the time this page mounts.
    let cancelled = false;
    // setTrendLoading(true) runs inside this first .then, not synchronously in the effect
    // body, so it's a reaction to the fetch starting rather than a direct effect-body
    // setState call.
    Promise.resolve()
      .then(() => {
        if (!cancelled) setTrendLoading(true);
      })
      .then(() => getOverview(token, { granularity, months: points }))
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Failed to load overview.",
        );
      })
      .finally(() => {
        if (!cancelled) setTrendLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [granularity, points, uploadVersion]);

  if (error) {
    // Not ComingSoon - its "coming soon" copy would misrepresent a real fetch failure as an
    // unbuilt feature.
    return (
      <p className="text-sm text-destructive">
        Couldn&apos;t load the overview: {error}
      </p>
    );
  }

  if (!data) return <OverviewSkeleton />;

  return (
    <div className="flex flex-col gap-6 pt-4">
      <PageHeader
        icon={Home}
        title="Overview"
        description="A rapid overview of your spending"
      />
      <SectionHeader title="Key metrics" className="-mt-4 -mb-3 md:-mt-1" />
      <KpiTiles kpis={data.kpis} />
      <SectionHeader title="Charts" className="-mt-5 -mb-3 md:-mt-3" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:gap-4">
        <SpendingTrendChart
          data={data.spending_trend}
          granularity={granularity}
          onGranularityChange={setGranularity}
          points={points}
          onPointsChange={setPoints}
          loading={trendLoading}
          className="md:col-span-2"
        />
        <TopVendorsChart data={data.top_vendors} />
        <SpendingByCategoryChart data={data.spending_by_category} />
      </div>
      <SectionHeader title="Recent activity" className="-mt-5 -mb-3 md:-mt-3" />
      <div className="flex flex-col gap-3 xl:gap-4">
        <RecentUploads uploads={data.recent_uploads} />
        <PendingQuestions questions={data.pending_questions} />
      </div>
    </div>
  );
}
