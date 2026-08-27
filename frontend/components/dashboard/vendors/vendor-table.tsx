"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import { VendorDeleteDialog } from "@/components/dashboard/vendors/vendor-delete-dialog";
import { VendorEditDialog } from "@/components/dashboard/vendors/vendor-edit-dialog";
import type { VendorTableRow } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

type VendorTableProps = {
  rows: VendorTableRow[];
  className?: string;
  // Called after a successful edit or delete so the page can refetch the vendors analytics -
  // this table only holds the read model handed to it via `rows`, it doesn't own that data.
  onChanged: () => void;
};

type SortKey =
  | "name"
  | "key"
  | "bill_count"
  | "total_spent"
  | "avg_bill_amount"
  | "last_bill_date";

type Column = { key: SortKey; label: string };

const COLUMNS: Column[] = [
  { key: "name", label: "Vendor" },
  { key: "key", label: "Key" },
  { key: "bill_count", label: "Bills" },
  { key: "total_spent", label: "Total spent" },
  { key: "avg_bill_amount", label: "Avg bill" },
  { key: "last_bill_date", label: "Last bill" },
];

function sortValue(row: VendorTableRow, key: SortKey): string | number {
  switch (key) {
    case "name":
      return row.name.toLowerCase();
    case "key":
      return row.key.toLowerCase();
    case "bill_count":
      return row.bill_count;
    case "total_spent":
      return Number(row.total_spent);
    case "avg_bill_amount":
      return Number(row.avg_bill_amount);
    case "last_bill_date":
      // Nulls sort last regardless of direction - treated as "no date" rather than "oldest".
      return row.last_bill_date ?? "";
  }
}

// frontend/CLAUDE.md's Vendors "vendor table": name, key, bill count, total spent, avg bill
// amount, last bill date, most frequent category - sortable, name links to vendor detail.
// Edit/delete actions (name, address, key; delete blocked if bills linked) open
// VendorEditDialog/VendorDeleteDialog, both backed by the plain CRUD /vendors/{id} endpoints.
export function VendorTable({ rows, className, onChanged }: VendorTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("total_spent");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [deletingVendor, setDeletingVendor] = useState<{
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
      title="All vendors"
      subtitle="Click a vendor to see its spending history"
      className={className}
    >
      {rows.length === 0 ? (
        <div className="flex h-[120px] items-center justify-center text-xs text-muted-foreground">
          No vendors yet
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
                <th className="pb-2 font-medium">Top category</th>
                <th className="pb-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr
                  key={row.vendor_id}
                  className="border-t border-border/60 text-foreground"
                >
                  <td className="max-w-[160px] py-2 font-medium">
                    <Link
                      href={`/dashboard/vendors/${row.vendor_id}`}
                      className="truncate text-primary hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="max-w-[120px] truncate py-2 text-muted-foreground">
                    {row.key}
                  </td>
                  <td className="py-2">{row.bill_count}</td>
                  <td className="py-2">
                    {formatCurrency(row.total_spent, { precise: true })}
                  </td>
                  <td className="py-2">
                    {formatCurrency(row.avg_bill_amount, { precise: true })}
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {row.last_bill_date
                      ? new Intl.DateTimeFormat("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        }).format(new Date(row.last_bill_date))
                      : "—"}
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {row.most_frequent_category ?? "—"}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingVendorId(row.vendor_id)}
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`Edit ${row.name}`}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDeletingVendor({
                            id: row.vendor_id,
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
      {/* Always mounted (not conditionally rendered on the id being set) so Base UI's own
          close transition (data-ending-style, see components/ui/dialog.tsx) gets to play
          instead of the dialog vanishing instantly when the id is cleared to null. */}
      <VendorEditDialog
        vendorId={editingVendorId ?? ""}
        open={editingVendorId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingVendorId(null);
        }}
        onSaved={onChanged}
      />
      <VendorDeleteDialog
        vendorId={deletingVendor?.id ?? ""}
        vendorName={deletingVendor?.name ?? ""}
        open={deletingVendor !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingVendor(null);
        }}
        onDeleted={onChanged}
      />
    </ChartCard>
  );
}
