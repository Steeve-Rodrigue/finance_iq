import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CategoryRead } from "@/lib/api";
import { cn } from "@/lib/utils";

type VendorFiltersProps = {
  categories: CategoryRead[];
  startDate: string;
  endDate: string;
  categoryId: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onClear: () => void;
  className?: string;
};

// frontend/CLAUDE.md's Vendors "Filters" bar: date range + category dropdown, feeding
// GET /analytics/vendors' start_date/end_date/category_id query params. Values are the
// controlled strings themselves ("" = unset) - the page owns state and refetches on change,
// same pattern as Overview's granularity/points controls.
//
// Mobile (<850px, frontend/CLAUDE.md's breakpoint): each field is a tiny inline
// label+control pair (not stacked) so the whole bar stays one compact row; `overflow-x-auto`
// lets it scroll horizontally rather than wrap if the three fields + Clear button don't quite
// fit. >=md there's room to spare, so controls grow back up and it switches to flex-wrap.
export function VendorFilters({
  categories,
  startDate,
  endDate,
  categoryId,
  onStartDateChange,
  onEndDateChange,
  onCategoryChange,
  onClear,
  className,
}: VendorFiltersProps) {
  const hasFilters = startDate !== "" || endDate !== "" || categoryId !== "";
  const labelClass =
    "text-[10px] md:text-[11px] whitespace-nowrap text-muted-foreground";
  const dateInputClass =
    "h-6 w-8 px-1 text-[11px] [&::-webkit-datetime-edit]:hidden md:h-8 md:w-32 md:px-1.5 md:text-sm md:[&::-webkit-datetime-edit]:inline-block";
  const selectClass =
    "h-6 w-24 shrink-0 rounded-md border border-border bg-background px-1.5 text-[11px] text-foreground md:h-8 md:w-32 md:rounded-lg md:px-2 md:text-xs";

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 overflow-x-auto rounded-lg bg-card p-1.5 shadow-sm ring-1 ring-foreground/5 md:flex-wrap md:gap-2 md:overflow-visible md:rounded-xl md:p-3 xl:rounded-2xl xl:p-4",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-1">
        <Label htmlFor="vendor-filter-start" className={labelClass}>
          From
        </Label>
        <Input
          id="vendor-filter-start"
          type="date"
          value={startDate}
          max={endDate || undefined}
          onChange={(e) => onStartDateChange(e.target.value)}
          className={dateInputClass}
        />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Label htmlFor="vendor-filter-end" className={labelClass}>
          To
        </Label>
        <Input
          id="vendor-filter-end"
          type="date"
          value={endDate}
          min={startDate || undefined}
          onChange={(e) => onEndDateChange(e.target.value)}
          className={dateInputClass}
        />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Label htmlFor="vendor-filter-category" className={labelClass}>
          Category
        </Label>
        <select
          id="vendor-filter-category"
          value={categoryId}
          onChange={(e) => onCategoryChange(e.target.value)}
          className={selectClass}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
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
