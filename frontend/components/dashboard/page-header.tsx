import type { LucideIcon } from "lucide-react";

type PageHeaderProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
};

// The page-level title (e.g. "Overview", matching the sidebar's icon+label for that page) -
// distinct from SectionHeader, which numbers/labels the sections within the page.
export function PageHeader({
  icon: Icon,
  title,
  description,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-5 rounded-2xl  border border-border  bg-gradient-to-r from-top-card/100 via-top-card/80 to-transparent p-4 pb-5 shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:animation-duration-500 motion-safe:fill-mode-both">
      <div className="flex items-center gap-3">
        <span className="relative flex shrink-0">
          <span className="absolute inset-0 rounded-xl bg-primary/40 blur-md" />
          <span className="relative flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-md ring-1 ring-primary/20">
            <Icon className="size-5" />
          </span>
        </span>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent xl:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="hidden h-px bg-gradient-to-r from-primary/40 via-border to-transparent md:block" />
    </div>
  );
}
