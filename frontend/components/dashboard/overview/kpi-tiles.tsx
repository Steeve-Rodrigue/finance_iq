import {
  Calendar,
  CheckCircle2,
  FileCheck2,
  MessageCircleQuestion,
  Minus,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type { OverviewKPIs } from "@/lib/api";
import { formatCurrency, formatMonthLabel, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

// Per-tile accent - literal class strings (not built from a variable) so Tailwind's static
// scan actually generates them. badge = icon-badge bg+text, value = the big number's color
// (reused faintly for the corner flourish icon), chip = footer pill background.
type Tint = {
  badge: string;
  value: string;
  chip: string;
  card: string;
  border: string;
};
const TINTS = {
  amber: {
    badge: "bg-amber-500/10 text-amber-600",
    value: "text-amber-600",
    chip: "bg-amber-500/10",
    card: "bg-amber-500/15",
    border: "border-amber-500/30",
  },
  yellow: {
    badge: "bg-yellow-500/10 text-yellow-600",
    value: "text-yellow-600",
    chip: "bg-yellow-500/10",
    card: "bg-yellow-500/15",
    border: "border-yellow-500/30",
  },
  orange: {
    badge: "bg-orange-500/10 text-orange-600",
    value: "text-orange-600",
    chip: "bg-orange-500/10",
    card: "bg-orange-500/15",
    border: "border-orange-500/30",
  },
  amberDeep: {
    badge: "bg-amber-600/10 text-amber-700",
    value: "text-amber-700",
    chip: "bg-amber-600/10",
    card: "bg-amber-600/15",
    border: "border-amber-600/30",
  },
} satisfies Record<string, Tint>;

function KpiChip({
  icon: Icon,
  tint,
  children,
}: {
  icon: LucideIcon;
  tint: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex min-w-0 items-start gap-1.5 rounded-lg px-1.5 py-0.5 text-[11px] font-medium text-foreground xl:px-2 xl:py-1 xl:text-xs",
        tint,
      )}
    >
      <Icon className="mt-0.5 size-3 shrink-0 xl:size-3.5" />
      <span>{children}</span>
    </span>
  );
}

type KpiTileProps = {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  tint: Tint;
  value: string;
  className?: string;
  children: React.ReactNode;
};

// Light card + tinted icon badge + big accent-colored number + dashed divider + footer
// chip(s), per docs/image copy 2.png - replaces the earlier solid-gradient tile design.
// The reference's large illustrated glow panel is deliberately not reproduced (no image
// asset, and it doesn't fit 4-across tiles already trimmed down after repeated size
// feedback) - just a small faint corner icon carries that flourish instead.
function KpiTile({
  title,
  subtitle,
  icon: Icon,
  tint,
  value,
  className,
  children,
}: KpiTileProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border p-1.5 shadow-sm transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:fill-mode-both motion-safe:animation-duration-500 xl:rounded-2xl xl:p-4",
        tint.card,
        tint.border,
        className,
      )}
    >
      <Icon
        className={cn(
          "pointer-events-none absolute -right-1.5 -bottom-1.5 size-7 opacity-[0.08] xl:-right-3 xl:-bottom-3 xl:size-20",
          tint.value,
        )}
      />
      <div className="relative flex items-start gap-1">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md xl:size-9",
            tint.badge,
          )}
        >
          <Icon className="size-3 xl:size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-foreground xl:text-sm">
            {title}
          </p>
          <p className="hidden text-[10px] text-muted-foreground min-[661px]:block xl:text-xs">
            {subtitle}
          </p>
        </div>
      </div>
      <div className="relative mt-1 flex flex-wrap items-center justify-between gap-x-1.5 gap-y-1 xl:mt-3">
        <p className={cn("text-base font-extrabold xl:text-3xl", tint.value)}>
          {value}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">{children}</div>
      </div>
    </div>
  );
}

type KpiTilesProps = {
  kpis: OverviewKPIs;
};

// The 4 KPI tiles from frontend/CLAUDE.md's Overview section, backed by
// GET /analytics/overview's `kpis` field.
export function KpiTiles({ kpis }: KpiTilesProps) {
  const deltaPct =
    kpis.spend_delta_pct === null ? null : Number(kpis.spend_delta_pct);
  const DeltaIcon =
    deltaPct === null || deltaPct === 0
      ? Minus
      : deltaPct > 0
        ? TrendingUp
        : TrendingDown;

  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4 xl:gap-4">
      <KpiTile
        title="Total spent"
        subtitle="Your overall expenses"
        icon={Wallet}
        tint={TINTS.amber}
        value={formatCurrency(kpis.total_spent_current_month)}
        className="motion-safe:delay-100"
      >
        <KpiChip icon={Calendar} tint={TINTS.amber.chip}>
          {formatMonthLabel(0, { includeYear: true })}
        </KpiChip>
        <KpiChip icon={DeltaIcon} tint={TINTS.amber.chip}>
          {formatMonthLabel(-1)} —{" "}
          {formatCurrency(kpis.total_spent_previous_month)}
          {deltaPct !== null &&
            ` · ${deltaPct >= 0 ? "↑" : "↓"}${Math.abs(deltaPct).toFixed(1)}%`}
        </KpiChip>
      </KpiTile>

      <KpiTile
        title="Bills processed"
        subtitle="Uploaded this month"
        icon={FileCheck2}
        tint={TINTS.yellow}
        value={String(kpis.bills_processed_current_month)}
        className="motion-safe:delay-150"
      >
        <KpiChip icon={Calendar} tint={TINTS.yellow.chip}>
          {formatMonthLabel(0, { includeYear: true })}
        </KpiChip>
      </KpiTile>

      <KpiTile
        title="Pending elicitations"
        subtitle="Needs your input"
        icon={MessageCircleQuestion}
        tint={TINTS.orange}
        value={String(kpis.pending_elicitations)}
        className="motion-safe:delay-200"
      >
        <KpiChip icon={MessageCircleQuestion} tint={TINTS.orange.chip}>
          awaiting your answer
        </KpiChip>
      </KpiTile>

      <KpiTile
        title="Auto-resolved rate"
        subtitle="No manual review needed"
        icon={CheckCircle2}
        tint={TINTS.amberDeep}
        value={formatPercent(kpis.auto_resolved_rate)}
        className="motion-safe:delay-300"
      >
        <KpiChip icon={CheckCircle2} tint={TINTS.amberDeep.chip}>
          bills without elicitation
        </KpiChip>
      </KpiTile>
    </div>
  );
}
