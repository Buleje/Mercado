"use client";

/**
 * La lista del «Contar el patio»: cada troza leída una sola vez, la más nueva
 * arriba, con su estado; la que no es de este permiso, en rojo. Se baja en CSV
 * (`csvRafaga`: `;` y coma decimal, como el resto del libro).
 */

import type { ReactNode } from "react";
import { Download, Trash2 } from "@buleje/design-system/icons";
import { ESTADOS_META } from "@/lib/forestal/loth-tablero-trozas";
import { csvRafaga, type LecturaRafaga } from "@/lib/forestal/loth-qr-troza";
import { limaDateKey } from "@/lib/utils";
import { TONO } from "./loth-tablero-partes";

export function bajarCsv(lista: readonly LecturaRafaga[], titulo?: string | null) {
  /* BOM: sin él, Excel abre el CSV en ANSI y «Árbol» sale «Ãrbol». */
  const blob = new Blob(["\uFEFF", csvRafaga(lista)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const permiso = (titulo ?? "").replace(/[^A-Za-z0-9-]+/g, "_").replace(/^_+|_+$/g, "");
  a.href = url;
  a.download = `conteo-patio${permiso ? `-${permiso}` : ""}-${limaDateKey()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LothEscanerTrozaLista({
  lista,
  resumen,
  onCsv,
  onVaciar,
}: {
  lista: readonly LecturaRafaga[];
  /** La línea «Leídas 12 · 11 en este permiso · 1 desconocida». */
  resumen: ReactNode;
  onCsv: () => void;
  onVaciar: () => void;
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {resumen}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCsv}
            disabled={lista.length === 0}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            CSV
          </button>
          <button
            type="button"
            onClick={onVaciar}
            disabled={lista.length === 0}
            aria-label="Vaciar la lista"
            title="Vaciar la lista"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--data-error-700)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {lista.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">Escanea la primera troza de la pila.</p>
      ) : (
        <ol
          className="max-h-80 divide-y divide-[var(--rule-soft)] overflow-y-auto"
          aria-label="Trozas leídas"
        >
          {[...lista].reverse().map((l) => (
            <li key={l.n} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm">
              <span className="w-7 shrink-0 font-mono tabular-nums text-[var(--text-tertiary)]">
                {l.n}
              </span>
              <span className="font-mono font-bold text-[var(--text-primary)]">{l.codigo}</span>
              {l.fila ? (
                <>
                  <span className="text-[var(--text-secondary)]">{l.fila.especie ?? ""}</span>
                  <span
                    className={`rounded-md border px-1.5 text-xs font-bold ${TONO[l.fila.estado].chip}`}
                  >
                    {ESTADOS_META[l.fila.estado].label}
                  </span>
                </>
              ) : (
                <span className="rounded-md border border-[var(--data-error-500)] px-1.5 text-xs font-bold text-[var(--data-error-700)]">
                  No es de este permiso
                </span>
              )}
              {l.veces > 1 && (
                <span className="text-xs text-[var(--text-tertiary)]">leída {l.veces} veces</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
