import { Construction } from "lucide-react";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ComingSoonProps = {
  title: string;
  description: string;
  className?: string;
};

// Placeholder for a sidebar section whose analytics content hasn't been built yet (see the
// 5A-5D build phases in frontend/CLAUDE.md) - keeps every nav link real instead of 404ing.
// Construction (not Sparkles) - Sparkles reads as a generic "AI-generated" cliché, already
// rejected for the same reason on the sidebar's Agent Insights icon.
export function ComingSoon({ title, description, className }: ComingSoonProps) {
  return (
    <Card
      className={cn(
        "rounded-xl border border-dashed border-border bg-muted/30 py-10 text-center shadow-sm ring-0 motion-safe:animate-in motion-safe:fade-in motion-safe:animation-duration-500 motion-safe:fill-mode-both xl:py-16",
        className,
      )}
    >
      <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary xl:size-12">
        <Construction className="size-5 xl:size-6" />
      </span>
      <CardHeader className="w-full">
        <span className="text-[11px] font-semibold tracking-wide text-primary uppercase">
          Coming soon
        </span>
        <CardTitle>{title}</CardTitle>
        <CardDescription className="mx-auto max-w-sm">
          {description}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
