import { FileText } from "lucide-react";

import { ConfidenceBadge } from "@/components/dashboard/confidence-badge";
import type { RecentUpload } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ChartCard } from "./chart-card";

type RecentUploadsProps = {
  uploads: RecentUpload[];
  className?: string;
};

// "complete" reads as done/settled - everything else is still moving through the agent
// pipeline, so it gets a neutral in-progress treatment rather than its own color per stage.
function StagePill({ stage }: { stage: string }) {
  const isComplete = stage === "complete";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
        isComplete
          ? "bg-emerald-500/10 text-emerald-600"
          : "bg-muted text-muted-foreground",
      )}
    >
      {stage}
    </span>
  );
}

// frontend/CLAUDE.md's Overview "Recent uploads" section: last 5-10 bills by created_at
// (name, vendor, total_amount, confidence, current_stage). Read-only here - clicking through
// to Bill Detail lands once that page exists (Phase 5A, not yet built).
export function RecentUploads({ uploads, className }: RecentUploadsProps) {
  return (
    <ChartCard
      title="Recent uploads"
      subtitle="Latest bills"
      className={className}
    >
      {uploads.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-xs text-muted-foreground">
          No bills uploaded yet
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-x-3 gap-y-1 md:grid-cols-2">
          {uploads.map((upload) => (
            <li
              key={upload.bill_id}
              className="flex items-center gap-2.5 rounded-lg px-1.5 py-2 transition-colors hover:bg-muted/50"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">
                  {upload.name}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {upload.vendor_name ?? "Unknown vendor"}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-xs font-semibold text-foreground">
                  {upload.total_amount
                    ? formatCurrency(upload.total_amount, { precise: true })
                    : "—"}
                </span>
                <div className="flex items-center gap-1">
                  <ConfidenceBadge value={upload.confidence} />
                  <StagePill stage={upload.current_stage} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
