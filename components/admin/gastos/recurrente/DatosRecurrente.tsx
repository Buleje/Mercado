"use client";

import { Edit3, DollarSign, Building2, Repeat, Calendar } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { FREQUENCY_LABELS, DAYS_OF_WEEK, type ExpenseFrequency } from "@/lib/expense-meta";
import { Label, Section } from "./piezas";
import type { GastoRecurrente } from "./use-gasto-recurrente";

const FREQUENCIES: ExpenseFrequency[] = ["mensual", "quincenal", "semanal", "anual", "unico"];

/** Descripción, monto, proveedor, frecuencia y día de pago del gasto fijo. */
export default function DatosRecurrente({ r }: { r: GastoRecurrente }) {
  const { descriptionRef, description, setDescription, amount, setAmount, supplierName, setSupplierName, frequency, setFrequency, paymentDay, setPaymentDay } = r;
  return (
    <>
    {/* Datos básicos ─────────────────────────────────────────── */}
    <Section icon={<Edit3 className="h-4 w-4" />} title="Datos del gasto">
      <div>
        <Label>Descripción</Label>
        <input
          ref={descriptionRef}
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ej. Alquiler local, Recarga celular Movistar, Servicio limpieza semanal"
          aria-label="Descripción del gasto"
          className="mt-1 w-full h-12 px-3.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-medium focus:outline-none focus:border-primary"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="inline-flex items-center gap-1"><DollarSign className="h-3 w-3" /> Monto (S/)</Label>
          <div className="relative mt-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-bold text-[var(--text-tertiary)] pointer-events-none">S/</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.10"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              aria-label="Monto en soles"
              className="w-full h-12 pl-12 pr-3.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-bold tabular-nums focus:outline-none focus:border-primary"
            />
          </div>
        </div>
        <div>
          <Label className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> Proveedor / quién recibe (opcional)</Label>
          <input
            type="text"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder="Ej. Edelnor, Don Juan (casero), Movistar"
            aria-label="Proveedor o quién recibe el pago"
            className="mt-1 w-full h-12 px-3.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-medium focus:outline-none focus:border-primary"
          />
        </div>
      </div>
    </Section>

    {/* Frecuencia + Día ──────────────────────────────────────── */}
    <Section icon={<Repeat className="h-4 w-4" />} title="Frecuencia">
      <div>
        <Label>Cada cuánto se paga</Label>
        <div className="mt-1 grid grid-cols-2 sm:grid-cols-5 gap-2">
          {FREQUENCIES.map((freq) => {
            const active = frequency === freq;
            return (
              <button
                key={freq}
                type="button"
                onClick={() => setFrequency(freq)}
                className={cn(
                  "h-11 px-2 rounded-2xl border-2 text-sm font-semibold transition-all",
                  active
                    ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] ring-2 ring-primary/30"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]",
                )}
              >
                {FREQUENCY_LABELS[freq]}
              </button>
            );
          })}
        </div>
      </div>

      {frequency !== "unico" && (
        <div>
          <Label className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> Día de pago</Label>
          {frequency === "semanal" ? (
            <select
              value={paymentDay}
              onChange={(e) => setPaymentDay(e.target.value)}
              aria-label="Día de pago"
              className="mt-1 w-full h-12 px-3.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-medium focus:outline-none focus:border-primary"
            >
              {DAYS_OF_WEEK.map((d, i) => (
                <option key={i} value={i}>{d}</option>
              ))}
            </select>
          ) : (
            <input
              type="number"
              min="1"
              max={frequency === "anual" ? 366 : 31}
              value={paymentDay}
              onChange={(e) => setPaymentDay(e.target.value)}
              placeholder="Día del mes (1-31)"
              aria-label="Día de pago del mes"
              className="mt-1 w-full h-12 px-3.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-bold tabular-nums focus:outline-none focus:border-primary"
            />
          )}
          <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
            {frequency === "mensual" && "Te avisaremos el día que toca pagar cada mes."}
            {frequency === "quincenal" && "Se repite cada 15 días desde la fecha indicada."}
            {frequency === "semanal" && "Se repite cada semana ese día."}
            {frequency === "anual" && "Se repite una vez al año."}
          </p>
        </div>
      )}
    </Section>
    </>
  );
}
