import { CheckCircle2 } from "lucide-react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import { PendingQuestionItem } from "@/components/dashboard/elicitations/pending-question-item";
import type { PendingQuestion } from "@/lib/api";

type PendingQuestionsListProps = {
  questions: PendingQuestion[];
  onAnswered: () => void;
  className?: string;
};

// frontend/CLAUDE.md's Elicitations "Pending questions (bottom section)": full answering UI,
// not the read-only preview Overview's PendingQuestions component shows - absorbs the former
// standalone /clarify.html page. Each question is its own PendingQuestionItem with its own
// textarea + submit, since they're answered independently.
export function PendingQuestionsList({
  questions,
  onAnswered,
  className,
}: PendingQuestionsListProps) {
  return (
    <ChartCard
      title="Pending questions"
      subtitle="Answer to let the agent finish these bills"
      className={className}
    >
      {questions.length === 0 ? (
        <div className="flex h-[160px] flex-col items-center justify-center gap-2 text-center">
          <span className="flex size-9 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
            <CheckCircle2 className="size-5" />
          </span>
          <p className="text-xs text-muted-foreground">
            All caught up - no pending questions
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {questions.map((question) => (
            <PendingQuestionItem
              key={question.elicitation_id}
              question={question}
              onAnswered={onAnswered}
            />
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
