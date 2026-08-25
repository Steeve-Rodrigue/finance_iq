import { cn } from "@/lib/utils";

type ConfidenceBadgeProps = {
  value: string | number | null;
  className?: string;
};

// Bands per .claude/skills/confidence-rubric: >=0.80 high (act automatically), 0.50-0.80
// medium (retried), <0.50 low (flagged for the user rather than guessed). Value is the raw
// 0-1 scale the API returns (not the 0-100 scale lib/format.ts's formatPercent expects).
const HIGH_THRESHOLD = 0.8;
const MEDIUM_THRESHOLD = 0.5;

const BAND_STYLES = {
  high: "bg-emerald-500/10 text-emerald-600",
  medium: "bg-amber-500/10 text-amber-600",
  low: "bg-red-500/10 text-red-600",
} as const;

// Shared across Overview's recent uploads, and later Bills Explorer / Bill Detail
// (frontend/CLAUDE.md calls for the same color-coded badge in both).
export function ConfidenceBadge({ value, className }: ConfidenceBadgeProps) {
  if (value === null) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground",
          className,
        )}
      >
        —
      </span>
    );
  }

  const num = Number(value);
  const band =
    num >= HIGH_THRESHOLD ? "high" : num >= MEDIUM_THRESHOLD ? "medium" : "low";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
        BAND_STYLES[band],
        className,
      )}
    >
      {Math.round(num * 100)}%
    </span>
  );
}
