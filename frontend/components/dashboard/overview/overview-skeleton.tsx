import { Skeleton } from "@/components/ui/skeleton";

// Mirrors OverviewPage's real layout (PageHeader + SectionHeader + KpiTiles grid + charts +
// recent uploads/pending questions) so nothing jumps when GET /analytics/overview resolves.
export function OverviewSkeleton() {
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
      <Skeleton className="-mt-4 -mb-3 h-5 w-28 md:-mt-1" />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4 xl:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-16 rounded-lg xl:h-32 xl:rounded-2xl"
          />
        ))}
      </div>
      <Skeleton className="-mt-5 -mb-3 h-5 w-20 md:-mt-3" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:gap-4">
        <Skeleton className="h-[276px] rounded-xl md:col-span-2 xl:h-[292px] xl:rounded-2xl" />
        <Skeleton className="h-[276px] rounded-xl xl:h-[292px] xl:rounded-2xl" />
        <Skeleton className="h-[276px] rounded-xl xl:h-[292px] xl:rounded-2xl" />
      </div>
      <Skeleton className="-mt-5 -mb-3 h-5 w-32 md:-mt-3" />
      <div className="flex flex-col gap-3 xl:gap-4">
        <Skeleton className="h-[260px] rounded-xl xl:rounded-2xl" />
        <Skeleton className="h-[260px] rounded-xl xl:rounded-2xl" />
      </div>
    </div>
  );
}
