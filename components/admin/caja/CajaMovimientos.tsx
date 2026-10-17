"use client";

/**
 * Caja › Hoy › Movimientos: la lista y la línea de tiempo hablaban de lo
 * mismo y estaban apiladas; ahora son dos vistas del mismo bloque (recordada).
 * Desde el 10-10 es su propia sección: el título y su ⓘ son los de la
 * cabecera, y cómo verlos + los filtros (medio y origen) van en UNA fila
 * pegada a la tabla. Cada fila dice de dónde vino: venta, adelanto, gasto…
 */
import { useMemo, useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { medioCorregible } from "@/lib/caja/cambiar-medio";
import { ETIQUETA_ORIGEN, ORDEN_ORIGEN, origenDeMovimiento, type OrigenClave } from "@/lib/caja/origen-movimiento";
import { medioDeMovimiento } from "@/lib/caja/saldo-esperado";
import { fechaCortaLima } from "@/lib/caja/caja-abierta";
import { formatTime } from "@/lib/format";
import { cn, limaDateKey } from "@/lib/utils";
import { CambiarMedioMovimiento } from "../cash-register/CambiarMedioMovimiento";
import { CajaLineaDeTiempo } from "./CajaLineaDeTiempo";
import type { ItemLineaDeTiempo } from "./use-caja-registradora";
import { COLOR_SIGNO, acortarIds, fmt, signoDe, type CashRegister, type MethodFilter } from "./tipos";
import { DataTable } from "@buleje/design-system";

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
  const [buscar, setBuscar] = useState("");
  /* Sesión de varios días: la hora sola no dice cuándo (M24, caja abierta en junio). */
  const variosDias = limaDateKey(caja.openedAt) !== limaDateKey();

  const conOrigen = useMemo(() => caja.movements.map((m) => ({ m, origen: origenDeMovimiento(m) })), [caja.movements]);
  const origenesPresentes = useMemo(() => ORDEN_ORIGEN.filter((o) => conOrigen.some((x) => x.origen.clave === o)), [conOrigen]);
  const q = buscar.trim().toLowerCase().replace(/^#/, "");
  const filas = conOrigen.filter(
    ({ m, origen: o }) =>
      (medio === "all" || medioDeMovimiento(m.method) === medio) &&
      (origen === "todos" || o.clave === origen) &&
      (!q || `${m.description} ${o.etiqueta} ${m.amount}`.toLowerCase().includes(q)),
  );

  return (
    <section aria-label={`Movimientos de la caja · ${caja.movements.length}`} className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] overflow-hidden">
      {/* Una sola fila: cómo verlos y, en la lista, los filtros pegados a la tabla. */}
      <div className="px-3 sm:px-4 py-2 border-b border-[var(--rule-soft)] flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-[var(--surface-sunken)]" role="tablist" aria-label="Cómo ver los movimientos">
          {(["lista", "tiempo"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={vista === v}
              onClick={() => setVista(v)}
              className={cn("px-4 min-h-12 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap", vista === v ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)] ring-1 ring-[var(--rule-base)]" : "text-[var(--text-secondary)]")}
            >
              {v === "lista" ? "Lista" : "Línea de tiempo"}
            </button>
          ))}
        </div>
        {vista === "lista" && (
          <>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none" role="group" aria-label="Filtrar por medio">
              {MEDIOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={medio === m}
                  onClick={() => setMedio(m)}
                  className={cn(
                    "shrink-0 px-3 min-h-12 rounded-xl border text-sm font-semibold transition-colors",
                    medio === m ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-transparent bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                  )}
                >
                  {m === "all" ? "Todos" : m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
            <input
              type="search"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar código o concepto"
              aria-label="Buscar movimiento por código, concepto o monto"
              className="ml-auto min-h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] sm:w-56"
            />
            <select
              value={origen}
              onChange={(e) => setOrigen(e.target.value as OrigenClave | "todos")}
              aria-label="Filtrar por origen"
              className="min-h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)]"
            >
              <option value="todos">Todo origen</option>
              {origenesPresentes.map((o) => (
                <option key={o} value={o}>
                  {ETIQUETA_ORIGEN[o]}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {vista === "tiempo" ? (
        <CajaLineaDeTiempo items={timeline} efectivoActual={efectivoActual} />
      ) : (
        <>
          {filas.length === 0 ? (
            <p className="py-8 text-center text-sm font-semibold text-[var(--text-secondary)]">{q ? `Nada con «${buscar.trim()}».` : "Sin movimientos con ese filtro."}</p>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto">
              <DataTable className="w-full">
                <thead className="sticky top-0">
                  <tr>
                    <th>{variosDias ? "Día y hora" : "Hora"}</th>
                    <th>Origen</th>
                    <th>Detalle</th>
                    <th>Medio</th>
                    <th className="text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule-soft)]">
                  {filas.map(({ m, origen: o }) => {
                    const signo = signoDe(m.type);
                    return (
                      <tr key={m.id} className="hover:bg-[var(--surface-alt)]">
                        <td className="whitespace-nowrap text-[var(--text-secondary)]">
                          {variosDias && <span className="block text-sm font-semibold text-[var(--text-primary)]">{fechaCortaLima(m.createdAt)}</span>}
                          <span className="font-mono">{formatTime(m.createdAt)}</span>
                        </td>
                        <td>
                          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-sm font-semibold whitespace-nowrap", COLOR_ORIGEN[o.clave] ?? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]")}>{o.etiqueta}</span>
                        </td>
                        <td className="max-w-[18rem] truncate text-[var(--text-secondary)]" title={m.description}>
                          {acortarIds(m.description)}
                        </td>
                        <td className="capitalize text-[var(--text-secondary)]">{medioDeMovimiento(m.method)}</td>
                        <td className="text-right">
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
              </DataTable>
            </div>
          )}
        </>
      )}
    </section>
  );
}
