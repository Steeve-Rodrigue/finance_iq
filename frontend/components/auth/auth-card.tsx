import { Landmark } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-slate-100 to-slate-100 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute top-0 left-0 size-96 rounded-full bg-slate-300/40 blur-3xl dark:bg-slate-500/10" />
        <div className="absolute right-0 bottom-0 size-96 rounded-full bg-slate-300/40 blur-3xl dark:bg-slate-500/10" />
      </div>

      <Card className="relative z-10 w-full max-w-md rounded-2xl border-border/60 bg-card/80 shadow-xl backdrop-blur-md">
        <CardContent className="flex flex-col gap-4 p-5 sm:gap-6 sm:p-8">
          <div className="flex flex-col items-center gap-2 text-center animate-in fade-in duration-500 sm:gap-3">
            <div className="animate-in zoom-in flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg duration-500 sm:size-14">
              <Landmark className="size-6 sm:size-7" />
            </div>
            <h1 className="text-2xl font-bold text-primary sm:text-3xl">
              FinanceIQ
            </h1>
          </div>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
