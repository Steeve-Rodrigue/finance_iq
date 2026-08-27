"use client";

import { MessageCircleQuestion, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, answerElicitation, type PendingQuestion } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { getToken } from "@/lib/auth";

type PendingQuestionItemProps = {
  question: PendingQuestion;
  onAnswered: () => void;
};

// One pending elicitation, with the textarea+submit that actually answers it - the real
// pause/resume entry point (POST /bills/{bill_id}/elicitations/{elicitation_id}/answer,
// backend/app/routers/elicitations.py), not a plain field edit. A 422 means the backend's
// OpenRouter call couldn't turn the reply into structured field corrections
// (bill_parser_service.py::parse_elicitation_answer) - that reaches here as ApiError.message
// already phrased as "please rephrase", so it's shown as-is rather than re-worded.
export function PendingQuestionItem({
  question,
  onAnswered,
}: PendingQuestionItemProps) {
  const [answerText, setAnswerText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || answerText.trim() === "") return;
    setSubmitting(true);
    answerElicitation(
      token,
      question.bill_id,
      question.elicitation_id,
      answerText,
    )
      .then(() => {
        toast.success("Answer submitted");
        onAnswered();
      })
      .catch((err: unknown) => {
        toast.error(
          err instanceof ApiError ? err.message : "Failed to submit answer.",
        );
      })
      .finally(() => setSubmitting(false));
  }

  return (
    <li className="flex flex-col gap-2.5 rounded-lg border border-border/60 p-3">
      <div className="flex items-start gap-2.5">
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
          {/* whitespace-pre-line, not a plain <p> - the backend's question text is real
              multi-line content (a reasoning sentence, then a "Champs à vérifier :" bulleted
              list of specific fields, then a closing question - see
              backend/app/services/bill_parser_service.py::build_elicitation_question). A
              plain <p> collapses those \n's into one run-on line and loses the list
              entirely; pre-line keeps the line breaks while still wrapping long lines
              normally. */}
          <p className="mt-1.5 rounded-md bg-muted/50 p-2 text-[11px] whitespace-pre-line text-foreground/80">
            {question.question}
          </p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 pl-[42px]">
        <Textarea
          value={answerText}
          onChange={(e) => setAnswerText(e.target.value)}
          placeholder="Type your answer..."
          disabled={submitting}
          className="text-xs"
          rows={2}
        />
        <Button
          type="submit"
          size="sm"
          disabled={submitting || answerText.trim() === ""}
          className="self-end"
        >
          <Send />
          {submitting ? "Submitting..." : "Submit"}
        </Button>
      </form>
    </li>
  );
}
