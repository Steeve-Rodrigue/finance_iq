import { Skeleton } from "@/components/ui/skeleton";

// Mirrors BillsExplorerPage's real layout (PageHeader with its Upload button + BillFilters
// bar + BillsTable) so nothing jumps when GET /bills/ (plus the vendors/categories lookups)
// resolves. No KPI tiles/charts on this page - it's a table-first explorer, not an analytics
// page.
export function BillsSkeleton() {
  return (
    <div
      className="flex flex-col gap-6 pt-4"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex flex-col gap-5 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 pb-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 shrink-0 rounded-xl" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-36 xl:h-7 xl:w-44" />
              <Skeleton className="h-3 w-52" />
            </div>
          </div>
          <Skeleton className="h-7 w-24 shrink-0 rounded-lg" />
        </div>
        <div className="hidden h-px bg-border md:block" />
      </div>
      <Skeleton className="h-9 rounded-lg md:h-14 md:rounded-xl xl:h-16 xl:rounded-2xl" />
      <Skeleton className="h-[420px] rounded-xl xl:rounded-2xl" />
    </div>
  );
}
