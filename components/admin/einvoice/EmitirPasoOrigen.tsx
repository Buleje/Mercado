"use client";

/** Paso 1 de «Emitir comprobante»: buscar y elegir el pedido (F04/M53). */
import { LoadingState } from "@buleje/design-system";
import { ChevronRight, Search } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { diaYFecha, type PedidoElegible } from "./emision-reglas";
import type { PedidosParaEmitir } from "./use-pedidos-para-emitir";

export function EmitirPasoOrigen({ pedidos, onElegir }: { pedidos: PedidosParaEmitir; onElegir: (p: PedidoElegible) => void }) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
        <input
          type="search"
          autoFocus
          value={pedidos.busqueda}
          onChange={(e) => pedidos.setBusqueda(e.target.value)}
          placeholder="Código, cliente, celular, monto o producto"
          aria-label="Buscar el pedido por código, cliente, celular, monto, fecha o producto"
          data-qa="emitir-buscar-pedido"
          className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
        />
      </div>

      {pedidos.fase === "cargando" ? (
        <LoadingState message="Trayendo los pedidos…" />
      ) : pedidos.fase === "error" ? (
        <p role="alert" className="rounded-xl bg-[var(--data-error-50)] px-3 py-3 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          No se pudieron traer los pedidos. Cierra y vuelve a abrir la ventana.
        </p>
      ) : pedidos.visibles.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-tertiary)]">
          {pedidos.total === 0 ? "Todavía no hay pedidos para emitir." : "Ningún pedido coincide con esa búsqueda."}
        </p>
      ) : (
        <>
          <ul className="max-h-[22rem] divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-xl border border-[var(--rule-base)]" aria-label="Pedidos">
            {pedidos.visibles.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={p.bloqueo !== null}
                  onClick={() => onElegir(p)}
                  data-qa="emitir-pedido"
                  className={cn(
                    "flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                    p.bloqueo === null ? "hover:bg-[var(--surface-sunken)]" : "cursor-not-allowed opacity-60",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{p.codigo}</span>
                      <span className="truncate text-sm text-[var(--text-primary)]">{p.cliente || "Sin nombre"}</span>
                    </span>
                    <span className="block text-sm text-[var(--text-secondary)]">
                      {diaYFecha(p.creado)} · {p.estado}
                      {p.bloqueo && <span className="font-semibold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]"> · {p.bloqueo}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--text-primary)]">{formatCurrency(p.total)}</span>
                  {p.bloqueo === null && <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
          {pedidos.coinciden > pedidos.visibles.length && (
            <p className="text-sm text-[var(--text-tertiary)]">
              Se ven {pedidos.visibles.length} de {pedidos.coinciden}: escribe más para acotar.
            </p>
          )}
        </>
      )}
    </div>
  );
}
