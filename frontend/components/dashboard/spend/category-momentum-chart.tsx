"use client";

import ReactECharts from "echarts-for-react";
import { useEffect, useMemo, useState } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import {
  getCategoryMomentum,
  type CategoryMomentumResponse,
  type Granularity,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useChartColors, withAlpha } from "@/lib/chart-theme";
import { formatCurrency } from "@/lib/format";

type CategoryMomentumChartProps = {
  startDate?: string;
  endDate?: string;
  granularity: Granularity;
  vendorId?: string;
  categoryId?: string;
  className?: string;
};

// Same 10-color palette family as other multi-series charts in this app (see spend/
// category-evolution-chart.tsx) - unlike VendorEvolutionChart (backend caps top_n=5), the
// category count here is unbounded, so a longer cycle reduces color collisions.
const SERIES_COLORS = [
  "#f2b705",
  "#7c5cbf",
  "#3f9c6d",
  "#e2574c",
  "#3f88c5",
  "#d9738c",
  "#5aa9a3",
  "#c98a3c",
  "#8c6ac4",
  "#4c8c5a",
];

const EMPTY_RESPONSE: CategoryMomentumResponse = { points: [] };

function formatTick(isoDate: string, granularity: Granularity): string {
  const date = new Date(isoDate);
  if (granularity === "year") {
    return new Intl.DateTimeFormat("en-US", { year: "numeric" }).format(date);
  }
  if (granularity === "month") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      year: "2-digit",
    }).format(date);
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

// Replaces Category evolution. Scatter/bubble chart per docs/vendor's "Life Expectancy and GDP"
// template - bubble size scales with the value, one unconnected bubble per category per period
// it actually has spend in (periods with no spend for a category are simply absent, not
// zero-filled). x is every distinct period in range (a day/week/month/year tick, matching the
// page-top SpendFilters granularity selector, same as every other chart on this page), y is
// spend value. The fetch (GET /analytics/spend/category-momentum) is still independent of the
// page's single /analytics/spend payload though, since that endpoint's own category_evolution
// field stays fixed at month - the two "Month over month" Detections tables below read from
// that page-level fetch and stay month-only, unaffected by this chart's granularity.
export function CategoryMomentumChart({
  startDate,
  endDate,
  granularity,
  vendorId,
  categoryId,
  className,
}: CategoryMomentumChartProps) {
  const colors = useChartColors();
  const [response, setResponse] =
    useState<CategoryMomentumResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (!cancelled) setLoading(true);
      })
      .then(() =>
        getCategoryMomentum(token, {
          startDate,
          endDate,
          granularity,
          vendorId,
          categoryId,
        }),
      )
      .then((res) => {
        if (cancelled) return;
        setResponse(res);
      })
      .catch(() => {
        if (!cancelled) setResponse(EMPTY_RESPONSE);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, granularity, vendorId, categoryId]);

  const option = useMemo(() => {
    const periods = Array.from(
      new Set(response.points.map((p) => p.period)),
    ).sort();
    const categoryNames = Array.from(
      new Set(response.points.map((p) => p.category_name)),
    );
    const lookup = new Map(
      response.points.map((p) => [
        `${p.period}|${p.category_name}`,
        Number(p.total),
      ]),
    );

    return {
      // bottom: 48 (not the usual 28 other spend charts use) - this chart's legend has one
      // entry per distinct category, unbounded (unlike vendor-evolution-chart.tsx's top-5 cap),
      // so once a user has all 6-7 categories in play the legend wraps to two rows and needs
      // more clearance above the x-axis labels than a single-row legend does.
      grid: { left: 4, right: 16, top: 8, bottom: 48, containLabel: true },
      tooltip: {
        trigger: "item" as const,
        formatter: (p: { seriesName: string; value: [number, number] }) =>
          `${p.seriesName}<br/>${periods.length > 0 ? formatTick(periods[p.value[0]], granularity) : ""}: ${formatCurrency(p.value[1])}`,
      },
      legend: {
        bottom: 0,
        icon: "circle",
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: colors.mutedForeground, fontSize: 11 },
      },
      xAxis: {
        type: "category" as const,
        data: periods.map((p) => formatTick(p, granularity)),
        boundaryGap: true,
        axisLine: { lineStyle: { color: colors.border } },
        axisTick: { show: false },
        axisLabel: { color: colors.mutedForeground, fontSize: 11 },
      },
      yAxis: {
        type: "value" as const,
        splitLine: {
          lineStyle: { color: colors.border, type: "dashed" as const },
        },
        axisLabel: {
          color: colors.mutedForeground,
          fontSize: 11,
          formatter: (value: number) => formatCurrency(value),
        },
      },
      series: categoryNames.map((name, i) => ({
        name,
        type: "scatter" as const,
        symbolSize: (value: [number, number]) =>
          Math.max(8, Math.sqrt(value[1]) * 3),
        itemStyle: {
          color: SERIES_COLORS[i % SERIES_COLORS.length],
          borderColor: colors.card,
          borderWidth: 2,
          shadowBlur: 8,
          shadowColor: withAlpha(SERIES_COLORS[i % SERIES_COLORS.length], 0.4),
          shadowOffsetY: 4,
        },
        emphasis: { focus: "series" as const },
        data: periods
          .map((period, x) => {
            const total = lookup.get(`${period}|${name}`);
            return total === undefined ? null : [x, total];
          })
          .filter((point): point is [number, number] => point !== null),
      })),
    };
  }, [response, granularity, colors]);

  return (
    <ChartCard
      title="Category momentum"
      subtitle="Point size scales with spend"
      className={className}
    >
      {!loading && response.points.length === 0 ? (
        <div className="flex h-[260px] items-center justify-center text-xs text-muted-foreground">
          No spend history yet
        </div>
      ) : (
        <ReactECharts
          option={option}
          style={{ height: 260 }}
          notMerge
          showLoading={loading}
        />
      )}
    </ChartCard>
  );
}
