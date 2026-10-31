"use client";

/**
 * «Mi cuenta › Pedidos»: los anteriores al último (ése ya está arriba, en el
 * saludo: no se repite), hasta 5, con su estado. El historial completo
 * (buscar, repetir, seguimiento) vive en «Mis pedidos».
 */

import Link from "next/link";
import { ChevronRight, RefreshCw } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import { EstadoPedido } from "./EstadoPedido";
import { BOTON_PRINCIPAL } from "./EntrarCuenta";
import { DESTINOS, fechaCorta, rutaCuenta } from "./cuenta-rutas";
import { piezasDe, type PedidosCliente } from "./use-pedidos-cliente";

const FILA =
  "flex min-h-16 items-center gap-3 px-4 py-3 transition-colors duration-[var(--dur-fast)] hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]";

export function SeccionPedidos({ base, conSesion, pedidos }: { base: string; conSesion: boolean; pedidos: PedidosCliente }) {
  const { pedidos: lista, cargando, error, reintentar } = pedidos;

  if (!conSesion) return <p className="text-base text-[var(--text-secondary)]">Entra para ver tus pedidos.</p>;
  if (cargando) {
    return (
      <div aria-busy="true" className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-base text-[var(--text-primary)]">No pudimos cargar tus pedidos.</p>
        <button
          type="button"
          onClick={reintentar}
          className="inline-flex h-12 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-base font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Reintentar
        </button>
      </div>
    );
  }
  if (lista.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-base text-[var(--text-secondary)]">Aún no tienes pedidos en esta tienda.</p>
        <Link href={rutaCuenta(base, DESTINOS.catalogo)} className={`${BOTON_PRINCIPAL} w-auto`}>
          Ir a comprar
        </Link>
      </div>
    );
  }

  const anteriores = lista.slice(1, 6);
  const verTodos = (
    <Link
      href={rutaCuenta(base, DESTINOS.pedidos)}
      className="inline-flex h-12 items-center gap-1 self-start rounded-xl px-1 text-base font-semibold text-[var(--text-primary)] underline-offset-4 hover:underline"
    >
      Ver todos mis pedidos
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
  if (anteriores.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-base text-[var(--text-secondary)]">Tus pedidos anteriores aparecerán aquí.</p>
        {verTodos}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-[var(--rule-soft)] overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        {anteriores.map((p) => {
          const piezas = piezasDe(p);
          return (
            <li key={p.id}>
              <Link href={rutaCuenta(base, `${DESTINOS.pedidos}?order=${encodeURIComponent(p.id)}`)} className={FILA}>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-[var(--text-primary)]">
                      Pedido #{p.id.slice(-6).toUpperCase()}
                    </span>
                    <EstadoPedido status={p.status} />
                  </span>
                  <span className="truncate text-sm text-[var(--text-secondary)]">
                    {[fechaCorta(p.createdAt), piezas ? `${piezas} ${piezas === 1 ? "producto" : "productos"}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {typeof p.total === "number" && (
                  <span className="shrink-0 text-base font-semibold tabular-nums text-[var(--text-primary)]">
                    {formatCurrency(p.total)}
                  </span>
                )}
                <ChevronRight className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
      {verTodos}
    </div>
  );
}
