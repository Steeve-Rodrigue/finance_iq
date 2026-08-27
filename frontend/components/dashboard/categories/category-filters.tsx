import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type CategoryFiltersProps = {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onClear: () => void;
  className?: string;
};

// frontend/CLAUDE.md's Categories "Filters" bar: date range only (no category dropdown - this
// IS the categories page). Feeds GET /analytics/categories' start_date/end_date query params.
// Same compact-on-mobile treatment as vendor-filters.tsx: inline label+control pairs in one
// row that scrolls horizontally rather than wraps if it doesn't quite fit.
export function CategoryFilters({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClear,
  className,
}: CategoryFiltersProps) {
  const hasFilters = startDate !== "" || endDate !== "";

  return (
    <div
      className={cn(
        "flex items-center gap-2 overflow-x-auto rounded-lg bg-card p-1.5 shadow-sm ring-1 ring-foreground/5 md:flex-wrap md:gap-2 md:overflow-visible md:rounded-xl md:p-3 xl:rounded-2xl xl:p-4",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-1">
        <Label
          htmlFor="category-filter-start"
          className="text-[10px] whitespace-nowrap text-muted-foreground md:text-[11px]"
        >
          From
        </Label>
        <Input
          id="category-filter-start"
          type="date"
          value={startDate}
          max={endDate || undefined}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="h-6 w-8 px-1 text-[11px] [&::-webkit-datetime-edit]:hidden md:h-8 md:w-32 md:px-1.5 md:text-sm md:[&::-webkit-datetime-edit]:inline-block"
        />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Label
          htmlFor="category-filter-end"
          className="text-[10px] whitespace-nowrap text-muted-foreground md:text-[11px]"
        >
          To
        </Label>
        <Input
          id="category-filter-end"
          type="date"
          value={endDate}
          min={startDate || undefined}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="h-6 w-8 px-1 text-[11px] [&::-webkit-datetime-edit]:hidden md:h-8 md:w-32 md:px-1.5 md:text-sm md:[&::-webkit-datetime-edit]:inline-block"
        />
      </div>
      {hasFilters && (
        <Button
          variant="ghost"
          size="xs"
          onClick={onClear}
          className="shrink-0"
        >
          <X />
          <span className="hidden md:inline">Clear filters</span>
        </Button>
      )}
    </div>
  );
}
