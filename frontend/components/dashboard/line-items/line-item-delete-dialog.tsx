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
import { ApiError, deleteLineItem } from "@/lib/api";
import { getToken } from "@/lib/auth";

type LineItemDeleteDialogProps = {
  billId: string;
  lineItemId: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
};

// frontend/CLAUDE.md's Line Items table "delete (confirmation)" row action. No conflict guard
// on the backend (backend/app/services/bill_line_items_service.py has no referenced-by-other-
// records check for a line item), so no 409 case to special-case here.
export function LineItemDeleteDialog({
  billId,
  lineItemId,
  description,
  open,
  onOpenChange,
  onDeleted,
}: LineItemDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false);

  function handleDelete() {
    const token = getToken();
    if (!token) return;
    setDeleting(true);
    deleteLineItem(token, billId, lineItemId)
      .then(() => {
        toast.success("Line item deleted");
        onDeleted();
        onOpenChange(false);
      })
      .catch((err: unknown) => {
        toast.error(
          err instanceof ApiError ? err.message : "Failed to delete line item.",
        );
      })
      .finally(() => setDeleting(false));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this line item?</DialogTitle>
          <DialogDescription>
            &ldquo;{description}&rdquo; will be permanently removed. This
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
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
