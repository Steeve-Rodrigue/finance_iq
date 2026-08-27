import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CategoryRead, VendorRead } from "@/lib/api";
import { cn } from "@/lib/utils";

// backend/app/models/bills.py's BillStatus - a fixed, closed vocabulary, so hardcoded here
// rather than fetched from anywhere.
const STATUS_OPTIONS = [
  "pending",
  "in_review",
  "flagged",
  "resolved",
  "archived",
];

type BillFiltersProps = {
  vendors: VendorRead[];
  categories: CategoryRead[];
  startDate: string;
  endDate: string;
  vendorId: string;
  categoryId: string;
  status: string;
  search: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onVendorIdChange: (value: string) => void;
  onCategoryIdChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onClear: () => void;
  className?: string;
};

// frontend/CLAUDE.md's Bills Explorer "Filters": date range, vendor dropdown, category
// dropdown, status dropdown, search (name or invoice_number). All client-side - GET /bills/
// takes no query params at all (backend/app/routers/bills.py), so there's no server-side
// filtering to call into; BillsExplorerPage fetches the full list once and filters/searches
// it in memory. Same compact-on-mobile treatment as vendor-filters.tsx.
export function BillFilters({
  vendors,
  categories,
  startDate,
  endDate,
  vendorId,
  categoryId,
  status,
  search,
  onStartDateChange,
  onEndDateChange,
  onVendorIdChange,
  onCategoryIdChange,
  onStatusChange,
  onSearchChange,
  onClear,
  className,
}: BillFiltersProps) {
  const hasFilters =
    startDate !== "" ||
    endDate !== "" ||
    vendorId !== "" ||
    categoryId !== "" ||
    status !== "" ||
    search !== "";

  const selectClass =
    "h-6 w-24 shrink-0 rounded-md border border-border bg-background px-1.5 text-[11px] text-foreground md:h-8 md:w-32 md:rounded-lg md:px-2 md:text-xs";
  const labelClass =
    "text-[10px] md:text-[11px] whitespace-nowrap text-muted-foreground";

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 overflow-x-auto rounded-lg bg-card p-1.5 shadow-sm ring-1 ring-foreground/5 md:flex-wrap md:gap-2 md:overflow-visible md:rounded-xl md:p-3 xl:rounded-2xl xl:p-4",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-1">
        <Label htmlFor="bill-filter-start" className={labelClass}>
          From
        </Label>
        <Input
          id="bill-filter-start"
          type="date"
          value={startDate}
          max={endDate || undefined}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="h-6 w-8 px-1 text-[11px] [&::-webkit-datetime-edit]:hidden md:h-8 md:w-32 md:px-1.5 md:text-sm md:[&::-webkit-datetime-edit]:inline-block"
        />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Label htmlFor="bill-filter-end" className={labelClass}>
          To
        </Label>
        <Input
          id="bill-filter-end"
          type="date"
          value={endDate}
          min={startDate || undefined}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="h-6 w-8 px-1 text-[11px] [&::-webkit-datetime-edit]:hidden md:h-8 md:w-32 md:px-1.5 md:text-sm md:[&::-webkit-datetime-edit]:inline-block"
        />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Label htmlFor="bill-filter-vendor" className={labelClass}>
          Vendor
        </Label>
        <select
          id="bill-filter-vendor"
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
        <Label htmlFor="bill-filter-category" className={labelClass}>
          Category
        </Label>
        <select
          id="bill-filter-category"
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
      <div className="flex shrink-0 items-center gap-1">
        <Label htmlFor="bill-filter-status" className={labelClass}>
          Status
        </Label>
        <select
          id="bill-filter-status"
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          className={selectClass}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="relative flex shrink-0 items-center">
        <Search className="pointer-events-none absolute left-2 size-3 text-muted-foreground" />
        <Input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search name or invoice #"
          aria-label="Search bills"
          className="h-6 w-36 pl-6 text-[11px] md:h-8 md:w-48 md:text-sm"
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
