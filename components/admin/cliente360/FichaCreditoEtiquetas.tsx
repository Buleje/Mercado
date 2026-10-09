"use client";

import { CardTitle } from "@buleje/design-system";
import { CreditCard, Star, Loader2, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type { CustomerData } from "@/components/admin/cliente360/cliente360-compartido";
import type { Cliente360 } from "@/components/admin/cliente360/use-cliente-360";

/** Límite de crédito y etiquetas. Bloque de la ficha 360 (Customer360Tab). */
export default function FichaCreditoEtiquetas({ ficha, customer }: { ficha: Cliente360; customer: CustomerData }) {
  const {
    tags, newTag, setNewTag, savingTags, editingCreditLimit, setEditingCreditLimit, creditLimitInput,
    setCreditLimitInput, savingCreditLimit, handleAddTag, handleRemoveTag, handleSaveCreditLimit,
  } = ficha;
  return (
    <>
      {/* Crédito + Etiquetas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Límite de crédito */}
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
          <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-[var(--data-warning-500)]" /> Límite de crédito
          </CardTitle>
          {editingCreditLimit ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--text-secondary)]">S/</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={creditLimitInput}
                onChange={e => setCreditLimitInput(e.target.value)}
                className="w-32 text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl px-3 py-1.5 bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="0.00"
              />
              <button
                onClick={handleSaveCreditLimit}
                disabled={savingCreditLimit}
                className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 disabled:opacity-50"
              >
                {savingCreditLimit ? "..." : "Guardar"}
              </button>
              <button
                onClick={() => setEditingCreditLimit(false)}
                className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {customer.creditLimit != null && customer.creditLimit > 0 ? (() => {
                const disponible = customer.creditLimit - (customer.creditBalance ?? 0);
                const pct = disponible / customer.creditLimit;
                return (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      "inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border",
                      pct <= 0
                        ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 text-[var(--data-error-500)] border-[var(--data-error-500)] dark:border-[var(--data-error-500)]"
                        : pct < 0.2
                          ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 text-[var(--data-warning-500)] border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]"
                          : "bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:text-[var(--data-success-500)] border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30"
                    )}>
                      {pct <= 0
                        ? "Sin crédito disponible"
                        : `${formatCurrency(disponible)} disponible de ${formatCurrency(Number(customer.creditLimit))}`}
                    </span>
                    <button
                      onClick={() => { setEditingCreditLimit(true); setCreditLimitInput(String(customer.creditLimit ?? 0)); }}
                      className="text-xs text-primary hover:underline font-semibold"
                    >
                      Editar
                    </button>
                  </div>
                );
              })() : (
                <button
                  onClick={() => { setEditingCreditLimit(true); setCreditLimitInput("0"); }}
                  className="text-xs text-[var(--text-tertiary)] hover:text-primary transition-colors"
                >
                  + Establecer límite de crédito
                </button>
              )}
            </div>
          )}
        </div>

        {/* Etiquetas */}
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
          <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <Star className="h-4 w-4 text-[var(--text-secondary)]" /> Etiquetas
            {savingTags && <Loader2 className="h-3 w-3 animate-spin text-[var(--text-tertiary)] ml-1" />}
          </CardTitle>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.length === 0 && (
              <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Sin etiquetas</p>
            )}
            {tags.map(tag => {
              // Auto-color by hash
              const hash = tag.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
              const colors = [
                "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:bg-primary/15 dark:text-[var(--data-success-500)]",
                "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:bg-primary/15 dark:text-[var(--data-success-500)]",
                "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
                "bg-amber-100 text-[var(--data-warning-700)] dark:bg-amber-900/30 dark:text-amber-400",
                "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
                "bg-[var(--data-info-500)]/12 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]",
              ];
              const colorClass = colors[hash % colors.length];
              return (
                <span key={tag} className={cn("inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full", colorClass)}>
                  {tag}
                  <button aria-label="Quitar"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:opacity-60 transition-opacity"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(newTag); } }}
              placeholder="Nueva etiqueta (Enter para agregar)"
              className="flex-1 text-xs border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl px-3 py-1.5 bg-[var(--surface-alt)] text-[var(--text-primary)] dark:text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {["Mayorista", "Restaurante", "Vecino", "Fiado frecuente", "VIP", "Nuevo"]
              .filter(s => !tags.includes(s))
              .map(s => (
                <button
                  key={s}
                  onClick={() => handleAddTag(s)}
                  className="text-xs text-[var(--text-tertiary)] hover:text-primary border border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-full px-2 py-0.5 hover:border-primary/40 transition-colors"
                >
                  + {s}
                </button>
              ))}
          </div>
        </div>
      </div>
    </>
  );
}
