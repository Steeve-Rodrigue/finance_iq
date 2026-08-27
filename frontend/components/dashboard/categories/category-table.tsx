"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import { CategoryDeleteDialog } from "@/components/dashboard/categories/category-delete-dialog";
import { CategoryFormDialog } from "@/components/dashboard/categories/category-form-dialog";
import { Button } from "@/components/ui/button";
import type { CategoryTableRow } from "@/lib/api";
import { formatCurrency, formatPercent } from "@/lib/format";

type CategoryTableProps = {
  rows: CategoryTableRow[];
  className?: string;
  // Called after a successful create/edit/delete so the page can refetch the categories
  // analytics - this table only holds the read model handed to it via `rows`, it doesn't own
  // that data.
  onChanged: () => void;
};

type SortKey =
  | "name"
  | "bill_count"
  | "total_spent"
  | "avg_bill_amount"
  | "pct_of_total_spend";

type Column = { key: SortKey; label: string };

const COLUMNS: Column[] = [
  { key: "name", label: "Category" },
  { key: "bill_count", label: "Bills" },
  { key: "total_spent", label: "Total spent" },
  { key: "avg_bill_amount", label: "Avg bill" },
  { key: "pct_of_total_spend", label: "% of spend" },
];

function sortValue(row: CategoryTableRow, key: SortKey): string | number {
  switch (key) {
    case "name":
      return row.name.toLowerCase();
    case "bill_count":
      return row.bill_count;
    case "total_spent":
      return Number(row.total_spent);
    case "avg_bill_amount":
      return Number(row.avg_bill_amount);
    case "pct_of_total_spend":
      return Number(row.pct_of_total_spend);
  }
}

// frontend/CLAUDE.md's Categories "category table": name, bill count, total spent, avg bill
// amount, % of total spend - sortable. Actions: edit (name, slug), delete (blocked if bills
// linked). Create new category button (top of table, in ChartCard's actions slot).
export function CategoryTable({
  rows,
  className,
  onChanged,
}: CategoryTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("total_spent");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // formCategoryId: null = create mode, an id = edit mode (CategoryFormDialog itself treats
  // categoryId === null as create). Visibility is driven by the separate formOpen flag, not
  // by formCategoryId's nullness - the dialog element below stays mounted at all times (see
  // its "Always mounted" comment), so resetting formCategoryId to null on close is harmless.
  const [formCategoryId, setFormCategoryId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

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
      title="All categories"
      subtitle="How your spend is sorted"
      className={className}
      actions={
        <Button
          size="sm"
          onClick={() => {
            setFormCategoryId(null);
            setFormOpen(true);
          }}
        >
          <Plus />
          New category
        </Button>
      }
    >
      {rows.length === 0 ? (
        <div className="flex h-[120px] items-center justify-center text-xs text-muted-foreground">
          No categories yet
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
              {sorted.map((row) => (
                <tr
                  key={row.category_id}
                  className="border-t border-border/60 text-foreground"
                >
                  <td className="max-w-[160px] truncate py-2 font-medium">
                    {row.name}
                  </td>
                  <td className="py-2">{row.bill_count}</td>
                  <td className="py-2">
                    {formatCurrency(row.total_spent, { precise: true })}
                  </td>
                  <td className="py-2">
                    {formatCurrency(row.avg_bill_amount, { precise: true })}
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {formatPercent(row.pct_of_total_spend, 1)}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setFormCategoryId(row.category_id);
                          setFormOpen(true);
                        }}
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`Edit ${row.name}`}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDeletingCategory({
                            id: row.category_id,
                            name: row.name,
                          })
                        }
                        className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Delete ${row.name}`}
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
      <CategoryFormDialog
        categoryId={formCategoryId}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setFormCategoryId(null);
        }}
        onSaved={onChanged}
      />
      <CategoryDeleteDialog
        categoryId={deletingCategory?.id ?? ""}
        categoryName={deletingCategory?.name ?? ""}
        open={deletingCategory !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingCategory(null);
        }}
        onDeleted={onChanged}
      />
    </ChartCard>
  );
}
