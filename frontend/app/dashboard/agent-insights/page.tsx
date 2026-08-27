"use client";

import { Bot } from "lucide-react";
import { useEffect, useState } from "react";

import { AgentInsightsSkeleton } from "@/components/dashboard/agent-insights/agent-insights-skeleton";
import { ConfidenceByCategoryChart } from "@/components/dashboard/agent-insights/confidence-by-category-chart";
import { ConfidenceTrendChart } from "@/components/dashboard/agent-insights/confidence-trend-chart";
import { ExtractionStrategyChart } from "@/components/dashboard/agent-insights/extraction-strategy-chart";
import { AgentInsightsKpiTiles } from "@/components/dashboard/agent-insights/kpi-tiles";
import { PageHeader } from "@/components/dashboard/page-header";
import { SectionHeader } from "@/components/dashboard/section-header";
import {
  ApiError,
  getAgentInsights,
  type AgentInsightsResponse,
} from "@/lib/api";
import { getToken } from "@/lib/auth";

// No filters/refreshKey pattern here, unlike Vendors/Categories - GET /analytics/agent-insights
// takes no query params, so a single fetch on mount is all this page needs.
export default function AgentInsightsPage() {
  const [data, setData] = useState<AgentInsightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken(); // app/dashboard/layout.tsx's auth guard already ensures this
    if (!token) return; // exists by the time this page mounts.
    getAgentInsights(token)
      .then(setData)
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError
            ? err.message
            : "Failed to load agent insights.",
        );
      });
  }, []);

  if (error) {
    // Not ComingSoon - its "coming soon" copy would misrepresent a real fetch failure as an
    // unbuilt feature.
    return (
      <p className="text-sm text-destructive">
        Couldn&apos;t load agent insights: {error}
      </p>
    );
  }

  if (!data) return <AgentInsightsSkeleton />;

  return (
    <div className="flex flex-col gap-6 pt-4">
      <PageHeader
        icon={Bot}
        title="Agent Insights"
        description="How well the agent is doing its job"
      />
      <SectionHeader title="Key metrics" className="-mt-4 -mb-3 md:-mt-1" />
      <AgentInsightsKpiTiles kpis={data.kpis} />
      <SectionHeader title="Charts" className="-mt-2 -mb-3 md:mt-0" />
      <ConfidenceTrendChart data={data.confidence_trend} />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-4">
        <ConfidenceByCategoryChart data={data.confidence_by_category} />
        <ExtractionStrategyChart
          data={data.extraction_strategy_effectiveness}
        />
      </div>
    </div>
  );
}
