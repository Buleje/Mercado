"use client";

/**
 * El historial de la persona elegida en el alta: cómo se portó las veces
 * anteriores, que es el dato que decide si conviene repetir. Salió de
 * `campos.tsx`; la ficha de resumen que vivía acá pasó a «La cuenta»
 * (`PanelCuenta`), con las dos direcciones de la plata (ADR-448).
 */

import { useState } from "react";
import { ChevronDown } from "@buleje/design-system/icons";
import { quienDebe } from "@/lib/adelantos/direccion";
import { leerDireccion } from "@/lib/adelantos/modos-alta";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { formatDate } from "@/lib/format";
import { MODALIDAD_LABEL, fmtMon } from "../shared";

export function HistorialPersona({ historial }: { historial: DbAdelanto[] }) {
  const [abierto, setAbierto] = useState(false);
  if (historial.length === 0) return null;
  const liquidados = historial.filter((a) => a.status === "LIQUIDADO").length;

  return (
    <div className="overflow-hidden rounded-xl bg-[var(--surface-sunken)]">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <span>
          Historial · {historial.length} anterior{historial.length === 1 ? "" : "es"}
          {liquidados > 0 && (
            <span className="font-semibold text-[var(--accent-ink)]">
              {" "}• {liquidados} liquidado{liquidados === 1 ? "" : "s"}
            </span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {abierto && (
        <ul className="max-h-56 divide-y divide-[var(--rule-soft)] overflow-y-auto border-t border-[var(--rule-soft)]">
          {historial.map((a) => {
            const { direccion } = leerDireccion(a);
            const q = quienDebe({ direccion, status: a.status, saldoPendiente: a.saldoPendiente });
            return (
              <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-24 shrink-0 tabular-nums text-[var(--text-tertiary)]">{formatDate(a.fechaAdelanto)}</span>
                <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
                  {direccion === "RECIBIDO" ? "Recibido" : (MODALIDAD_LABEL[a.modalidad] ?? a.modalidad)}
                </span>
                <span className="shrink-0 font-bold tabular-nums text-[var(--text-primary)]">{fmtMon(a.montoAdelantado, a.moneda)}</span>
                <span
                  className={`w-28 shrink-0 text-right font-semibold tabular-nums ${
                    q === "te-debe" ? "text-[var(--data-warning-ink)]" : q === "le-debes" ? "text-[var(--data-info-ink)]" : "text-[var(--data-success-ink)]"
                  }`}
                >
                  {q === "te-debe"
                    ? `debe ${fmtMon(Math.abs(a.saldoPendiente), a.moneda)}`
                    : q === "le-debes"
                      ? `le debes ${fmtMon(Math.abs(a.saldoPendiente), a.moneda)}`
                      : a.status === "CANCELADO"
                        ? "anulado"
                        : "liquidado"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
