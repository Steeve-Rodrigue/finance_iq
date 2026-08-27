"use client";

import { CircleHelp } from "lucide-react";
import { useEffect, useState } from "react";

import { ElicitationsSkeleton } from "@/components/dashboard/elicitations/elicitations-skeleton";
import { ElicitationsKpiTiles } from "@/components/dashboard/elicitations/kpi-tiles";
import { PendingQuestionsList } from "@/components/dashboard/elicitations/pending-questions-list";
import { PageHeader } from "@/components/dashboard/page-header";
import { SectionHeader } from "@/components/dashboard/section-header";
import {
  ApiError,
  getElicitationsAnalytics,
  type ElicitationsAnalyticsResponse,
} from "@/lib/api";
import { getToken } from "@/lib/auth";

// No filters here, unlike Vendors/Categories - GET /analytics/elicitations takes no query
// params. refreshKey is bumped after answering a pending question, to refetch the whole
// analytics response (KPIs/charts/remaining pending list) rather than patching it by hand -
// answering one question can move counts across several of these at once (pending -> answered,
// avg confidence, elicitations by stage), so a full refetch is simpler and more correct here
// than Vendors/Categories' single-row-changed case.
export default function ElicitationsPage() {
  const [data, setData] = useState<ElicitationsAnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const token = getToken(); // app/dashboard/layout.tsx's auth guard already ensures this
    if (!token) return; // exists by the time this page mounts.
    let cancelled = false;
    getElicitationsAnalytics(token)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Failed to load elicitations.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (error) {
    // Not ComingSoon - its "coming soon" copy would misrepresent a real fetch failure as an
    // unbuilt feature.
    return (
      <p className="text-sm text-destructive">
        Couldn&apos;t load elicitations: {error}
      </p>
    );
  }

  if (!data) return <ElicitationsSkeleton />;

  return (
    <div className="flex flex-col gap-6 pt-4">
      <PageHeader
        icon={CircleHelp}
        title="Elicitations"
        description="Questions the agent asked instead of guessing"
      />
      <SectionHeader title="Key metrics" className="-mt-4 -mb-3 md:-mt-1" />
      <ElicitationsKpiTiles kpis={data.kpis} />
      <SectionHeader
        title="Pending questions"
        className="-mt-2 -mb-3 md:mt-0"
      />
      <PendingQuestionsList
        questions={data.pending_questions}
        onAnswered={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
