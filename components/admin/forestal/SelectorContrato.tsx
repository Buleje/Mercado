"use client";

/**
 * SelectorContrato — elegir el permiso bajo el que se registra algo (ADR-421).
 *
 * Único para los cinco formularios (gasto, adelanto, flete, ingreso de madera,
 * lote/producción): si cada uno arma su propio desplegable, el día que cambie
 * la regla —qué contratos se ofrecen, cómo se sugiere— hay que acordarse de
 * cinco lugares.
 *
 * ## Sugiere, no pregunta en blanco
 *
 * Casi siempre el papel ya dice de qué permiso viene: la guía trae su
 * `originCode`, el lote hereda el de sus trozas. Cuando el que llama pasa
 * `codigoSugerido`, el selector resuelve solo a ese contrato y lo dice. Pedir
 * el dato en blanco, teniéndolo, es como se llenan los campos con lo primero
 * de la lista.
 *
 * Si el código sugerido NO está cargado como contrato, no se inventa nada: se
 * avisa y se deja el camino para crearlo desde la pantalla de Contratos.
 */

import { useEffect, useMemo } from "react";
import { FileText, TriangleAlert } from "@buleje/design-system/icons";
import { normalizarCodigoContrato } from "@/lib/forestal/contratos";
import { useContratos } from "@/hooks/use-contratos";

interface Props {
  /** El contrato elegido, o `null` para «sin contrato». */
  value: string | null;
  onChange: (contratoId: string | null) => void;
  /** El código que ya trae el documento (`originCode`, `permiso`). */
  codigoSugerido?: string | null;
  label?: string;
  /** Texto bajo el selector. Por defecto explica qué implica elegirlo. */
  hint?: string;
  /** Cuando la pantalla no admite «sin contrato». Por defecto SÍ lo admite: un
   *  gasto de oficina no pertenece a ningún permiso. */
  requerido?: boolean;
  disabled?: boolean;
  /** Para el `aria-describedby` del formulario que lo monta. */
  id?: string;
}

export default function SelectorContrato({
  value,
  onChange,
  codigoSugerido,
  label = "Contrato / permiso",
  hint,
  requerido = false,
  disabled = false,
  id = "selector-contrato",
}: Props) {
  const { contratos, cargando } = useContratos();

  /** El contrato que corresponde al código del papel, si está cargado. */
  const sugerido = useMemo(() => {
    const norm = normalizarCodigoContrato(codigoSugerido ?? "");
    if (!norm) return null;
    return contratos.find((c) => c.codigoNorm === norm) ?? null;
  }, [codigoSugerido, contratos]);

  /**
   * Auto-elegir el sugerido, SÓLO si el usuario todavía no eligió nada.
   * Pisar una elección hecha a mano porque llegó la lista sería decidir por él
   * —el bug de «la carga vieja pisa lo optimista», con otra cara—.
   */
  useEffect(() => {
    if (value == null && sugerido) onChange(sugerido.id);
  }, [sugerido, value, onChange]);

  const codigoHuerfano = Boolean(codigoSugerido?.trim()) && !sugerido && !cargando;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-[var(--text-secondary)]">
        {label}
        {!requerido && <span className="ml-1 font-medium text-[var(--text-tertiary)]">(opcional)</span>}
      </label>

      <div className="relative">
        <FileText
          className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]"
          aria-hidden
        />
        <select
          id={id}
          value={value ?? ""}
          disabled={disabled || cargando}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-12 w-full rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-11 pr-4 text-base font-medium text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] disabled:opacity-60"
        >
          {!requerido && <option value="">Sin contrato</option>}
          {requerido && value == null && <option value="">Elegí el contrato…</option>}
          {contratos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo}
              {c.alias ? ` · ${c.alias}` : ""} — {c.titularNombre}
            </option>
          ))}
        </select>
      </div>

      {sugerido && value === sugerido.id ? (
        <p className="mt-1.5 text-sm font-medium text-[var(--accent-ink)] dark:text-[var(--accent)]">
          Sugerido por el documento: {sugerido.codigo}
        </p>
      ) : codigoHuerfano ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            El documento dice «{codigoSugerido}» y ese permiso todavía no está cargado como contrato. Se puede
            crear desde Gestión › Contratos; mientras tanto, esto queda sin imputar.
          </span>
        </p>
      ) : (
        <p className="mt-1.5 text-sm text-[var(--text-tertiary)]">
          {hint ?? "Lo que se registre con un contrato suma en su balance."}
        </p>
      )}
    </div>
  );
}
