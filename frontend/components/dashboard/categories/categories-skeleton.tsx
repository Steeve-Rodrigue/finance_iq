import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Mirrors CategoriesPage's real layout (PageHeader + CategoryFilters bar + SectionHeader +
// CategoriesKpiTiles grid + category table + charts section) so nothing jumps when
// GET /analytics/categories resolves.
export function CategoriesSkeleton() {
  return (
    <div
      className="flex flex-col gap-6 pt-4"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex flex-col gap-5 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 pb-5">
        <div className="flex items-center gap-3">
          <Skeleton className="size-11 shrink-0 rounded-xl" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-28 xl:h-7 xl:w-36" />
            <Skeleton className="h-3 w-44" />
          </div>
        </div>
        <div className="hidden h-px bg-border md:block" />
      </div>
      <Skeleton className="h-9 rounded-lg md:h-14 md:rounded-xl xl:h-16 xl:rounded-2xl" />
      <Skeleton className="mt-3 -mb-3 h-5 w-28 md:mt-1" />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3 xl:gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn(
              "h-16 rounded-lg xl:h-32 xl:rounded-2xl",
              i === 2 && "col-span-2 xl:col-span-1",
            )}
          />
        ))}
      </div>
      <Skeleton className="-mt-2 -mb-3 h-5 w-32 md:mt-0" />
      <Skeleton className="h-[220px] rounded-xl xl:rounded-2xl" />
      <Skeleton className="-mt-2 -mb-3 h-5 w-20 md:mt-0" />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-[240px] rounded-xl xl:rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-[260px] rounded-xl xl:rounded-2xl" />
    </div>
  );
}
