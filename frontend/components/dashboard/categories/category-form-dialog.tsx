"use client";

import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiError,
  createCategory,
  getCategory,
  updateCategory,
  type CategoryRead,
} from "@/lib/api";
import { getToken } from "@/lib/auth";

type CategoryFormDialogProps = {
  // null = create a new category. A string = edit that category.
  categoryId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (category: CategoryRead) => void;
};

// frontend/CLAUDE.md's Categories "Create new category button" and table "edit (name, slug)"
// action, combined into one dialog since both are the same name+slug form - just create vs.
// update underneath. Edit mode fetches the plain CRUD resource (GET /categories/{id}) fresh on
// open: CategoryTableRow (the analytics row this table renders) doesn't carry `slug`, only
// name/bill_count/totals, so there's nothing to prefill from without this fetch.
export function CategoryFormDialog({
  categoryId,
  open,
  onOpenChange,
  onSaved,
}: CategoryFormDialogProps) {
  const isEdit = categoryId !== null;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    if (!isEdit) {
      // Runs inside a resolved-promise callback, not synchronously in the effect body, for
      // the same react-hooks/set-state-in-effect reason as the fetch branch below.
      Promise.resolve().then(() => {
        if (cancelled) return;
        setName("");
        setSlug("");
      });
      return () => {
        cancelled = true;
      };
    }
    const token = getToken();
    if (!token) return;
    // setLoading(true) runs inside this first .then, not synchronously in the effect body, so
    // it's a reaction to the fetch starting rather than a direct effect-body setState call
    // (same pattern used throughout this app - see Overview's trendLoading).
    Promise.resolve()
      .then(() => {
        if (!cancelled) setLoading(true);
      })
      .then(() => getCategory(token, categoryId))
      .then((category) => {
        if (cancelled) return;
        setName(category.name);
        setSlug(category.slug);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        toast.error(
          err instanceof ApiError ? err.message : "Failed to load category.",
        );
        onOpenChange(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetches on every open, not on onOpenChange identity changes
  }, [open, isEdit, categoryId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setSaving(true);
    const request = isEdit
      ? updateCategory(token, categoryId, { name, slug })
      : createCategory(token, { name, slug });
    request
      .then((category) => {
        toast.success(isEdit ? "Category updated" : "Category created");
        onSaved(category);
        onOpenChange(false);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 409) {
          toast.error("That slug is already in use.");
          return;
        }
        toast.error(
          err instanceof ApiError
            ? err.message
            : `Failed to ${isEdit ? "update" : "create"} category.`,
        );
      })
      .finally(() => setSaving(false));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit category" : "New category"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this category's name or slug."
              : "Add a category to sort bills into."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category-form-name">Name</Label>
            <Input
              id="category-form-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category-form-slug">Slug</Label>
            <Input
              id="category-form-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={loading}
              required
            />
            <p className="text-[11px] text-muted-foreground">
              Normalized identifier used to match this category across bills.
            </p>
          </div>
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={saving}>
                  Cancel
                </Button>
              }
            />
            <Button type="submit" disabled={loading || saving}>
              {saving
                ? "Saving..."
                : isEdit
                  ? "Save changes"
                  : "Create category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
