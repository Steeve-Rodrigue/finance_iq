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
import { ApiError, deleteCategory } from "@/lib/api";
import { getToken } from "@/lib/auth";

type CategoryDeleteDialogProps = {
  categoryId: string;
  categoryName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
};

// frontend/CLAUDE.md's Categories "delete (blocked if bills linked)" action. The Delete button
// is a plain onClick handler, not a DialogClose - a 409 (bills still reference this category,
// see backend/app/services/categories_service.py's delete_category) must keep the dialog open
// with the error visible, not auto-close like Cancel does. Same pattern as
// vendor-delete-dialog.tsx.
export function CategoryDeleteDialog({
  categoryId,
  categoryName,
  open,
  onOpenChange,
  onDeleted,
}: CategoryDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false);

  function handleDelete() {
    const token = getToken();
    if (!token) return;
    setDeleting(true);
    deleteCategory(token, categoryId)
      .then(() => {
        toast.success(`${categoryName} deleted`);
        onDeleted();
        onOpenChange(false);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 409) {
          toast.error(
            "This category still has bills linked to it and can't be deleted.",
          );
          return;
        }
        toast.error(
          err instanceof ApiError ? err.message : "Failed to delete category.",
        );
      })
      .finally(() => setDeleting(false));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {categoryName}?</DialogTitle>
          <DialogDescription>
            This permanently deletes the category. Bills already linked to it
            will block the deletion until they&apos;re reassigned or removed.
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
            {deleting ? "Deleting..." : "Delete category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
