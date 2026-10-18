"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, Layers, SearchX } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { AvisoBandeja, BandejaAvisos } from "@/lib/superadmin/nivel-aviso";
import { contarTiendas, filasDeLista, type Filtros, type GrupoIncompleto } from "./filtrar";
import { CATEGORIA_META, NIVEL_META } from "./meta";
import { FilaAviso } from "./FilaAviso";
import { FilaTienda } from "./FilaTienda";

const PLURAL_NIVEL = { urgente: "urgentes", importante: "importantes", leve: "leves", informativo: "informativos" } as const;

const ENLACE =
  "inline-flex min-h-9 shrink-0 items-center gap-0.5 rounded-md px-2 text-xs font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-soft)] dark:text-[var(--accent)]";

/** Una frase según qué filtro dejó la lista vacía. */
function fraseVacia(data: BandejaAvisos, f: Filtros): string {
  if (f.q.trim()) return `Nada coincide con «${f.q.trim()}».`;
  const donde = f.categoria === "todas" ? "" : ` en ${CATEGORIA_META[f.categoria].etiqueta.toLowerCase()}`;
  if (f.nivel !== "todos") return `No hay avisos ${PLURAL_NIVEL[f.nivel]}${donde}.`;
  if (data.total === 0) return "Bandeja limpia: no hay nada pendiente.";
  return `No hay avisos${donde}.`;
}

/** Cabecera de la lista: qué categoría se está viendo y el enlace a su pantalla. */
function CabeceraLista({
  data,
  f,
  visibles,
  enFiltro,
  tiendas,
  onIr,
}: {
  data: BandejaAvisos;
  f: Filtros;
  visibles: number;
  /** Tiendas con pedidos en la lista (sólo para «Pedidos sin atender»). */
  tiendas: number;
  enFiltro: number;
  onIr: () => void;
}) {
  const meta = f.categoria === "todas" ? null : CATEGORIA_META[f.categoria];
  const Icono = meta?.icon ?? Layers;
  const grupo = f.categoria === "todas" ? null : data.buckets[f.categoria];
  return (
    <div className="sticky top-0 z-10 flex min-h-11 items-center gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)] px-4 py-1.5">
      <Icono className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
      <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{meta?.etiqueta ?? "Todas las categorías"}</span>
      {meta && (
        <InfoTip
          title={meta.etiqueta}
          what={meta.descripcion}
          affects={
            f.categoria === "pendingOrders"
              ? "La lista trae una fila por tienda; los números de los chips cuentan pedidos, no tiendas."
              : undefined
          }
          example={
            f.categoria === "pendingOrders" && grupo
              ? `${grupo.count} pedidos${tiendas > 0 ? ` en ${tiendas} ${tiendas === 1 ? "tienda" : "tiendas"}` : ""}.`
              : undefined
          }
        />
      )}
      <span className="shrink-0 text-xs tabular-nums text-[var(--text-tertiary)]">
        {visibles === enFiltro ? `${visibles}` : `${visibles} de ${enFiltro}`}
        <span className="hidden sm:inline"> · urgente primero</span>
      </span>
      <span className="flex-1" />
      {grupo && (
        <Link href={grupo.href} onClick={onIr} className={ENLACE}>
          Ver todos ({grupo.count})
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/**
 * La lista del centro de notificaciones: filas densas ordenadas urgente →
 * informativo y, dentro de cada nivel, lo más reciente primero. Al final, los
 * grupos que traen más de lo que bajó, con su enlace a la pantalla propia.
 */
export function ListaAvisos({
  data,
  filtros,
  visibles,
  enFiltro,
  incompletos,
  onIr,
}: {
  data: BandejaAvisos;
  filtros: Filtros;
  visibles: AvisoBandeja[];
  /** Cuántos hay con este filtro en el servidor (el chip activo). */
  enFiltro: number;
  incompletos: GrupoIncompleto[];
  onIr: () => void;
}) {
  // Acordeón de pedidos: uno abierto a la vez.
  const [pedidoAbierto, setPedidoAbierto] = useState<string | null>(null);
  // Una tienda abierta a la vez.
  const [tiendaAbierta, setTiendaAbierta] = useState<string | null>(null);
  const filas = useMemo(() => filasDeLista(visibles), [visibles]);
  const tiendas = useMemo(
    () => contarTiendas(data.buckets.pendingOrders.items),
    [data],
  );
  const vacia = visibles.length === 0;
  const Vacio = filtros.q.trim() ? SearchX : CheckCircle2;

  return (
    <section aria-label="Avisos" className="min-h-0 flex-1 overflow-y-auto" data-qa="lista-avisos">
      <CabeceraLista data={data} f={filtros} visibles={visibles.length} enFiltro={enFiltro} tiendas={tiendas} onIr={onIr} />
      {vacia ? (
        <p className="flex items-center justify-center gap-2 px-6 py-16 text-center text-sm text-[var(--text-secondary)]">
          <Vacio className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          {fraseVacia(data, filtros)}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--rule-soft)]">
          {filas.map((fila) =>
            fila.tipo === "tienda" ? (
              <FilaTienda
                key={`t-${fila.id}`}
                grupo={fila}
                abierto={tiendaAbierta === fila.id}
                onAlternar={() => setTiendaAbierta((v) => (v === fila.id ? null : fila.id))}
                pedidoAbierto={pedidoAbierto}
                onPedido={(id) => setPedidoAbierto((v) => (v === id ? null : id))}
                onIr={onIr}
              />
            ) : (
              <FilaAviso key={fila.aviso.id} aviso={fila.aviso} onIr={onIr} />
            ),
          )}
        </ul>
      )}
      {incompletos.length > 0 && (
        <ul className="border-t border-[var(--rule-base)] bg-[var(--surface-sunken)]/50 px-2 py-2">
          {incompletos.map((g) => {
            const meta = CATEGORIA_META[g.categoria];
            const nivel = filtros.nivel === "todos" ? "" : ` ${NIVEL_META[filtros.nivel].etiqueta.toLowerCase()}`;
            return (
              <li key={g.categoria} className="flex items-center gap-2 px-2 text-xs text-[var(--text-secondary)]">
                <meta.icon className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                <span className="min-w-0 truncate">
                  {meta.etiqueta}: se ven {g.enLista} de {g.total}
                  {nivel && <span className="hidden sm:inline"> ({nivel.trim()})</span>}
                </span>
                <span className="flex-1" />
                <Link href={data.buckets[g.categoria].href} onClick={onIr} className={ENLACE}>
                  Ver los {g.total}
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
