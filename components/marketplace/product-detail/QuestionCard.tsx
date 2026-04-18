"use client";

import { useState } from "react";
import { MessageCircle, CornerDownRight, ThumbsUp, Store, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MockQuestion, MockAnswer } from "@/lib/mocks/product-qa.mock";

interface QuestionCardProps {
  question: MockQuestion;
  onAnswerHelpful?: (answerId: string) => void | Promise<void>;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) return "hoy";
  if (days < 2) return "ayer";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} ${months === 1 ? "mes" : "meses"}`;
  const years = Math.floor(days / 365);
  return `hace ${years} ${years === 1 ? "año" : "años"}`;
}

function AnswerItem({
  answer,
  onHelpful,
}: {
  answer: MockAnswer;
  onHelpful?: (id: string) => void | Promise<void>;
}) {
  const [voted, setVoted] = useState(false);
  const [count, setCount] = useState(answer.helpfulCount);

  const handleVote = async () => {
    if (voted) return;
    setVoted(true);
    setCount((n) => n + 1);
    try {
      await onHelpful?.(answer.id);
    } catch {
      setVoted(false);
      setCount((n) => n - 1);
    }
  };

  return (
    <div className="flex items-start gap-3 pt-3 border-t border-gray-100 dark:border-gray-800 first:border-t-0 first:pt-0">
      <CornerDownRight className="h-4 w-4 text-gray-300 dark:text-gray-600 mt-1 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "inline-flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold shrink-0",
              answer.isVendor
                ? "bg-primary text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
            )}
          >
            {answer.isVendor ? <Store className="h-3.5 w-3.5" /> : initials(answer.userName)}
          </span>
          <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {answer.userName}
          </span>
          {answer.isVendor && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
              Respuesta del vendedor
            </span>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400">
            · {relativeTime(answer.createdAt)}
          </span>
        </div>

        <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
          {answer.body}
        </p>

        <button
          onClick={handleVote}
          disabled={voted}
          className={cn(
            "mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors",
            voted
              ? "bg-primary/10 text-primary cursor-default"
              : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white",
          )}
        >
          <ThumbsUp className={cn("h-3 w-3", voted && "fill-current")} />
          Útil ({count})
        </button>
      </div>
    </div>
  );
}

export default function QuestionCard({ question, onAnswerHelpful }: QuestionCardProps) {
  const answerCount = question.answers.length;

  return (
    <article className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
      {/* Pregunta */}
      <header className="flex items-start gap-3">
        <div className="h-9 w-9 shrink-0 rounded-full bg-warning/10 text-warning flex items-center justify-center">
          <MessageCircle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" />
              {question.userName}
            </span>
            <span>·</span>
            <span>{relativeTime(question.createdAt)}</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white leading-snug">
            {question.question}
          </p>
        </div>
      </header>

      {/* Respuestas */}
      {answerCount > 0 && (
        <div className="mt-4 pl-0 sm:pl-12 space-y-3">
          {question.answers.map((a) => (
            <AnswerItem key={a.id} answer={a} onHelpful={onAnswerHelpful} />
          ))}
        </div>
      )}

      {answerCount === 0 && (
        <p className="mt-3 pl-0 sm:pl-12 text-xs text-gray-500 dark:text-gray-400 italic">
          Aún nadie responde esta pregunta.
        </p>
      )}
    </article>
  );
}
