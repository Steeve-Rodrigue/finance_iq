import { CheckCircle2, MessageCircleQuestion } from "lucide-react";
import Link from "next/link";

import type { PendingQuestion } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

import { ChartCard } from "./chart-card";

type PendingQuestionsProps = {
  questions: PendingQuestion[];
  className?: string;
};

// frontend/CLAUDE.md's Overview "Pending questions" section: 3-5 pending elicitations (bill
// name, vendor, amount, question text). Read-only preview - answering happens on the
// Elicitations page (absorbs the old Clarify page), linked to via the header action.
export function PendingQuestions({
  questions,
  className,
}: PendingQuestionsProps) {
  return (
    <ChartCard
      title="Pending questions"
      subtitle="Waiting on your input"
      className={className}
      actions={
        questions.length > 0 && (
          <Link
            href="/dashboard/elicitations"
            className="text-[11px] font-medium text-primary hover:underline"
          >
            View all
          </Link>
        )
      }
    >
      {questions.length === 0 ? (
        <div className="flex h-[180px] flex-col items-center justify-center gap-2 text-center">
          <span className="flex size-9 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
            <CheckCircle2 className="size-5" />
          </span>
          <p className="text-xs text-muted-foreground">
            All caught up - no pending questions
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-x-3 gap-y-1 md:grid-cols-2">
          {questions.map((question) => (
            <li
              key={question.elicitation_id}
              className="flex items-start gap-2.5 rounded-lg px-1.5 py-2 transition-colors hover:bg-muted/50"
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600">
                <MessageCircleQuestion className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {question.bill_name}
                  </p>
                  {question.amount && (
                    <span className="shrink-0 text-xs font-semibold text-foreground">
                      {formatCurrency(question.amount)}
                    </span>
                  )}
                </div>
                <p className="truncate text-[11px] text-muted-foreground">
                  {question.vendor_name ?? "Unknown vendor"}
                </p>
                <p className="mt-1 line-clamp-2 text-[11px] text-foreground/80 italic">
                  “{question.question}”
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
