"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState, useEffect } from "react";
import { CheckCircle, Circle, ClipboardList, PartyPopper } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

const DEFAULT_ITEMS = [
  "Abrir caja y verificar fondo inicial",
  "Verificar productos con stock bajo",
  "Revisar pedidos pendientes de entrega",
  "Limpiar y ordenar el area de venta",
  "Verificar y actualizar precios del dia",
] as const;

type CheckItem = { label: string; done: boolean };

function todayKey(): string {
  const d = new Date();
  return `opening-checklist-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function loadFromStorage(): CheckItem[] {
  if (typeof window === "undefined") {
    return DEFAULT_ITEMS.map((label) => ({ label, done: false }));
  }
  try {
    const raw = localStorage.getItem(todayKey());
    if (raw) {
      const parsed = JSON.parse(raw) as CheckItem[];
      // Fusionar con items predefinidos por si cambiaron
      return DEFAULT_ITEMS.map((label) => {
        const found = parsed.find((p) => p.label === label);
        return { label, done: found?.done ?? false };
      });
    }
  } catch {
    // ignorar errores de parse
  }
  return DEFAULT_ITEMS.map((label) => ({ label, done: false }));
}

function saveToStorage(items: CheckItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(todayKey(), JSON.stringify(items));
  } catch {
    // ignorar errores de storage
  }
}

export function OpeningChecklist({ className }: { className?: string }) {
  const [items, setItems] = useState<CheckItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setItems(loadFromStorage());
    setMounted(true);
  }, []);

  function toggle(index: number) {
    setItems((prev) => {
      const next = prev.map((item, i) =>
        i === index ? { ...item, done: !item.done } : item
      );
      saveToStorage(next);
      return next;
    });
  }

  const total = items.length;
  const done = items.filter((i) => i.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const allDone = done === total && total > 0;

  if (!mounted) {
    // Evitar hydration mismatch — render skeleton hasta montar
    return (
      <div className={cn("rounded-xl border border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-gray-900 p-4", className)}>
        <div className="h-40 animate-pulse rounded-lg bg-[var(--surface-sunken)]" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-[var(--surface-raised)]",
        "border-[var(--rule-base)]",
        "p-4 ",
        className
      )}
      role="region"
      aria-label="Checklist de apertura de tienda"
    >
      {/* Encabezado */}
      <div className="mb-3 flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-primary dark:text-[#3a8a65]" aria-hidden="true" />
        <SectionTitle className="text-base font-semibold text-[var(--text-primary)]">
          Apertura del dia
        </SectionTitle>
        <span className="ml-auto text-sm text-[var(--text-tertiary)]">
          {new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "short" })}
        </span>
      </div>

      {/* Barra de progreso */}
      <div className="mb-4">
        <div className="mb-1 flex items-baseline justify-between text-xs text-[var(--text-secondary)]">
          <span>
            <span className="font-semibold text-[var(--text-primary)]">{done}</span> de {total} completados
          </span>
          <span className="font-semibold text-primary dark:text-[#3a8a65]">{pct}%</span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
          role="progressbar"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`${done} de ${total} tareas completadas`}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-[var(--dur-slow)]",
              allDone ? "bg-[var(--data-warning-500)]" : "bg-primary"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Items */}
      <ul className="space-y-2" role="list">
        {items.map((item, index) => (
          <li key={item.label}>
            <button
              type="button"
              onClick={() => toggle(index)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm",
                "transition-colors duration-[var(--dur-fast)]",
                item.done
                  ? "bg-primary/10 dark:bg-primary/20"
                  : "bg-gray-50 hover:bg-[var(--surface-sunken)] dark:hover:bg-gray-700",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              )}
              aria-pressed={item.done}
            >
              {item.done ? (
                <CheckCircle className="h-4 w-4 flex-shrink-0 text-primary dark:text-[#3a8a65]" aria-hidden="true" />
              ) : (
                <Circle className="h-4 w-4 flex-shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
              )}
              <span
                className={cn(
                  "flex-1",
                  item.done
                    ? "text-[var(--text-secondary)] line-through dark:text-[var(--text-secondary)]"
                    : "text-[var(--text-secondary)]"
                )}
              >
                {item.label}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* Felicitacion */}
      {allDone && (
        <div
          className="mt-4 flex items-center gap-2 rounded-lg bg-[var(--data-warning-500)]/20 px-3 py-2"
          role="status"
          aria-live="polite"
        >
          <PartyPopper className="h-4 w-4 flex-shrink-0 text-[var(--data-warning-500)]" aria-hidden="true" />
          <p className="text-sm font-medium text-[#c07040] dark:text-[var(--data-warning-500)]">
            Excelente — la tienda esta lista para abrir
          </p>
        </div>
      )}
    </div>
  );
}

export default OpeningChecklist;
