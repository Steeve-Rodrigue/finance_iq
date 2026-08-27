import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// Per-tile accent - literal class strings (not built from a variable) so Tailwind's static
// scan actually generates them. badge = icon-badge bg+text, value = the big number's color
// (reused faintly for the corner flourish icon), chip = footer pill background.
export type Tint = {
  badge: string;
  value: string;
  chip: string;
  card: string;
  border: string;
};

// Shared across every page's KPI row (Overview's overview/kpi-tiles.tsx, Vendors', etc.) so a
// palette tweak or new accent only has to happen once. amber/yellow/orange/amberDeep are
// Overview's original 4; blue/violet/green extend the family for pages needing a 4th+5th
// distinct tint without repeating one.
export const TINTS = {
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
  blue: {
    badge: "bg-blue-500/10 text-blue-600",
    value: "text-blue-600",
    chip: "bg-blue-500/10",
    card: "bg-blue-500/15",
    border: "border-blue-500/30",
  },
  violet: {
    badge: "bg-violet-500/10 text-violet-600",
    value: "text-violet-600",
    chip: "bg-violet-500/10",
    card: "bg-violet-500/15",
    border: "border-violet-500/30",
  },
  green: {
    badge: "bg-emerald-500/10 text-emerald-600",
    value: "text-emerald-600",
    chip: "bg-emerald-500/10",
    card: "bg-emerald-500/15",
    border: "border-emerald-500/30",
  },
} satisfies Record<string, Tint>;

export function KpiChip({
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
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

export type KpiTileProps = {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  tint: Tint;
  value: string;
  className?: string;
  children?: React.ReactNode;
};

// Light card + tinted icon badge + big accent-colored number + dashed divider + footer
// chip(s), per docs/image copy 2.png - replaces the earlier solid-gradient tile design.
// The reference's large illustrated glow panel is deliberately not reproduced (no image
// asset, and it doesn't fit 4-across tiles already trimmed down after repeated size
// feedback) - just a small faint corner icon carries that flourish instead.
export function KpiTile({
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
          <p className="truncate text-[11px] font-semibold text-foreground xl:text-sm">
            {title}
          </p>
          <p className="hidden truncate text-[10px] text-muted-foreground min-[661px]:block xl:text-xs">
            {subtitle}
          </p>
        </div>
      </div>
      <div className="relative mt-1 flex flex-wrap items-center justify-between gap-x-1.5 gap-y-1 xl:mt-3">
        <p
          className={cn(
            "min-w-0 truncate text-base font-extrabold xl:text-3xl",
            tint.value,
          )}
        >
          {value}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">{children}</div>
      </div>
    </div>
  );
}
