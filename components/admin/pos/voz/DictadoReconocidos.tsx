"use client";

import { Check, Plus, HelpCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DictadoVoz } from "@/components/admin/pos/voz/use-dictado-voz";

/** Productos que reconoció la IA (respaldo de lo que no se resolvió en vivo). */
export default function DictadoReconocidos({ voz }: { voz: DictadoVoz }) {
  const { items, addItem } = voz;
  return (
    <>
              {/* Productos reconocidos por la IA (respaldo de lo que no se resolvió acá) */}
              {items.length > 0 && (
                <div className="mt-2 space-y-2">
                  <p className="text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                    {items.length} producto{items.length === 1 ? "" : "s"} reconocido{items.length === 1 ? "" : "s"}
                  </p>
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
                          item.matchedProductId
                            ? "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]"
                            : "bg-[var(--data-warning-500)]/10 text-[var(--data-warning-500)]",
                        )}
                      >
                        {item.matchedProductId ? <Check className="h-4 w-4" /> : <HelpCircle className="h-4 w-4" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-extrabold text-[var(--text-primary)] truncate">
                          {item.productName}
                        </p>
                        <p className="text-xs font-semibold text-[var(--text-secondary)]">
                          Cantidad: {item.quantity}
                          {item.confidence < 0.8 && " · Baja confianza"}
                        </p>
                      </div>
                      {item.matchedProductId && (
                        <button
                          onClick={() => addItem(item)}
                          className="inline-flex items-center gap-1 h-9 px-3 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] text-sm font-extrabold hover:bg-[var(--accent)] hover:text-white transition-colors"
                          title="Agregar al carrito"
                        >
                          <Plus className="h-4 w-4" aria-hidden />
                          Sumar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
    </>
  );
}
