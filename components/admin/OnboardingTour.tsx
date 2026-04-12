"use client";

import React, { useEffect } from "react";
import { TourSpotlight } from "./TourSpotlight";
import { ChevronLeft, ChevronRight, X, Sparkles } from "lucide-react";

type Tab =
  | "asistente-ia"
  | "ventas-caja"
  | "inventario"
  | "productos"
  | "compras"
  | "plata"
  | "clientes"
  | "config"
  | "pedidos"
  | "plan";

interface TourStep {
  tabId: Tab;
  title: string;
  text: string;
  example: string;
  emoji: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    tabId: "asistente-ia",
    title: "Tu asistente personal",
    text: "Aquí tu asistente te cuenta cómo va el negocio. Te dice cuánto vendiste, qué se está acabando y te da consejos.",
    example: "Ej: 'Hoy vendiste S/.1,240. El arroz se está acabando, pide más.'",
    emoji: "🧠",
  },
  {
    tabId: "ventas-caja",
    title: "Vender y cobrar",
    text: "Aquí cobras a tus clientes. Puedes ver cuánto hay en la caja y llevar la cuenta de quién te debe.",
    example: "Ej: Cobrar S/.25 de fideos a doña Rosa",
    emoji: "🛒",
  },
  {
    tabId: "inventario",
    title: "Tu almacén",
    text: "Aquí ves cuánto tienes de cada producto. También te avisa si algo se va a vencer pronto.",
    example: "Ej: Te quedan 50 bolsas de arroz, 12 se vencen en marzo",
    emoji: "📦",
  },
  {
    tabId: "productos",
    title: "Tus productos y sus precios",
    text: "Aquí agregas productos nuevos, cambias precios y creas ofertas para tus clientes.",
    example: "Ej: Subir el aceite de S/.8 a S/.8.50 o hacer 2x1 en galletas",
    emoji: "🏷️",
  },
  {
    tabId: "compras",
    title: "Pedirle al proveedor",
    text: "Aquí haces pedidos a tus proveedores y ves qué te llegó y qué falta.",
    example: "Ej: Pedir 100 bolsas de azúcar al proveedor Torres",
    emoji: "🚚",
  },
  {
    tabId: "plata",
    title: "Tu dinero",
    text: "Aquí ves cuánto entró, cuánto salió y cuánto ganaste. También puedes exportar a Excel.",
    example: "Ej: Este mes entraron S/.8,500 y salieron S/.5,300. Ganaste S/.3,200",
    emoji: "💰",
  },
  {
    tabId: "clientes",
    title: "Tus clientes",
    text: "Aquí ves la lista de tus clientes, quién compra seguido, quién te debe y pedidos de delivery.",
    example: "Ej: María compra cada semana y le gusta el arroz integral",
    emoji: "👥",
  },
  {
    tabId: "config",
    title: "Ajustes del sistema",
    text: "Aquí agregas cajeros, cambias permisos y configuras tu página web.",
    example: "Ej: Dar permiso a Juan para que solo vea ventas, no precios de compra",
    emoji: "⚙️",
  },
];

interface OnboardingTourProps {
  isTourActive: boolean;
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onComplete: () => void;
  onNavigateTab?: (tabId: Tab) => void;
}

export function OnboardingTour({
  isTourActive,
  currentStep,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
  onComplete,
  onNavigateTab,
}: OnboardingTourProps) {
  const step = TOUR_STEPS[currentStep];
  const isLastStep = currentStep === totalSteps - 1;

  // Navigate to the tab corresponding to current step
  useEffect(() => {
    if (isTourActive && step && onNavigateTab) {
      onNavigateTab(step.tabId);
    }
  }, [isTourActive, currentStep, step, onNavigateTab]);

  // Lock body scroll while tour is active
  useEffect(() => {
    if (isTourActive) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isTourActive]);

  // Keyboard navigation
  useEffect(() => {
    if (!isTourActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        isLastStep ? onComplete() : onNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onPrev();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onSkip();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isTourActive, isLastStep, onNext, onPrev, onSkip, onComplete]);

  if (!isTourActive || !step) return null;

  // Build a selector that finds the sidebar button for this tab.
  // The desktop sidebar buttons have the tab id as key, but we need a CSS selector.
  // We use a selector based on the "All tabs" section in the desktop sidebar.
  const targetSelector = `[data-tour-tab="${step.tabId}"]`;

  return (
    <TourSpotlight targetSelector={targetSelector}>
      <div className="w-[320px] sm:w-[340px] bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header with step counter */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#00B4A6] dark:text-emerald-400 uppercase tracking-wider">
              Paso {currentStep + 1} de {totalSteps}
            </span>
          </div>
          <button
            onClick={onSkip}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Saltar tour"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-4 pb-2">
          <div className="h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#00B4A6] rounded-full transition-all duration-500 ease-out"
              style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="px-4 pb-3">
          <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1.5">
            {step.title}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-2">
            {step.text}
          </p>
          <div className="bg-[#f0fdf4] dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2">
            <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
              {step.example}
            </p>
          </div>
        </div>

        {/* Footer with navigation */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={onPrev}
            disabled={currentStep === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </button>

          <button
            onClick={onSkip}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Saltar tour
          </button>

          <button
            onClick={isLastStep ? onComplete : onNext}
            className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-sm font-bold text-white bg-[#00B4A6] hover:bg-[#009690] shadow-sm transition-colors"
          >
            {isLastStep ? (
              <>
                <Sparkles className="h-4 w-4" />
                Empezar
              </>
            ) : (
              <>
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </TourSpotlight>
  );
}
