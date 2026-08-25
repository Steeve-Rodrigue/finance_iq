import { cn } from "@/lib/utils";

type ChartCardProps = {
  title: string;
  subtitle?: string;
  // Rendered on the right of the header row, next to the title/subtitle - e.g. the spending
  // trend's granularity/points controls. Kept on ChartCard (not chart-specific) since other
  // pages' filtrable charts (frontend/CLAUDE.md's Spend Analytics) will need the same slot.
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

// Shared frame for the 3 Overview charts - same card language as KpiTile (bg-card, ring,
// rounded corners) so the charts row reads as part of the same section, not a bolt-on.
export function ChartCard({
  title,
  subtitle,
  actions,
  className,
  children,
}: ChartCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl bg-card p-3 shadow-sm ring-1 ring-foreground/5 xl:rounded-2xl xl:p-4",
        className,
      )}
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-foreground xl:text-sm">
            {title}
          </p>
          {subtitle && (
            <p className="text-[10px] text-muted-foreground xl:text-xs">
              {subtitle}
            </p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
