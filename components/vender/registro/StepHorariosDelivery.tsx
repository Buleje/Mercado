"use client";

/**
 * StepHorariosDelivery — wizard step 4: horarios 7 días + zonas delivery + tarifa.
 */

import {
  DISTRITOS_PUCALLPA,
  type HorariosDeliveryForm,
} from "@/lib/validators/vendor-registration";
import { Clock, Truck, MapPin } from "@buleje/design-system/icons";
import { cn } from "@buleje/design-system";

interface StepHorariosDeliveryProps {
  value: HorariosDeliveryForm;
  errors: Partial<Record<keyof HorariosDeliveryForm, string>>;
  onChange: (patch: Partial<HorariosDeliveryForm>) => void;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 text-xs font-medium text-[var(--data-error)]" role="alert">
      {message}
    </p>
  );
}

const inputClass =
  "block rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 py-1.5 text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--text-primary)]";

export default function StepHorariosDelivery({
  value,
  errors,
  onChange,
}: StepHorariosDeliveryProps) {
  const toggleDia = (idx: number) => {
    const next = [...value.horarios];
    next[idx] = { ...next[idx], abierto: !next[idx].abierto };
    onChange({ horarios: next });
  };

  const updateHora = (idx: number, key: "abre" | "cierra", hora: string) => {
    const next = [...value.horarios];
    next[idx] = { ...next[idx], [key]: hora };
    onChange({ horarios: next });
  };

  const toggleZona = (zona: (typeof DISTRITOS_PUCALLPA)[number]) => {
    const current = value.zonasEntrega;
    const next = current.includes(zona)
      ? current.filter((z) => z !== zona)
      : [...current, zona];
    onChange({ zonasEntrega: next });
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]">
          <Clock className="h-5 w-5 text-[var(--text-secondary)]" strokeWidth={1.5} aria-hidden="true" />
          Horarios y entregas
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Cuándo recibes pedidos y a qué zonas entregás. Después puedes cambiarlo cuando quieras.
        </p>
      </header>

      {/* Horarios 7 días */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Horario semanal
          </p>
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            Marca cerrado los días que descansás
          </span>
        </div>
        <ul className="space-y-2">
          {value.horarios.map((h, idx) => (
            <li
              key={h.dia}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 transition-colors",
                h.abierto ? "bg-[var(--surface-sunken)]" : "bg-transparent opacity-60",
              )}
            >
              <label className="flex w-28 cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={h.abierto}
                  onChange={() => toggleDia(idx)}
                  className="h-4 w-4 accent-[var(--text-primary)]"
                />
                {h.dia}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={h.abre}
                  onChange={(e) => updateHora(idx, "abre", e.target.value)}
                  disabled={!h.abierto}
                  className={cn(inputClass, "w-28 disabled:opacity-50")}
                  aria-label={`Hora apertura ${h.dia}`}
                />
                <span className="text-xs text-[var(--text-tertiary)]">a</span>
                <input
                  type="time"
                  value={h.cierra}
                  onChange={(e) => updateHora(idx, "cierra", e.target.value)}
                  disabled={!h.abierto}
                  className={cn(inputClass, "w-28 disabled:opacity-50")}
                  aria-label={`Hora cierre ${h.dia}`}
                />
              </div>
              {!h.abierto && (
                <span className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Cerrado
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Zonas de delivery */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          <MapPin className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
          Zonas de entrega
        </p>
        <div className="flex flex-wrap gap-2">
          {DISTRITOS_PUCALLPA.map((distrito) => {
            const selected = value.zonasEntrega.includes(distrito);
            return (
              <button
                key={distrito}
                type="button"
                onClick={() => toggleZona(distrito)}
                aria-pressed={selected}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  selected
                    ? "bg-[var(--text-primary)] text-[var(--surface-canvas)]"
                    : "border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]",
                )}
              >
                {distrito}
              </button>
            );
          })}
        </div>
        <FieldError message={errors.zonasEntrega} />
      </div>

      {/* Tarifa delivery */}
      <div>
        <label
          htmlFor="tarifaDelivery"
          className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
        >
          <Truck className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
          Tarifa de delivery por pedido
        </label>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2.5 text-sm font-semibold text-[var(--text-secondary)]">
            S/
          </span>
          <input
            id="tarifaDelivery"
            type="number"
            min={0}
            max={30}
            step={0.5}
            value={value.tarifaDelivery}
            onChange={(e) =>
              onChange({ tarifaDelivery: Number(e.target.value) || 0 })
            }
            className={cn(
              inputClass,
              "w-24 py-2.5",
              errors.tarifaDelivery && "border-[var(--data-error)]",
            )}
          />
          <span className="text-xs text-[var(--text-tertiary)]">por entrega</span>
        </div>
        <FieldError message={errors.tarifaDelivery} />
        <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          El cliente lo paga aparte. Si quieres delivery gratis, pon S/ 0.
        </p>
      </div>
    </div>
  );
}
