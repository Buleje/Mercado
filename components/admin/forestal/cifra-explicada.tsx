"use client";

/**
 * «¿Por qué este número?» — la cuenta detrás de una cifra, sin salir de donde
 * está (medido y pedido, 2026-09-09).
 *
 * El módulo explica REGLAS —los ⓘ de cada sección— pero ningún número explica
 * su propia cuenta. Y la pregunta del aserradero nunca es «qué significa
 * distribuido»: es **«por qué dice 1.840 y no 1.850»**. Contestarla obligaba a
 * abrir tres tablas y sumar a mano; cuando no cierra, esa suma a mano es lo que
 * decide si se firma el papel.
 *
 * Muestra las filas que componen el total y la fórmula con la que se armó. Es
 * de sólo lectura: no recalcula nada, sólo enseña lo que ya se calculó — un
 * segundo cálculo para explicar el primero es cómo terminan divergiendo.
 */
import { Calculator } from "@buleje/design-system/icons";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";

export interface FilaDeCuenta {
  etiqueta: string;
  /** Ya formateado por quien llama: acá no se decide cómo se escribe un m³. */
  valor: string;
  /** Un dato de contexto en chico (piezas, %, de qué bloque salió). */
  nota?: string;
}

export default function CifraExplicada({
  titulo,
  formula,
  filas,
  total,
  vacio = "Todavía no hay nada que sumar.",
  className = "",
}: {
  /** Qué número se está explicando («Distribuido»). */
  titulo: string;
  /** La cuenta, en una línea: «suma de lo que cada bloque ampara». */
  formula: string;
  filas: FilaDeCuenta[];
  /** El total ya formateado — el mismo que se ve afuera. */
  total: string;
  vacio?: string;
  className?: string;
}) {
  /* Tope de filas: un desglose de 300 renglones dentro de un tooltip no se lee.
     Las que más pesan primero las pone quien llama; acá se dice cuántas faltan. */
  const MAX = 12;
  const visibles = filas.slice(0, MAX);
  const resto = filas.length - visibles.length;

  return (
    <AdminTooltip
      className="max-w-[360px] text-sm font-normal normal-case leading-relaxed tracking-normal"
      content={
        <div>
          <p className="font-bold text-[var(--text-primary)]">{titulo}</p>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{formula}</p>
          {filas.length === 0 ? (
            <p className="mt-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{vacio}</p>
          ) : (
            <ul className="mt-1.5 space-y-0.5">
              {visibles.map((f, i) => (
                <li key={`${f.etiqueta}-${i}`} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {f.etiqueta}
                    {f.nota && (
                      <span className="ml-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{f.nota}</span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums">{f.valor}</span>
                </li>
              ))}
              {resto > 0 && (
                <li className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                  y {resto} {resto === 1 ? "renglón más" : "renglones más"}
                </li>
              )}
            </ul>
          )}
          <p className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-[var(--rule-soft)] pt-1 font-bold">
            <span>Total</span>
            <span className="font-mono tabular-nums">{total}</span>
          </p>
        </div>
      }
    >
      <button
        type="button"
        aria-label={`Por qué ${titulo} dice ${total}`}
        title={`Ver la cuenta de «${titulo}»`}
        className={`shrink-0 rounded text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] print:hidden ${className}`}
      >
        <Calculator className="h-3.5 w-3.5" aria-hidden />
      </button>
    </AdminTooltip>
  );
}
