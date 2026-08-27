"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, deleteBill } from "@/lib/api";
import { getToken } from "@/lib/auth";

type BillDeleteDialogProps = {
  billId: string;
  billName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
};

// frontend/CLAUDE.md's Bills Explorer "delete (with confirmation)" row action. Unlike
// vendor/category delete, backend/app/services/bills_service.py::delete_bill has no
// referenced-by-other-records guard - a bill isn't something else points at - so there's no
// 409 case to special-case here, just success or a genuine error.
export function BillDeleteDialog({
  billId,
  billName,
  open,
  onOpenChange,
  onDeleted,
}: BillDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false);

  function handleDelete() {
    const token = getToken();
    if (!token) return;
    setDeleting(true);
    deleteBill(token, billId)
      .then(() => {
        toast.success(`${billName} deleted`);
        onDeleted();
        onOpenChange(false);
      })
      .catch((err: unknown) => {
        toast.error(
          err instanceof ApiError ? err.message : "Failed to delete bill.",
        );
      })
      .finally(() => setDeleting(false));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {billName}?</DialogTitle>
          <DialogDescription>
            This permanently deletes the bill and its line items. This
            can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="outline" disabled={deleting}>
                Cancel
              </Button>
            }
          />
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete bill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
