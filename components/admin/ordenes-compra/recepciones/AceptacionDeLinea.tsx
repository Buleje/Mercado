"use client";

import { errorDeAceptacion, partirLinea } from "@/lib/compras/aceptacion-recepcion";

const CAMPO =
  "h-12 w-24 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-primary";

type Fila = { product: string; receivedQty: number; condition: string; enRevision?: number; rechazado?: number; motivoRevision?: string };

/**
 * C20 · De lo que llegó en buen estado, cuánto se aparta para revisar y cuánto
 * se rechaza: sólo lo disponible entra a stock vendible.
 */
export default function AceptacionDeLinea({
  id, fila, onChange,
}: {
  id: string;
  fila: Fila;
  onChange: (patch: Partial<Pick<Fila, "enRevision" | "rechazado" | "motivoRevision">>) => void;
}) {
  if (fila.condition !== "ok" || fila.receivedQty <= 0) return null;
  const partes = partirLinea(fila);
  const error = errorDeAceptacion(fila);
  const apartado = partes.enRevision > 0 || partes.rechazado > 0;
  return (
    <div className="flex basis-full flex-wrap items-end gap-2">
      <label className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold text-[var(--text-secondary)]">En revisión</span>
        <input id={`${id}-revision`} type="number" min="0" value={fila.enRevision ?? 0}
          onChange={(e) => onChange({ enRevision: Math.max(0, +e.target.value) })}
          aria-label={`Cantidad en revisión de ${fila.product || "el producto"}`} className={CAMPO} />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold text-[var(--text-secondary)]">Rechazado</span>
        <input id={`${id}-rechazo`} type="number" min="0" value={fila.rechazado ?? 0}
          onChange={(e) => onChange({ rechazado: Math.max(0, +e.target.value) })}
          aria-label={`Cantidad rechazada de ${fila.product || "el producto"}`} className={CAMPO} />
      </label>
      {apartado && (
        <label className="flex min-w-40 flex-1 flex-col gap-0.5">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">Por qué</span>
          <input id={`${id}-motivo`} value={fila.motivoRevision ?? ""} maxLength={200}
            onChange={(e) => onChange({ motivoRevision: e.target.value })}
            placeholder="Ej.: cajas golpeadas, revisar sellos" className={`${CAMPO} w-full`} />
        </label>
      )}
      <p className={`basis-full text-sm ${error ? "font-semibold text-[var(--data-error-ink)]" : "text-[var(--text-secondary)]"}`} aria-live="polite">
        {error ?? (apartado ? `Entra a stock: ${partes.disponible}. Lo apartado no se vende hasta que lo liberes con un ajuste de stock con motivo.` : null)}
      </p>
    </div>
  );
}
