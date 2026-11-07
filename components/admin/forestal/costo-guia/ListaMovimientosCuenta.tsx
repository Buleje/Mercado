"use client";

/**
 * Los movimientos de la cuenta del proveedor, la más nueva arriba (memoria
 * `cubicador-orden-mas-nuevas-primero`): fecha · concepto · guía · cargo/abono
 * · saldo después. Lista y no tabla: a 400 px una tabla de cinco columnas se
 * vuelve una tira que hay que arrastrar.
 *
 * El saldo corrido es el de TODA la cuenta (el del estado de cuenta), no el
 * del filtro: con «Pagos» elegido se sigue leyendo cuánto quedó debiendo.
 */

import { useState } from "react";
import { montoEnMoneda } from "@/lib/adelantos/cuenta-unificada";
import { sentidoDelSaldo, type LineaCuentaGuia } from "@/lib/forestal/cuenta-en-la-guia";
import { diaCorto } from "./comun";

/** «Le debes S/ 1,000.00» · «Te debe S/ 20.00» · «Al día» — sin signos que haya que descifrar. */
export function saldoEnPalabras(n: number, moneda = "PEN", minuscula = false): string {
  const s = sentidoDelSaldo(n);
  const t = s === "al-dia" ? "Al día" : s === "le-debes" ? "Le debes" : "Te debe";
  const frase = minuscula ? t.charAt(0).toLowerCase() + t.slice(1) : t;
  return s === "al-dia" ? frase : `${frase} ${montoEnMoneda(Math.abs(n), moneda)}`;
}

/** Mismo par de colores que «Cuenta por persona»: te deben = coral, le debes = celeste. */
export function tonoDelSaldo(n: number): string {
  const s = sentidoDelSaldo(n);
  return s === "al-dia"
    ? "text-[var(--data-success-ink)]"
    : s === "te-debe"
      ? "text-[var(--data-warning-ink)]"
      : "text-[var(--data-info-ink)]";
}


/** Las primeras que se ven; el resto, con «Ver las N anteriores». */
const VISIBLES = 8;

export default function ListaMovimientosCuenta({
  lineas,
  gtfActual,
}: {
  /** Cronológicas (la más vieja primero), como vienen del servidor. */
  lineas: readonly LineaCuentaGuia[];
  gtfActual: string;
}) {
  const [todas, setTodas] = useState(false);
  const nuevasPrimero = [...lineas].reverse();
  const visibles = todas ? nuevasPrimero : nuevasPrimero.slice(0, VISIBLES);
  const ocultas = nuevasPrimero.length - visibles.length;

  if (lineas.length === 0) {
    return <p className="py-2 text-[var(--text-tertiary)]">Sin movimientos de este tipo.</p>;
  }

  return (
    <div className="space-y-2">
      <ol className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]">
        {visibles.map((l, i) => {
          const esCargo = l.monto >= 0;
          const deEstaGuia = l.gtfNumber != null && l.gtfNumber === gtfActual;
          return (
            <li key={`${l.dia}-${i}-${l.concepto}`} className="space-y-0.5 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 text-[var(--text-primary)]">
                  <span className="tabular-nums text-[var(--text-secondary)]">{diaCorto(l.dia)}</span> ·{" "}
                  <span className="font-bold">{l.concepto}</span>
                </span>
                <span
                  className={`shrink-0 font-bold tabular-nums ${esCargo ? "text-[var(--data-warning-ink)]" : "text-[var(--data-info-ink)]"}`}
                >
                  {esCargo ? "+" : "−"}
                  {montoEnMoneda(Math.abs(l.monto), l.moneda)}
                  <span className="sr-only">{esCargo ? " (cargo)" : " (abono)"}</span>
                </span>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[var(--text-tertiary)]">
                  {l.gtfNumber && (
                    <span
                      className={`inline-flex items-center rounded-md border px-1.5 text-sm font-bold ${
                        deEstaGuia
                          ? "border-[var(--accent)] text-[var(--accent-ink)] dark:text-[var(--accent)]"
                          : "border-[var(--rule-base)] text-[var(--text-secondary)]"
                      }`}
                    >
                      {deEstaGuia ? "Esta guía" : `Guía ${l.gtfNumber}`}
                    </span>
                  )}
                  {/* El abono de madera lleva la guía de referencia: el chip ya la dice. */}
                  {l.referencia && l.referencia !== l.gtfNumber && (
                    <span className="min-w-0 break-all">{l.referencia}</span>
                  )}
                </span>
                <span className={`ml-auto shrink-0 tabular-nums ${tonoDelSaldo(l.acumulado)}`}>
                  {saldoEnPalabras(l.acumulado, l.moneda, true)}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      {ocultas > 0 && (
        <button
          type="button"
          onClick={() => setTodas(true)}
          className="inline-flex min-h-11 items-center font-bold text-[var(--text-secondary)] hover:underline"
        >
          Ver {ocultas === 1 ? "la anterior" : `las ${ocultas} anteriores`}
        </button>
      )}
    </div>
  );
}
