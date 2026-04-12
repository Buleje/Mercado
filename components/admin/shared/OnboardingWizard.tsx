"use client";

import { useState } from "react";
import {
  Package,
  ShoppingCart,
  Palette,
  Users,
  CheckCircle2,
  ChevronRight,
  X,
  Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: typeof Package;
  color: string;
  tab: string;
  completed: boolean;
}

const STORAGE_KEY = "buleje-onboarding";

interface OnboardingWizardProps {
  onNavigate: (tab: string) => void;
  onDismiss?: () => void;
}

function getCompletedSteps(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return new Set(JSON.parse(saved));
  } catch {}
  return new Set();
}

function saveCompletedSteps(steps: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...steps]));
  } catch {}
}

export default function OnboardingWizard({ onNavigate, onDismiss }: OnboardingWizardProps) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(getCompletedSteps);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("buleje-onboarding-dismissed") === "true";
    } catch { return false; }
  });

  const steps: OnboardingStep[] = [
    {
      id: "products",
      title: "Agrega tu primer producto",
      description: "Sube tus productos con foto, precio y stock",
      icon: Package,
      color: "text-violet-600 bg-violet-50 dark:bg-violet-950/30",
      tab: "productos",
      completed: completedIds.has("products"),
    },
    {
      id: "store",
      title: "Personaliza tu tienda",
      description: "Logo, colores y datos de contacto",
      icon: Palette,
      color: "text-teal-600 bg-teal-50 dark:bg-teal-950/30",
      tab: "store-customizer",
      completed: completedIds.has("store"),
    },
    {
      id: "sale",
      title: "Haz tu primera venta",
      description: "Usa el punto de venta para registrar una venta",
      icon: ShoppingCart,
      color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
      tab: "ventas-caja",
      completed: completedIds.has("sale"),
    },
    {
      id: "customers",
      title: "Registra un cliente",
      description: "Agrega tu primer cliente para fidelizarlo",
      icon: Users,
      color: "text-pink-600 bg-pink-50 dark:bg-pink-950/30",
      tab: "clientes",
      completed: completedIds.has("customers"),
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const allDone = completedCount === steps.length;
  const progress = Math.round((completedCount / steps.length) * 100);

  if (dismissed || allDone) return null;

  const markComplete = (stepId: string) => {
    const next = new Set(completedIds);
    next.add(stepId);
    setCompletedIds(next);
    saveCompletedSteps(next);
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem("buleje-onboarding-dismissed", "true");
    } catch {}
    onDismiss?.();
  };

  return (
    <div className="mb-6 rounded-2xl border border-teal-200 dark:border-teal-900/50 bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-950/20 dark:to-emerald-950/20 p-5 relative overflow-hidden">
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white/50 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-teal-600 flex items-center justify-center">
          <Rocket className="h-5 w-5 text-white" />
        </div>
        <div>
          <h3 className="font-bold text-foreground">Primeros pasos</h3>
          <p className="text-xs text-muted">{completedCount} de {steps.length} completados</p>
        </div>
        {/* Progress bar */}
        <div className="ml-auto w-24 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className="h-full bg-teal-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <button
              key={step.id}
              onClick={() => {
                markComplete(step.id);
                onNavigate(step.tab);
              }}
              className={cn(
                "flex items-start gap-3 p-3 rounded-xl text-left transition-all",
                step.completed
                  ? "bg-white/50 dark:bg-white/5 opacity-60"
                  : "bg-white dark:bg-card hover:shadow-md border border-gray-100 dark:border-card-border"
              )}
            >
              <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", step.color)}>
                {step.completed ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-semibold", step.completed && "line-through text-muted")}>
                  {step.title}
                </p>
                <p className="text-[11px] text-muted mt-0.5">{step.description}</p>
              </div>
              {!step.completed && <ChevronRight className="h-4 w-4 text-gray-400 shrink-0 mt-1" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
