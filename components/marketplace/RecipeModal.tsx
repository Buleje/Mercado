"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import {
  X,
  Clock,
  Users,
  ShoppingBag,
  Check,
  Play,
  Pause,
  RotateCcw,
  ChefHat,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { RECIPE_ILLUSTRATIONS } from "@/components/marketplace/RecipeIllustrations";

export interface RecipeData {
  id: string;
  title: string;
  description: string;
  servings: number;
  time: string;
  category?: string;
  ingredients: string[];
  steps: { text: string; timerMin?: number }[];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  recipe: RecipeData | null;
  onAddIngredientsToCart?: (ingredients: string[]) => void;
}

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function RecipeModal({ open, onOpenChange, recipe, onAddIngredientsToCart }: Props) {
  const [checkedIng, setCheckedIng] = useState<Set<string>>(new Set());
  const [activeStep, setActiveStep] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStepIdx, setTimerStepIdx] = useState<number | null>(null);

  // Reset state on open/close
  useEffect(() => {
    if (!open) {
      setCheckedIng(new Set());
      setActiveStep(0);
      setTimerSeconds(null);
      setTimerRunning(false);
      setTimerStepIdx(null);
    }
  }, [open]);

  // Timer tick
  useEffect(() => {
    if (!timerRunning || timerSeconds === null) return;
    if (timerSeconds <= 0) {
      setTimerRunning(false);
      toast.success("⏰ Tiempo completado", {
        description: `Paso ${(timerStepIdx ?? 0) + 1}: ${recipe?.steps[timerStepIdx ?? 0]?.text}`,
      });
      // Haptic if available
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate([200, 100, 200]);
      }
      return;
    }
    const id = setTimeout(() => setTimerSeconds((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(id);
  }, [timerRunning, timerSeconds, timerStepIdx, recipe]);

  const startTimer = useCallback((stepIdx: number, minutes: number) => {
    setTimerStepIdx(stepIdx);
    setTimerSeconds(minutes * 60);
    setTimerRunning(true);
  }, []);

  const toggleTimer = () => setTimerRunning((r) => !r);
  const resetTimer = () => {
    if (timerStepIdx !== null && recipe) {
      const step = recipe.steps[timerStepIdx];
      if (step?.timerMin) {
        setTimerSeconds(step.timerMin * 60);
        setTimerRunning(false);
      }
    }
  };

  const toggleIng = (ing: string) => {
    setCheckedIng((prev) => {
      const next = new Set(prev);
      if (next.has(ing)) next.delete(ing);
      else next.add(ing);
      return next;
    });
  };

  const progress = useMemo(
    () => (recipe ? (checkedIng.size / recipe.ingredients.length) * 100 : 0),
    [checkedIng, recipe],
  );

  const handleAddAll = () => {
    if (!recipe || !onAddIngredientsToCart) return;
    onAddIngredientsToCart(recipe.ingredients);
    toast.success(`${recipe.ingredients.length} ingredientes agregados`, {
      description: `Para ${recipe.title}`,
    });
  };

  if (!recipe) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed inset-0 sm:inset-4 lg:inset-auto lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:max-w-3xl lg:w-full lg:max-h-[90vh] z-[61] bg-white dark:bg-gray-950 sm:rounded-3xl overflow-hidden flex flex-col shadow-2xl"
          aria-describedby={undefined}
        >
          {/* Header editorial sin emojis, con illustration line-art */}
          {(() => {
            const Illustration = RECIPE_ILLUSTRATIONS[recipe.id];
            return (
              <div className="relative flex items-center gap-5 p-6 shrink-0 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
                {Illustration && (
                  <div className="h-20 w-20 shrink-0 flex items-center justify-center rounded-xl bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800">
                    <Illustration
                      className="h-14 w-14 text-gray-800 dark:text-gray-200"
                      ariaLabel={recipe.title}
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {recipe.category && (
                    <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.2em] text-gray-400">
                      {recipe.category}
                    </span>
                  )}
                  <Dialog.Title className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-tight">
                    {recipe.title}
                  </Dialog.Title>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 line-clamp-2 leading-relaxed">
                    {recipe.description}
                  </p>
                  <div className="mt-3 flex items-center gap-4 text-[length:var(--ts-2xs)] text-gray-600 dark:text-gray-300">
                    <span className="inline-flex items-center gap-1 tabular-nums font-semibold">
                      <Clock className="h-3 w-3" strokeWidth={1.75} />
                      {recipe.time}
                    </span>
                    <span className="inline-flex items-center gap-1 tabular-nums font-semibold">
                      <Users className="h-3 w-3" strokeWidth={1.75} />
                      {recipe.servings} porciones
                    </span>
                  </div>
                </div>
                <Dialog.Close className="absolute top-4 right-4 h-8 w-8 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-center">
                  <X className="h-3.5 w-3.5 text-gray-600 dark:text-gray-300" strokeWidth={1.75} />
                  <span className="sr-only">Cerrar</span>
                </Dialog.Close>
              </div>
            );
          })()}

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* Ingredientes con checklist */}
            <section>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-sm font-extrabold uppercase tracking-wide text-gray-500 inline-flex items-center gap-1.5">
                  <ShoppingBag className="h-3.5 w-3.5" />
                  Ingredientes
                </h3>
                <span className="text-[length:var(--ts-2xs)] font-bold text-primary tabular-nums">
                  {checkedIng.size}/{recipe.ingredients.length}
                </span>
              </div>
              <div className="h-1 w-full rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden mb-3">
                <div
                  className="h-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <ul className="space-y-2">
                {recipe.ingredients.map((ing) => {
                  const checked = checkedIng.has(ing);
                  return (
                    <li key={ing}>
                      <button
                        type="button"
                        onClick={() => toggleIng(ing)}
                        className={cn(
                          "w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left",
                          checked
                            ? "bg-primary/5 border-primary/30"
                            : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-primary/30",
                        )}
                      >
                        <span
                          className={cn(
                            "h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all",
                            checked
                              ? "bg-primary border-primary"
                              : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600",
                          )}
                        >
                          {checked && <Check className="h-3 w-3 text-white" />}
                        </span>
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            checked
                              ? "text-gray-400 line-through"
                              : "text-gray-800 dark:text-gray-200",
                          )}
                        >
                          {ing}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {onAddIngredientsToCart && (
                <button
                  type="button"
                  onClick={handleAddAll}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-white text-sm font-extrabold hover:bg-primary/90 active:scale-95 transition-all"
                >
                  <ShoppingBag className="h-4 w-4" />
                  Agregar todos al carrito
                </button>
              )}
            </section>

            {/* Pasos */}
            <section>
              <h3 className="text-sm font-extrabold uppercase tracking-wide text-gray-500 inline-flex items-center gap-1.5 mb-3">
                <ChefHat className="h-3.5 w-3.5" />
                Preparación
              </h3>
              <ol className="space-y-3">
                {recipe.steps.map((step, i) => {
                  const isActive = activeStep === i;
                  const isTimerOn = timerStepIdx === i;
                  return (
                    <li
                      key={i}
                      className={cn(
                        "relative flex gap-3 p-4 rounded-xl border transition-all",
                        isActive
                          ? "bg-primary/5 border-primary/40"
                          : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800",
                      )}
                      onClick={() => setActiveStep(i)}
                    >
                      <span
                        className={cn(
                          "h-8 w-8 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0",
                          isActive
                            ? "bg-primary text-white"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-500",
                        )}
                      >
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
                          {step.text}
                        </p>
                        {step.timerMin && (
                          <div className="mt-2 flex items-center gap-2">
                            {!isTimerOn ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startTimer(i, step.timerMin!);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[length:var(--ts-2xs)] font-bold hover:bg-amber-200 transition-colors"
                              >
                                <Clock className="h-3 w-3" />
                                Iniciar timer {step.timerMin} min
                              </button>
                            ) : (
                              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                                <span className="text-sm font-extrabold text-amber-700 dark:text-amber-300 tabular-nums">
                                  {formatTime(timerSeconds ?? step.timerMin * 60)}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleTimer();
                                  }}
                                  aria-label={timerRunning ? "Pausar" : "Continuar"}
                                  className="p-1 rounded-md hover:bg-amber-200 dark:hover:bg-amber-800/40"
                                >
                                  {timerRunning ? (
                                    <Pause className="h-3 w-3 text-amber-700" />
                                  ) : (
                                    <Play className="h-3 w-3 text-amber-700" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    resetTimer();
                                  }}
                                  aria-label="Reiniciar"
                                  className="p-1 rounded-md hover:bg-amber-200 dark:hover:bg-amber-800/40"
                                >
                                  <RotateCcw className="h-3 w-3 text-amber-700" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
