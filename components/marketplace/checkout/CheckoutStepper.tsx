"use client";

/**
 * CheckoutStepper — barra horizontal de progreso de los pasos activos del
 * checkout. Muestra 3 pasos (Datos → Entrega → Confirmar) — el "Carrito" es el
 * paso 0 ya completado y no se renderiza para reducir la percepción de fricción.
 *
 * Brandon 2026-05-30 (A4 conversión): quitamos "Carrito" del stepper para
 * que el cliente vea "1 de 3" en lugar de "2 de 4". Sin cambios al router ni
 * a la lógica de pagos — solo visual/UX.
 *
 * Brandon 2026-06-01 (rediseño "palomita a palomita"): el layout del checkout
 * es compartido, así que el stepper PERSISTE entre páginas y `current` cambia
 * por pathname → la palomita anima en la transición datos→entrega→confirmar.
 *   - Palomita con "pop" al completarse un paso (bjCheckPop, respeta reduce-motion).
 *   - Paso actual con pulso suave (ping) + bullet sólido accent.
 *   - Conectores con relleno de gradiente fluido entre pasos completados.
 *   - DESKTOP: label de cada paso al lado del bullet.
 *   - MOBILE: bullets compactos + línea "Paso N de 3 · {paso actual}" debajo
 *     (antes solo se veían puntos sin contexto; el label inline desbordaba en
 *     "Confirmar" y chocaba con el badge "Seguro").
 */

import Link from "next/link";
import { Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export type CheckoutStep = "carrito" | "datos" | "entrega" | "confirmar";

// Pasos VISIBLES al cliente (carrito ya fue — no lo mostramos).
const STEPS: { key: CheckoutStep; label: string; short: string; href: string }[] = [
  { key: "datos",     label: "Tus datos",      short: "Datos",     href: "/checkout/datos" },
  { key: "entrega",   label: "Entrega y pago", short: "Entrega",   href: "/checkout/entrega" },
  { key: "confirmar", label: "Confirmar",      short: "Confirmar", href: "/checkout/confirmar" },
];

/** Lista de bullets + conectores. `withLabels` muestra el label al lado de cada
 *  bullet (desktop). En mobile se rinde sin labels y el contexto va aparte. */
function StepList({
  currentIdx,
  withLabels,
}: {
  currentIdx: number;
  withLabels: boolean;
}) {
  return (
    <ol className="flex items-center gap-1 sm:gap-1.5">
      {STEPS.map((step, idx) => {
        const isDone = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const statusText = isDone ? "completado" : isCurrent ? "paso actual" : "pendiente";

        const bulletCls = cn(
          "relative inline-flex h-8 w-8 md:h-9 md:w-9 shrink-0 items-center justify-center rounded-full",
          "text-[length:var(--ts-xs)] font-extrabold tabular-nums transition-all duration-300",
          isCurrent &&
            "bg-[var(--accent-600,var(--accent))] text-white shadow-[0_4px_14px_-4px_var(--accent)] scale-105",
          isDone && "bg-[var(--accent-soft)] text-[var(--accent)]",
          !isCurrent &&
            !isDone &&
            "border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)]",
        );

        const labelCls = cn(
          "text-[length:var(--ts-xs)] font-bold tracking-[var(--ls-tight)] whitespace-nowrap transition-colors",
          isCurrent && "text-[var(--text-primary)]",
          isDone && "text-[var(--text-secondary)]",
          !isCurrent && !isDone && "text-[var(--text-tertiary)]",
        );

        const bullet = (
          <span className={bulletCls}>
            {/* Pulso suave SOLO en el paso actual — comunica "estás acá". */}
            {isCurrent && (
              <span
                aria-hidden
                className="absolute inset-0 rounded-full bg-[var(--accent)]/30 animate-ping motion-reduce:hidden"
              />
            )}
            {isDone ? (
              <Check
                className="relative h-4 w-4 md:h-[18px] md:w-[18px] animate-[bjCheckPop_0.42s_cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none"
                strokeWidth={3}
                aria-hidden
              />
            ) : (
              <span aria-hidden className="relative">
                {idx + 1}
              </span>
            )}
          </span>
        );

        const label = withLabels ? <span className={labelCls}>{step.label}</span> : null;

        return (
          <li key={step.key} className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {isDone ? (
              <Link
                href={step.href}
                aria-label={`${step.label} — ${statusText}`}
                className="inline-flex items-center gap-1.5 sm:gap-2 rounded-full px-1 py-1 hover:bg-[var(--surface-sunken)] transition-colors"
              >
                {bullet}
                {label}
              </Link>
            ) : (
              <span
                className="inline-flex items-center gap-1.5 sm:gap-2 px-1 py-1"
                aria-label={`${step.label} — ${statusText}`}
                aria-current={isCurrent ? "step" : undefined}
              >
                {bullet}
                {label}
              </span>
            )}
            {idx < STEPS.length - 1 && (
              <span
                aria-hidden
                className="relative h-1 w-5 sm:w-12 rounded-full overflow-hidden bg-[var(--rule-soft)]"
              >
                <span
                  className={cn(
                    "absolute inset-0 origin-left rounded-full transition-transform duration-700 ease-out",
                    "bg-linear-to-r from-[var(--accent)] to-[var(--accent)]/70",
                    isDone ? "scale-x-100" : "scale-x-0",
                  )}
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function CheckoutStepper({ current }: { current: CheckoutStep }) {
  // "carrito" no aparece en STEPS, así que idx=-1 → lo tratamos como paso 1.
  const idxRaw = STEPS.findIndex((s) => s.key === current);
  const currentIdx = idxRaw < 0 ? 0 : idxRaw;
  const currentLabel = STEPS[currentIdx]?.short ?? STEPS[0].short;

  return (
    <nav
      aria-label={`Progreso del checkout — paso ${currentIdx + 1} de ${STEPS.length}`}
      className="w-full"
    >
      {/* DESKTOP: bullets + labels inline */}
      <div className="hidden md:flex justify-center">
        <StepList currentIdx={currentIdx} withLabels />
      </div>

      {/* MOBILE: bullets compactos + línea de contexto */}
      <div className="md:hidden flex flex-col items-center gap-1">
        <StepList currentIdx={currentIdx} withLabels={false} />
        <p className="text-[length:var(--ts-2xs)] font-bold leading-none">
          <span className="text-[var(--text-tertiary)]">
            Paso {currentIdx + 1} de {STEPS.length}
          </span>
          <span className="text-[var(--text-tertiary)]"> · </span>
          <span className="text-[var(--text-primary)]">{currentLabel}</span>
        </p>
      </div>

      <style>{`
        @keyframes bjCheckPop {
          0%   { transform: scale(0) rotate(-25deg); opacity: 0; }
          55%  { transform: scale(1.25) rotate(0deg);  opacity: 1; }
          100% { transform: scale(1) rotate(0deg); }
        }
      `}</style>
    </nav>
  );
}
