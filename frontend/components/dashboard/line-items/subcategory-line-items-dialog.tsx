"use client";

import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ApiError,
  getLineItemsForSubcategory,
  type SubcategoryLineItemRow,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";

type SubcategoryLineItemsDialogProps = {
  subcategoryId: string;
  subcategoryName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// Opened by clicking a subcategory/sub-subcategory node in spending-category-tree-chart.tsx -
// read-only (editing a line item's own category already lives in LineItemsTable's row action,
// not duplicated here). For a node with children, the backend already rolls in every
// descendant's items, hence the "Sub-category" column - the rows here can span more than one
// leaf when the clicked node is a parent.
export function SubcategoryLineItemsDialog({
  subcategoryId,
  subcategoryName,
  open,
  onOpenChange,
}: SubcategoryLineItemsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<SubcategoryLineItemRow[]>([]);

  useEffect(() => {
    if (!open) return;
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (!cancelled) setLoading(true);
      })
      .then(() => getLineItemsForSubcategory(token, subcategoryId))
      .then((res) => {
        if (cancelled) return;
        setRows(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Failed to load line items.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, subcategoryId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{subcategoryName}</DialogTitle>
          <DialogDescription>Line items in this sub-category</DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No line items found.</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Description</th>
                  <th className="py-1.5 pr-2 font-medium">Sub-category</th>
                  <th className="py-1.5 pr-2 font-medium">Vendor</th>
                  <th className="py-1.5 pr-2 font-medium">Bill</th>
                  <th className="py-1.5 pl-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.line_item_id}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="py-1.5 pr-2">
                      {row.common_name || row.description}
                    </td>
                    <td className="py-1.5 pr-2 text-muted-foreground">
                      {row.subcategory_name}
                    </td>
                    <td className="py-1.5 pr-2 text-muted-foreground">
                      {row.vendor_name ?? "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-muted-foreground">
                      {row.bill_name}
                    </td>
                    <td className="py-1.5 pl-2 text-right font-medium">
                      {formatCurrency(row.line_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
