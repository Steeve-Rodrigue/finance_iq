import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CategoryRead, Granularity, VendorRead } from "@/lib/api";
import { cn } from "@/lib/utils";

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

type SpendFiltersProps = {
  vendors: VendorRead[];
  categories: CategoryRead[];
  startDate: string;
  endDate: string;
  vendorId: string;
  categoryId: string;
  granularity: Granularity;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onVendorIdChange: (value: string) => void;
  onCategoryIdChange: (value: string) => void;
  onGranularityChange: (value: Granularity) => void;
  onClear: () => void;
  className?: string;
};

// frontend/CLAUDE.md's Spend Analytics "Global filters": date range, granularity, vendor
// dropdown, category dropdown. Rendered under the KPI tiles rather than above them (unlike
// every other page's filter bar, and unlike frontend/CLAUDE.md's literal "top of page"
// wording) since the KPIs read as a page summary, not something gated behind the filters.
// Still drives the ENTIRE page (KPIs + all 12 charts/tables), not just a table - GET
// /analytics/spend applies start_date/end_date/vendor_id/category_id/granularity to
// everything (backend/app/repos/analytics/spend_repo.py's _filter_conditions is used by every
// query). Same compact-on-mobile treatment as vendor-filters.tsx.
export function SpendFilters({
  vendors,
  categories,
  startDate,
  endDate,
  vendorId,
  categoryId,
  granularity,
  onStartDateChange,
  onEndDateChange,
  onVendorIdChange,
  onCategoryIdChange,
  onGranularityChange,
  onClear,
  className,
}: SpendFiltersProps) {
  const hasFilters =
    startDate !== "" ||
    endDate !== "" ||
    vendorId !== "" ||
    categoryId !== "" ||
    granularity !== "day";
  const labelClass =
    "text-[10px] md:text-[11px] whitespace-nowrap text-muted-foreground";
  const dateInputClass =
    "h-6 w-24 px-1.5 text-[11px] md:h-8 md:w-32 md:text-sm";
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
        <Label htmlFor="spend-filter-start" className={labelClass}>
          From
        </Label>
        <Input
          id="spend-filter-start"
          type="date"
          value={startDate}
          max={endDate || undefined}
          onChange={(e) => onStartDateChange(e.target.value)}
          className={dateInputClass}
        />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Label htmlFor="spend-filter-end" className={labelClass}>
          To
        </Label>
        <Input
          id="spend-filter-end"
          type="date"
          value={endDate}
          min={startDate || undefined}
          onChange={(e) => onEndDateChange(e.target.value)}
          className={dateInputClass}
        />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Label htmlFor="spend-filter-granularity" className={labelClass}>
          By
        </Label>
        <select
          id="spend-filter-granularity"
          value={granularity}
          onChange={(e) => onGranularityChange(e.target.value as Granularity)}
          className={selectClass}
        >
          {GRANULARITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Label htmlFor="spend-filter-vendor" className={labelClass}>
          Vendor
        </Label>
        <select
          id="spend-filter-vendor"
          value={vendorId}
          onChange={(e) => onVendorIdChange(e.target.value)}
          className={selectClass}
        >
          <option value="">All vendors</option>
          {vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Label htmlFor="spend-filter-category" className={labelClass}>
          Category
        </Label>
        <select
          id="spend-filter-category"
          value={categoryId}
          onChange={(e) => onCategoryIdChange(e.target.value)}
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
