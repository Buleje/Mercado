"use client";

/**
 * Una fila del pedido de corrección: qué casillero o troza, lo que dice hoy y
 * lo que debería decir. La lista es un `<select>` nativo con dos grupos (en el
 * celular abre la rueda del sistema, que con 60 casilleros es lo más rápido).
 */

import { Trash2 } from "@buleje/design-system/icons";
import { I } from "../ctp-shared";
import { claveOpcion, type OpcionCorregible } from "./opciones-de-la-guia";
import type { LineaCambio } from "./correccion-form";

const ERROR = "mt-1 block text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";

export default function CambioFila({
  n,
  linea,
  opciones,
  usadas,
  grupoItems,
  error,
  onCambiar,
  onQuitar,
}: {
  n: number;
  linea: LineaCambio;
  opciones: readonly OpcionCorregible[];
  /** Claves ya elegidas en otras filas (se ofrecen deshabilitadas). */
  usadas: ReadonlySet<string>;
  /** Cómo se llama el grupo de filas: «Trozas» (Libro TH) o «Líneas del despacho» (CTP). */
  grupoItems: string;
  error?: { opcion?: string; correcto?: string };
  onCambiar: (l: LineaCambio) => void;
  onQuitar?: () => void;
}) {
  const elegida = opciones.find((o) => claveOpcion(o) === linea.opcion) ?? null;
  const casilleros = opciones.filter((o) => o.donde === "casillero");
  const items = opciones.filter((o) => o.donde === "item");
  const idSel = `${linea.id}-donde`;
  const idCorr = `${linea.id}-correcto`;
  const opcion = (o: OpcionCorregible) => {
    const k = claveOpcion(o);
    return (
      <option key={k} value={k} disabled={usadas.has(k) && k !== linea.opcion}>
        {o.etiqueta}
      </option>
    );
  };
  return (
    <li className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Cambio {n}</span>
        {onQuitar && (
          <button
            type="button"
            onClick={onQuitar}
            aria-label={`Quitar el cambio ${n}`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      <div className="mt-1 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={idSel} className="block text-sm font-semibold text-[var(--text-secondary)]">
            Qué casillero o troza
          </label>
          <select
            id={idSel}
            value={linea.opcion}
            onChange={(e) => onCambiar({ ...linea, opcion: e.target.value })}
            aria-invalid={!!error?.opcion}
            className={`${I} mt-1`}
          >
            <option value="">Elige…</option>
            {casilleros.length > 0 && <optgroup label="Casilleros de la guía">{casilleros.map(opcion)}</optgroup>}
            {items.length > 0 && <optgroup label={grupoItems}>{items.map(opcion)}</optgroup>}
          </select>
          {error?.opcion && <span className={ERROR}>{error.opcion}</span>}
          {elegida && (
            <span className="mt-1.5 block text-sm text-[var(--text-secondary)]">
              Hoy dice:{" "}
              <b className="break-words text-[var(--text-primary)]">{elegida.dice ? `«${elegida.dice}»` : "— (la plataforma lo lee de la guía)"}</b>
            </span>
          )}
        </div>
        <div className="min-w-0">
          <label htmlFor={idCorr} className="block text-sm font-semibold text-[var(--text-secondary)]">
            Qué debería decir
          </label>
          <input
            id={idCorr}
            value={linea.correcto}
            maxLength={300}
            onChange={(e) => onCambiar({ ...linea, correcto: e.target.value })}
            aria-invalid={!!error?.correcto}
            placeholder={elegida?.donde === "item" ? "p. ej. D 62 cm · L 4,20 m" : "p. ej. AHX-812"}
            className={`${I} mt-1`}
          />
          {error?.correcto && <span className={ERROR}>{error.correcto}</span>}
        </div>
      </div>
    </li>
  );
}
