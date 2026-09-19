"use client";

/**
 * El detalle de cada código repetido: las piezas que lo comparten y cuál lo
 * conserva.
 *
 * Vive aparte del aviso porque casi nunca se abre: el cartel de una línea dice
 * cuántos hay y ofrece resolverlos todos; esto es para cuando alguien quiere
 * elegir a mano cuál pieza se queda con la marca pintada en la testa.
 */

import { Hash } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

export interface PiezaDup {
  id: string;
  codigoPlanta: string;
  codificacion: string | null;
  especieComun: string | null;
  volumenM3: number | null;
  gtfNumber: string;
  entryDate: string;
  consumida: boolean;
  noRecepcionada: boolean;
  /** Su ingreso está anulado: no hay madera suya en el patio, pero su fila
   *  sigue ocupando la marca y por eso bloquea el candado. */
  ingresoAnulado: boolean;
}

export interface GrupoDup {
  codigo: string;
  piezas: PiezaDup[];
}

const BTN =
  "inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-40";

const ETIQUETA = "rounded px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold";

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export default function CtpCodigosDuplicadosGrupos({
  grupos, conservar, onConservar, onRenumerar, trabajando,
}: {
  grupos: GrupoDup[];
  /** `código → id de la pieza que se queda con la marca`. */
  conservar: Record<string, string>;
  onConservar: (codigo: string, piezaId: string) => void;
  onRenumerar: (grupos: GrupoDup[]) => void;
  trabajando: boolean;
}) {
  return (
    <>
      <ul className="space-y-2">
        {grupos.map((g) => (
          <li key={g.codigo} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
                Código {g.codigo} · {g.piezas.length} piezas
              </span>
              <button type="button" onClick={() => onRenumerar([g])} disabled={trabajando} className={BTN}>
                <Hash className="h-4 w-4" /> Renumerar las otras
              </button>
            </div>
            <ul className="space-y-1.5">
              {g.piezas.map((p) => {
                const elegida = conservar[g.codigo] === p.id;
                return (
                  <li key={p.id}>
                    <label
                      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                        elegida
                          ? "border-[var(--data-success-500)] bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/10"
                          : "border-transparent bg-[var(--surface-sunken)]"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`conservar-${g.codigo}`}
                        checked={elegida}
                        onChange={() => onConservar(g.codigo, p.id)}
                        className="h-4 w-4 accent-[var(--data-success-600)]"
                      />
                      <span className="font-mono font-bold text-[var(--text-primary)]">{p.codificacion ?? "sin codificación"}</span>
                      <span className="text-[var(--text-secondary)]">{p.especieComun ?? "—"}</span>
                      <span className="font-mono tabular-nums text-[var(--text-tertiary)]">
                        {p.volumenM3 != null ? `${fmtM3(p.volumenM3)} m³` : "—"}
                      </span>
                      <span className="text-[var(--text-tertiary)]">GTF {p.gtfNumber} · {fecha(p.entryDate)}</span>
                      {p.consumida && (
                        <span className={`${ETIQUETA} bg-[var(--data-info-100)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]`}>
                          ya se aserró
                        </span>
                      )}
                      {p.ingresoAnulado && (
                        <span className={`${ETIQUETA} bg-[var(--surface-sunken)] text-[var(--text-tertiary)]`}>ingreso anulado</span>
                      )}
                      {p.noRecepcionada && (
                        <span className={`${ETIQUETA} bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]`}>
                          no llegó
                        </span>
                      )}
                      <span className="ml-auto text-xs font-bold text-[var(--text-tertiary)]">
                        {elegida ? "conserva el código" : "recibe uno nuevo"}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs text-[var(--text-tertiary)]">
        Se propone conservar el código de la pieza que ya se aserró —su marca viajó a una corrida— y, si ninguna,
        el de la primera que sigue viva. Las piezas de un mes cerrado no se tocan: hay que reabrir el período.
      </p>
    </>
  );
}
