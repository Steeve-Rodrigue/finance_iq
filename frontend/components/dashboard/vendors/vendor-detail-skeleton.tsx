import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the vendor detail page's real layout (back link + PageHeader with its Edit button +
// stats row + trend chart + bills history table) so nothing jumps when
// GET /analytics/vendors/{id} resolves.
export function VendorDetailSkeleton() {
  return (
    <div
      className="flex flex-col gap-6 pt-4"
      aria-busy="true"
      aria-live="polite"
    >
      <Skeleton className="h-4 w-24" />
      <div className="flex flex-col gap-5 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 pb-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 shrink-0 rounded-xl" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-40 xl:h-7 xl:w-52" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
          <Skeleton className="h-7 w-16 shrink-0 rounded-lg" />
        </div>
        <div className="hidden h-px bg-border md:block" />
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-16 rounded-lg xl:h-32 xl:rounded-2xl"
          />
        ))}
      </div>
      <Skeleton className="h-[220px] rounded-xl xl:rounded-2xl" />
      <Skeleton className="h-[220px] rounded-xl xl:rounded-2xl" />
    </div>
  );
}
