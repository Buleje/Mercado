"use client";

import { useState, useEffect, useCallback } from "react";
import { HelpCircle, Plus, Loader2, ChevronDown } from "lucide-react";
import type { MockQuestion } from "@/lib/mocks/product-qa.mock";
import QuestionCard from "./QuestionCard";
import AskQuestionModal from "./AskQuestionModal";

interface ProductQAProps {
  productId: number;
  storeName: string;
}

const INITIAL_VISIBLE = 3;

export default function ProductQA({ productId, storeName }: ProductQAProps) {
  const [questions, setQuestions] = useState<MockQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(INITIAL_VISIBLE);
  const [askOpen, setAskOpen] = useState(false);

  const fetchQA = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/marketplace/qa/${productId}`);
      if (!res.ok) throw new Error("Failed to load Q&A");
      const json = await res.json();
      const arr: MockQuestion[] = Array.isArray(json?.data) ? json.data : [];
      setQuestions(arr);
    } catch {
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchQA();
  }, [fetchQA]);

  const handleAnswerHelpful = useCallback(
    async (answerId: string) => {
      await fetch(`/api/marketplace/qa/${productId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: "helpful-vote",
          userName: "voter",
          body: "vote",
        }),
      }).catch(() => {
        /* noop — optimistic UI; el ratings-server no rompe */
      });
      void answerId;
    },
    [productId],
  );

  const totalAnswers = questions.reduce((sum, q) => sum + q.answers.length, 0);

  const canShowMore = questions.length > visible;
  const visibleQuestions = questions.slice(0, visible);

  return (
    <section aria-labelledby={`qa-heading-${productId}`} className="space-y-5">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-primary" />
          <h2
            id={`qa-heading-${productId}`}
            className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white"
          >
            Preguntas de la comunidad
            {questions.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                ({questions.length})
              </span>
            )}
          </h2>
        </div>
        <button
          onClick={() => setAskOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Hacer pregunta</span>
          <span className="sm:hidden">Preguntar</span>
        </button>
      </header>

      {totalAnswers > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {totalAnswers} respuestas de {storeName} y la comunidad.
        </p>
      )}

      {loading && questions.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-gray-500 dark:text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span className="text-sm">Cargando preguntas…</span>
        </div>
      ) : questions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-800 py-12 text-center">
          <HelpCircle className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            Aún nadie ha preguntado sobre este producto.
          </p>
          <button
            onClick={() => setAskOpen(true)}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-dark"
          >
            <Plus className="h-3.5 w-3.5" />
            Haz la primera pregunta
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleQuestions.map((q) => (
            <QuestionCard key={q.id} question={q} onAnswerHelpful={handleAnswerHelpful} />
          ))}
        </div>
      )}

      {canShowMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setVisible((v) => v + INITIAL_VISIBLE)}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-5 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronDown className="h-4 w-4" />
            Ver todas las preguntas ({questions.length - visible} más)
          </button>
        </div>
      )}

      <AskQuestionModal
        open={askOpen}
        onClose={() => setAskOpen(false)}
        productId={productId}
        storeName={storeName}
        onSubmitted={() => fetchQA()}
      />
    </section>
  );
}
