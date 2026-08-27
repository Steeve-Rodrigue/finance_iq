"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import { LineItemDeleteDialog } from "@/components/dashboard/line-items/line-item-delete-dialog";
import { LineItemEditDialog } from "@/components/dashboard/line-items/line-item-edit-dialog";
import { ChartCard } from "@/components/dashboard/overview/chart-card";
import { Input } from "@/components/ui/input";
import type { CategoryRead, LineItemTableRow, VendorRead } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

type SortKey =
  | "description"
  | "common_name"
  | "quantity"
  | "unit_price"
  | "line_total"
  | "vendor_name"
  | "bill_name";

type Column = { key: SortKey; label: string };

const COLUMNS: Column[] = [
  { key: "description", label: "Description" },
  { key: "common_name", label: "Common name" },
  { key: "quantity", label: "Qty" },
  { key: "unit_price", label: "Unit price" },
  { key: "line_total", label: "Total" },
  { key: "vendor_name", label: "Vendor" },
  { key: "bill_name", label: "Bill" },
];

function sortValue(row: LineItemTableRow, key: SortKey): string | number {
  switch (key) {
    case "description":
      return row.description.toLowerCase();
    case "common_name":
      return (row.common_name ?? "").toLowerCase();
    case "quantity":
      return row.quantity ? Number(row.quantity) : -Infinity;
    case "unit_price":
      return row.unit_price ? Number(row.unit_price) : -Infinity;
    case "line_total":
      return Number(row.line_total);
    case "vendor_name":
      return (row.vendor_name ?? "").toLowerCase();
    case "bill_name":
      return row.bill_name.toLowerCase();
  }
}

type LineItemsTableProps = {
  rows: LineItemTableRow[];
  vendors: VendorRead[];
  categories: CategoryRead[];
  vendorId: string;
  categoryId: string;
  onVendorIdChange: (value: string) => void;
  onCategoryIdChange: (value: string) => void;
  onChanged: () => void;
  className?: string;
};

const selectClass =
  "h-7 rounded-md border border-border bg-background px-1.5 text-[11px] text-foreground";

// frontend/CLAUDE.md's Line Items table: description, common_name, quantity, unit_price,
// line_total, vendor, bill name - sortable, filterable by vendor/category. That filter lives
// here (in the card's actions slot), not as a page-top bar - see lib/api.ts's
// LineItemsAnalyticsResponse comment: vendor_id/category_id only scope this table
// server-side, the KPIs/charts above are always unfiltered. The search box is a further,
// purely client-side narrowing on top of that - the backend has no search param
// (LineItemFilters is vendor_id/category_id only), so this filters the already-fetched `rows`
// in memory rather than triggering a refetch, unlike the vendor/category selects.
export function LineItemsTable({
  rows,
  vendors,
  categories,
  vendorId,
  categoryId,
  onVendorIdChange,
  onCategoryIdChange,
  onChanged,
  className,
}: LineItemsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("bill_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [editingItem, setEditingItem] = useState<{
    billId: string;
    lineItemId: string;
  } | null>(null);
  const [deletingItem, setDeletingItem] = useState<{
    billId: string;
    lineItemId: string;
    description: string;
  } | null>(null);

  const searched = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter(
      (item) =>
        item.description.toLowerCase().includes(query) ||
        (item.common_name ?? "").toLowerCase().includes(query) ||
        item.bill_name.toLowerCase().includes(query),
    );
  }, [rows, search]);

  const sorted = useMemo(() => {
    const copy = [...searched];
    copy.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [searched, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <ChartCard
      title="Line items"
      subtitle={`${sorted.length} item${sorted.length === 1 ? "" : "s"}`}
      className={className}
      actions={
        <div className="flex items-center gap-1.5">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2 size-3 text-muted-foreground" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search description or item"
              aria-label="Search line items"
              className="h-7 w-40 pl-6 text-[11px]"
            />
          </div>
          <select
            value={vendorId}
            onChange={(e) => onVendorIdChange(e.target.value)}
            aria-label="Filter by vendor"
            className={selectClass}
          >
            <option value="">All vendors</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
          <select
            value={categoryId}
            onChange={(e) => onCategoryIdChange(e.target.value)}
            aria-label="Filter by category"
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
      }
    >
      {sorted.length === 0 ? (
        <div className="flex h-[160px] items-center justify-center text-xs text-muted-foreground">
          No line items match these filters
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[11px] text-muted-foreground">
                {COLUMNS.map((col) => (
                  <th key={col.key} className="pb-2 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort(col.key)}
                      className="flex items-center gap-1 hover:text-foreground"
                    >
                      {col.label}
                      {sortKey === col.key ? (
                        sortDir === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  </th>
                ))}
                <th className="pb-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => (
                <tr
                  key={item.line_item_id}
                  className="border-t border-border/60 text-foreground"
                >
                  <td className="max-w-[180px] truncate py-2 font-medium">
                    {item.description}
                  </td>
                  <td className="max-w-[120px] truncate py-2 text-muted-foreground">
                    {item.common_name ?? "—"}
                  </td>
                  <td className="py-2">{item.quantity ?? "—"}</td>
                  <td className="py-2">
                    {item.unit_price
                      ? formatCurrency(item.unit_price, { precise: true })
                      : "—"}
                  </td>
                  <td className="py-2 font-medium">
                    {formatCurrency(item.line_total, { precise: true })}
                  </td>
                  <td className="max-w-[120px] truncate py-2 text-muted-foreground">
                    {item.vendor_name ?? "—"}
                  </td>
                  <td className="max-w-[140px] truncate py-2 text-muted-foreground">
                    {item.bill_name}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingItem({
                            billId: item.bill_id,
                            lineItemId: item.line_item_id,
                          })
                        }
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`Edit ${item.description}`}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDeletingItem({
                            billId: item.bill_id,
                            lineItemId: item.line_item_id,
                            description: item.description,
                          })
                        }
                        className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Delete ${item.description}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* Always mounted (not conditionally rendered) so Base UI's own close transition gets
          to play instead of the dialog vanishing instantly when state clears to null - see
          vendor-table.tsx's identical comment for the full reasoning. */}
      <LineItemEditDialog
        billId={editingItem?.billId ?? ""}
        lineItemId={editingItem?.lineItemId ?? ""}
        categories={categories}
        open={editingItem !== null}
        onOpenChange={(open) => {
          if (!open) setEditingItem(null);
        }}
        onSaved={onChanged}
      />
      <LineItemDeleteDialog
        billId={deletingItem?.billId ?? ""}
        lineItemId={deletingItem?.lineItemId ?? ""}
        description={deletingItem?.description ?? ""}
        open={deletingItem !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingItem(null);
        }}
        onDeleted={onChanged}
      />
    </ChartCard>
  );
}
