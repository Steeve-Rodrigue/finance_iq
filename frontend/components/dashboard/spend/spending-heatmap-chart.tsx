"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { CalendarHeatmapCell } from "@/lib/api";
import { useChartColors, withAlpha } from "@/lib/chart-theme";
import { formatCurrency } from "@/lib/format";

type SpendingHeatmapChartProps = {
  data: CalendarHeatmapCell[];
  className?: string;
};

// frontend/CLAUDE.md's Spend Analytics "spending heatmap" chart: when you spend the most,
// across the whole year. A real GitHub-style annual calendar heatmap - ECharts' `calendar`
// coordinate system + a `heatmap` series plotted onto it - not the day-of-week x
// week-of-month grid this used to be. Backend already scopes `data` to Jan 1 - Dec 31 of the
// current year regardless of the page's date-range filter (backend/app/repos/analytics/
// spend_repo.py's get_spending_calendar), so no year math needed here beyond reading it off
// the data itself.
export function SpendingHeatmapChart({
  data,
  className,
}: SpendingHeatmapChartProps) {
  const colors = useChartColors();
  const year = useMemo(
    () =>
      data.length > 0
        ? data[0].date.slice(0, 4)
        : String(new Date().getFullYear()),
    [data],
  );

  const option = useMemo(() => {
    const maxTotal = data.reduce((max, c) => Math.max(max, Number(c.total)), 0);

    return {
      tooltip: {
        formatter: (p: { value: [string, number] }) =>
          `${p.value[0]}<br/>${formatCurrency(p.value[1])}`,
      },
      // visualMap still drives the heatmap series' color scale (min/max -> inRange gradient)
      // - just not shown as its own on-chart legend/ruler, per user request.
      visualMap: {
        show: false,
        min: 0,
        max: maxTotal || 1,
        inRange: {
          color: [withAlpha(colors.primary, 0.1), colors.primary],
        },
      },
      calendar: {
        top: 20,
        left: 30,
        right: 10,
        cellSize: ["auto", 13],
        range: year,
        splitLine: { lineStyle: { color: colors.border } },
        // Every day cell gets a visibly distinct fill (a faint neutral tone), not just the
        // ones the heatmap series has data for - otherwise a day with no spending was
        // indistinguishable from the card's own background and effectively invisible,
        // instead of reading as "zero" against a real 365-day grid.
        itemStyle: {
          borderColor: colors.card,
          borderWidth: 2,
          color: withAlpha(colors.border, 0.4),
        },
        yearLabel: { show: false },
        monthLabel: { color: colors.mutedForeground, fontSize: 10 },
        dayLabel: { color: colors.mutedForeground, fontSize: 10 },
      },
      series: [
        {
          type: "heatmap" as const,
          coordinateSystem: "calendar" as const,
          data: data.map((cell) => [cell.date, Number(cell.total)]),
        },
      ],
    };
  }, [data, colors, year]);

  return (
    <ChartCard
      title="Spending heatmap"
      subtitle={`When you spent the most in ${year}`}
      className={className}
    >
      {data.length === 0 ? (
        <div className="flex h-[160px] items-center justify-center text-xs text-muted-foreground">
          No spending recorded this year
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: 160 }} notMerge />
      )}
    </ChartCard>
  );
}
