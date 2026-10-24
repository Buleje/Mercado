"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight, ShoppingBag, Store } from "@buleje/design-system/icons";
import { cn } from "@buleje/design-system";
import type { GrupoTienda } from "./filtrar";
import { haceCuanto } from "./meta";
import { COLUMNA_NIVEL, EtiquetaNivel, FILA, FilaPedido } from "./FilaAviso";

/**
 * Los pedidos sin atender de UNA tienda en una sola fila: «Tienda · N pedidos»,
 * el más antiguo y el nivel más alto de los suyos. Al abrirla salen sus pedidos
 * (cada uno se abre con sus artículos). «Abrir» lleva a los pedidos de la tienda.
 */
export function FilaTienda({
  grupo,
  abierto,
  onAlternar,
  pedidoAbierto,
  onPedido,
  onIr,
}: {
  grupo: GrupoTienda;
  abierto: boolean;
  onAlternar: () => void;
  pedidoAbierto: string | null;
  onPedido: (id: string) => void;
  onIr: () => void;
}) {
  const n = grupo.pedidos.length;
  const masAntiguo = grupo.masViejo ? `el más antiguo hace ${haceCuanto(grupo.masViejo)}` : null;
  return (
    <li className={abierto ? "bg-[var(--surface-sunken)]/40" : undefined}>
      <div className="flex items-stretch">
        <button type="button" onClick={onAlternar} aria-expanded={abierto} className={cn(FILA, "min-w-0 flex-1")}>
          <EtiquetaNivel nivel={grupo.nivel} className={COLUMNA_NIVEL} />
          <div className="min-w-0">
            <p className="flex min-w-0 items-center gap-2">
              <EtiquetaNivel nivel={grupo.nivel} className="sm:hidden" />
              <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {grupo.tienda} · {n} {n === 1 ? "pedido" : "pedidos"}
              </span>
            </p>
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
              <ShoppingBag className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="shrink-0 font-medium text-[var(--text-secondary)]">Pedido</span>
              <span aria-hidden>·</span>
              <Store className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{masAntiguo ?? "sin atender"}</span>
            </p>
          </div>
          <ChevronDown
            className={cn("h-4 w-4 text-[var(--accent-ink)] transition-transform dark:text-[var(--accent)]", abierto && "rotate-180")}
            aria-hidden
          />
        </button>
        <Link
          href={grupo.href}
          onClick={onIr}
          aria-label={`Abrir los pedidos de ${grupo.tienda}`}
          className="inline-flex shrink-0 items-center gap-0.5 px-3 text-xs font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-soft)] dark:text-[var(--accent)]"
        >
          <span className="hidden sm:inline">Abrir</span>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      {abierto && (
        <ul className="divide-y divide-[var(--rule-soft)] border-t border-[var(--rule-soft)] sm:pl-6">
          {grupo.pedidos.map((p) => (
            <FilaPedido key={p.id} aviso={p} abierto={pedidoAbierto === p.id} onAlternar={() => onPedido(p.id)} onIr={onIr} enGrupo />
          ))}
        </ul>
      )}
    </li>
  );
}
