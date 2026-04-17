"use client";

import { useState, useEffect, useMemo } from "react";
import { Check, ChevronRight, X } from "lucide-react";
import { m, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { DURATION, EASE } from "@/components/ui-system";

/**
 * OnboardingChecklist — checklist persistente lateral para admin nuevo.
 *
 * Cialdini Commitment & Consistency: cada item completado crea compromiso
 * con los siguientes. Muestra progreso 3/8 visible.
 *
 * Se oculta automaticamente cuando el usuario completa todos los pasos
 * o manualmente con cerrar (se guarda en localStorage).
 *
 * @example
 * <OnboardingChecklist
 *   items={[
 *     { id: "store-setup", label: "Configurá tu tienda", done: true, href: "..." },
 *     { id: "first-product", label: "Creá tu primer producto", done: true },
 *     { id: "whatsapp", label: "Conectá WhatsApp", done: false },
 *     ...
 *   ]}
 * />
 */

export interface OnboardingItem {
  id: string;
  label: string;
  description?: string;
  done: boolean;
  href?: string;
}

interface Props {
  items: OnboardingItem[];
  className?: string;
  /** Key para localStorage — default "buleje-onboarding-dismissed" */
  storageKey?: string;
}

const STORAGE_KEY = "buleje-onboarding-dismissed";

export function OnboardingChecklist({
  items,
  className,
  storageKey = STORAGE_KEY,
}: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(true);

  // Leer dismissed flag de localStorage al mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(storageKey) === "true") {
      setDismissed(true);
    }
  }, [storageKey]);

  const { done, total, percentage } = useMemo(() => {
    const d = items.filter((i) => i.done).length;
    const t = items.length;
    return { done: d, total: t, percentage: t > 0 ? Math.round((d / t) * 100) : 0 };
  }, [items]);

  // Auto-hide cuando todo completado
  const allComplete = done === total && total > 0;

  if (dismissed || total === 0) return null;

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, "true");
    }
  };

  return (
    <aside
      className={cn(
        "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden",
        className,
      )}
      aria-labelledby="onboarding-title"
    >
      {/* Header con progreso */}
      <header
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--surface-sunken)] transition-colors"
        onClick={() => setExpanded(!expanded)}
        role="button"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="relative h-8 w-8 shrink-0 rounded-full"
            aria-hidden
          >
            <svg viewBox="0 0 36 36" className="h-8 w-8">
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="var(--rule-base)"
                strokeWidth="3"
              />
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke={allComplete ? "var(--data-success)" : "var(--text-primary)"}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${(percentage / 100) * 88} 88`}
                transform="rotate(-90 18 18)"
                style={{
                  transition: "stroke-dasharray 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-primary)]">
              {done}/{total}
            </span>
          </div>
          <div className="min-w-0">
            <p
              id="onboarding-title"
              className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-0.5"
            >
              {allComplete ? "Completado" : "Primeros pasos"}
            </p>
            <p className="text-sm font-extrabold tracking-tight text-[var(--text-primary)]">
              {allComplete
                ? "Tu tienda está lista"
                : `${percentage}% configurado`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {allComplete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDismiss();
              }}
              className="p-1 rounded-md hover:bg-[var(--surface-sunken)] transition-colors"
              aria-label="Cerrar checklist"
            >
              <X className="h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={1.75} />
            </button>
          )}
          <ChevronRight
            className={cn(
              "h-4 w-4 text-[var(--text-tertiary)] transition-transform",
              expanded && "rotate-90",
            )}
            strokeWidth={1.75}
            aria-hidden
          />
        </div>
      </header>

      {/* Items list */}
      <AnimatePresence initial={false}>
        {expanded && (
          <m.div
            key="items"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DURATION.base, ease: EASE.soft }}
            className="overflow-hidden"
          >
            <ol className="divide-y divide-[var(--rule-soft)] border-t border-[var(--rule-soft)]">
              {items.map((item, idx) => (
                <li key={item.id}>
                  {item.href && !item.done ? (
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 p-3 hover:bg-[var(--surface-sunken)] transition-colors group"
                    >
                      <ChecklistRowContent item={item} idx={idx} />
                    </Link>
                  ) : (
                    <div className={cn(
                      "flex items-center gap-3 p-3",
                      item.done && "opacity-60",
                    )}>
                      <ChecklistRowContent item={item} idx={idx} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </m.div>
        )}
      </AnimatePresence>
    </aside>
  );
}

function ChecklistRowContent({ item, idx }: { item: OnboardingItem; idx: number }) {
  return (
    <>
      <span
        className={cn(
          "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
          item.done
            ? "bg-[var(--text-primary)] border-[var(--text-primary)] text-[var(--surface-canvas)]"
            : "border-[var(--rule-base)] text-[var(--text-tertiary)] tabular-nums",
        )}
        aria-hidden
      >
        {item.done ? (
          <Check className="h-3 w-3" strokeWidth={2.5} />
        ) : (
          <span className="text-[length:var(--ts-2xs)] font-bold">{idx + 1}</span>
        )}
      </span>
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm font-semibold",
            item.done
              ? "line-through text-[var(--text-tertiary)]"
              : "text-[var(--text-primary)]",
          )}
        >
          {item.label}
        </p>
        {item.description && !item.done && (
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5 leading-relaxed">
            {item.description}
          </p>
        )}
      </div>
      {!item.done && item.href && (
        <ChevronRight
          className="h-4 w-4 text-[var(--text-tertiary)] shrink-0 group-hover:translate-x-0.5 transition-transform"
          strokeWidth={1.75}
          aria-hidden
        />
      )}
    </>
  );
}
