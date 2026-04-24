"use client";

/**
 * StepDatosNegocio — wizard step 1: nombre, RUC, dirección, distrito, categoría.
 */

import {
  CATEGORIAS_VENDOR,
  DISTRITOS_PUCALLPA,
  type DatosNegocioForm,
} from "@/lib/validators/vendor-registration";
import { Store, Tag, MapPin, FileText } from "@buleje/design-system/icons";
import { cn } from "@buleje/design-system";

interface StepDatosNegocioProps {
  value: Partial<DatosNegocioForm>;
  errors: Partial<Record<keyof DatosNegocioForm, string>>;
  onChange: (patch: Partial<DatosNegocioForm>) => void;
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
  "block w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-colors focus:border-[var(--text-primary)]";

export default function StepDatosNegocio({
  value,
  errors,
  onChange,
}: StepDatosNegocioProps) {
  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]">
          <Store className="h-5 w-5 text-[var(--text-secondary)]" strokeWidth={1.5} aria-hidden="true" />
          Contanos de tu negocio
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Es para saber quién sos y dónde ubicarte en el mapa de Pucallpa.
        </p>
      </header>

      <div className="space-y-4">
        {/* Nombre del negocio */}
        <div>
          <label
            htmlFor="nombreNegocio"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
          >
            Nombre del negocio
          </label>
          <input
            id="nombreNegocio"
            type="text"
            placeholder="Ej: Bodega Don Pedro"
            value={value.nombreNegocio ?? ""}
            onChange={(e) => onChange({ nombreNegocio: e.target.value })}
            className={cn(inputClass, errors.nombreNegocio && "border-[var(--data-error)]")}
          />
          <FieldError message={errors.nombreNegocio} />
        </div>

        {/* RUC */}
        <div>
          <label
            htmlFor="ruc"
            className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
          >
            <FileText className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
            RUC (11 dígitos)
          </label>
          <input
            id="ruc"
            type="text"
            inputMode="numeric"
            placeholder="20123456789"
            maxLength={11}
            value={value.ruc ?? ""}
            onChange={(e) => onChange({ ruc: e.target.value.replace(/\D/g, "") })}
            className={cn(
              inputClass,
              "font-mono tabular-nums",
              errors.ruc && "border-[var(--data-error)]",
            )}
          />
          <FieldError message={errors.ruc} />
          <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            Si todavía no tienes RUC, te ayudamos a sacarlo gratis en 48h.
          </p>
        </div>

        {/* Dirección */}
        <div>
          <label
            htmlFor="direccion"
            className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
          >
            <MapPin className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
            Dirección del local
          </label>
          <input
            id="direccion"
            type="text"
            placeholder="Jr. Ucayali 450, Callería"
            value={value.direccion ?? ""}
            onChange={(e) => onChange({ direccion: e.target.value })}
            className={cn(inputClass, errors.direccion && "border-[var(--data-error)]")}
          />
          <FieldError message={errors.direccion} />
        </div>

        {/* Distrito + Categoría — 2 col */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="distrito"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
            >
              Distrito
            </label>
            <select
              id="distrito"
              value={value.distrito ?? ""}
              onChange={(e) =>
                onChange({
                  distrito: e.target.value as DatosNegocioForm["distrito"],
                })
              }
              className={cn(inputClass, errors.distrito && "border-[var(--data-error)]")}
            >
              <option value="">Seleccioná…</option>
              {DISTRITOS_PUCALLPA.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <FieldError message={errors.distrito} />
          </div>
          <div>
            <label
              htmlFor="categoria"
              className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
            >
              <Tag className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
              Categoría principal
            </label>
            <select
              id="categoria"
              value={value.categoria ?? ""}
              onChange={(e) =>
                onChange({
                  categoria: e.target.value as DatosNegocioForm["categoria"],
                })
              }
              className={cn(inputClass, errors.categoria && "border-[var(--data-error)]")}
            >
              <option value="">Seleccioná…</option>
              {CATEGORIAS_VENDOR.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <FieldError message={errors.categoria} />
          </div>
        </div>
      </div>
    </div>
  );
}
