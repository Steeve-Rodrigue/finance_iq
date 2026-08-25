import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  title: string;
  description?: string;
  className?: string;
};

// Plain bold label introducing a page's sections - no badge/rule/index, kept minimal so it
// doesn't compete for space with the content below it.
export function SectionHeader({
  title,
  description,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:animation-duration-500 motion-safe:delay-75 motion-safe:fill-mode-both",
        className,
      )}
    >
      <div className="flex items-center gap-3 md:block">
        <span aria-hidden="true" className="h-px flex-1 bg-border md:hidden" />
        <h2 className="shrink-0 text-xs font-bold text-foreground md:text-base">
          {title}
        </h2>
        <span aria-hidden="true" className="h-px flex-1 bg-border md:hidden" />
      </div>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
