"use client";

/**
 * Los movimientos de la caja abierta en UN bloque: la lista y la línea de
 * tiempo hablaban de lo mismo y estaban apiladas; ahora son dos vistas del
 * mismo bloque (recordada). Los filtros (medio y origen) van pegados a la
 * tabla. Cada fila dice de dónde vino: venta, adelanto, gasto, retiro del dueño…
 */
import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { History } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { medioCorregible } from "@/lib/caja/cambiar-medio";
import { ETIQUETA_ORIGEN, ORDEN_ORIGEN, origenDeMovimiento, type OrigenClave } from "@/lib/caja/origen-movimiento";
import { medioDeMovimiento } from "@/lib/caja/saldo-esperado";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CambiarMedioMovimiento } from "../cash-register/CambiarMedioMovimiento";
import { CajaLineaDeTiempo } from "./CajaLineaDeTiempo";
import type { ItemLineaDeTiempo } from "./use-caja-registradora";
import { COLOR_SIGNO, fmt, signoDe, type CashRegister, type MethodFilter } from "./tipos";

const MEDIOS: MethodFilter[] = ["all", "efectivo", "yape", "plin", "tarjeta", "transferencia"];

const COLOR_ORIGEN: Partial<Record<OrigenClave, string>> = {
  venta: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  "retiro-dueno": "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  gasto: "bg-[var(--data-error-500)]/12 text-[var(--data-error-500)]",
  proveedor: "bg-[var(--data-error-500)]/12 text-[var(--data-error-500)]",
  adelanto: "bg-[var(--data-8)]/15 text-[var(--text-primary)]",
};

interface Props {
  caja: CashRegister;
  timeline: ItemLineaDeTiempo[];
  efectivoActual: number;
  puedeCambiarMedio: boolean;
  onCambiado: () => void;
}

export function CajaMovimientos({ caja, timeline, efectivoActual, puedeCambiarMedio, onCambiado }: Props) {
  const [vista, setVista] = useLocalStorage<"lista" | "tiempo">("caja:movimientos-vista", "lista");
  const [medio, setMedio] = useState<MethodFilter>("all");
  const [origen, setOrigen] = useState<OrigenClave | "todos">("todos");

  const conOrigen = useMemo(() => caja.movements.map((m) => ({ m, origen: origenDeMovimiento(m) })), [caja.movements]);
  const origenesPresentes = useMemo(() => ORDEN_ORIGEN.filter((o) => conOrigen.some((x) => x.origen.clave === o)), [conOrigen]);
  const filas = conOrigen.filter(
    ({ m, origen: o }) => (medio === "all" || medioDeMovimiento(m.method) === medio) && (origen === "todos" || o.clave === origen),
  );

  return (
    <section className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-[var(--rule-soft)] flex flex-wrap items-center gap-2">
        <History className="h-5 w-5 text-primary" aria-hidden />
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Movimientos · {caja.movements.length}</CardTitle>
        <InfoTip what="Todo lo que entró y salió de la caja desde que la abriste. El origen sale del motivo con que se anotó." example="«Retiro del dueño» = lo que sacaste para tu casa; «Adelanto» = plata adelantada a un trabajador o proveedor." />
        <div className="ml-auto flex rounded-xl bg-[var(--surface-sunken)] p-0.5" role="tablist" aria-label="Cómo ver los movimientos">
          {(["lista", "tiempo"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={vista === v}
              onClick={() => setVista(v)}
              className={cn("px-3 min-h-9 rounded-lg text-sm font-semibold transition-colors", vista === v ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--text-secondary)]")}
            >
              {v === "lista" ? "Lista" : "Línea de tiempo"}
            </button>
          ))}
        </div>
      </div>

      {vista === "tiempo" ? (
        <CajaLineaDeTiempo items={timeline} efectivoActual={efectivoActual} />
      ) : (
        <>
          <div className="px-4 sm:px-5 py-2 border-b border-[var(--rule-soft)] flex flex-wrap items-center gap-2">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none" role="group" aria-label="Filtrar por medio">
              {MEDIOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={medio === m}
                  onClick={() => setMedio(m)}
                  className={cn(
                    "shrink-0 px-3 min-h-9 rounded-lg text-sm font-semibold transition-colors",
                    medio === m ? "bg-primary text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-soft)]",
                  )}
                >
                  {m === "all" ? "Todos" : m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
            <select
              value={origen}
              onChange={(e) => setOrigen(e.target.value as OrigenClave | "todos")}
              aria-label="Filtrar por origen"
              className="ml-auto min-h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)]"
            >
              <option value="todos">Todo origen</option>
              {origenesPresentes.map((o) => (
                <option key={o} value={o}>
                  {ETIQUETA_ORIGEN[o]}
                </option>
              ))}
            </select>
          </div>
          {filas.length === 0 ? (
            <p className="py-8 text-center text-sm font-semibold text-[var(--text-tertiary)]">Sin movimientos con ese filtro.</p>
          ) : (
            <div className="max-h-[28rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--surface-raised)] text-left text-xs text-[var(--text-tertiary)]">
                  <tr>
                    <th className="px-4 sm:px-5 py-2 font-semibold">Hora</th>
                    <th className="px-2 py-2 font-semibold">Origen</th>
                    <th className="px-2 py-2 font-semibold">Detalle</th>
                    <th className="px-2 py-2 font-semibold">Medio</th>
                    <th className="px-4 sm:px-5 py-2 font-semibold text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule-soft)]">
                  {filas.map(({ m, origen: o }) => {
                    const signo = signoDe(m.type);
                    return (
                      <tr key={m.id} className="hover:bg-[var(--surface-alt)] transition-colors">
                        <td className="px-4 sm:px-5 py-2.5 font-mono text-xs text-[var(--text-tertiary)] whitespace-nowrap">{formatTime(m.createdAt)}</td>
                        <td className="px-2 py-2.5">
                          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap", COLOR_ORIGEN[o.clave] ?? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]")}>{o.etiqueta}</span>
                        </td>
                        <td className="px-2 py-2.5 max-w-[18rem] truncate text-[var(--text-secondary)]" title={m.description}>
                          {m.description}
                        </td>
                        <td className="px-2 py-2.5 capitalize text-[var(--text-secondary)]">{medioDeMovimiento(m.method)}</td>
                        <td className="px-4 sm:px-5 py-2.5 text-right">
                          <span className={cn("font-bold tabular-nums whitespace-nowrap", COLOR_SIGNO[signo])}>
                            {signo === 1 ? "+" : signo === -1 ? "−" : ""}
                            {fmt(m.amount)}
                          </span>
                          {/* Un adelanto anotado como efectivo que se pagó por transferencia: corregir el medio mueve el esperado. */}
                          {puedeCambiarMedio && medioCorregible(m.type) && (
                            <div className="mt-1">
                              <CambiarMedioMovimiento cashRegisterId={caja.id} movimiento={m} esperadoActual={efectivoActual} formato={fmt} onCambiado={onCambiado} />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
