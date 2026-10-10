"use client";

/**
 * Pedidos y reparto › Archivados (`?vista=archivados`): los entregados y los
 * cancelados. Lo que la Lista no hace (ella mira lo que está en marcha): las
 * secciones Todos / Entregados / Cancelados, las cifras del período en
 * «Indicadores» (entregado, ticket promedio, tasa de cancelados) y buscar por
 * cliente o teléfono y por fechas, todo en una fila encima de la tabla.
 *
 * El desplegable de fecha es el MISMO de la barra del tablero (un solo filtro
 * de fecha en el panel); qué pedidos pasan lo decide `archivadosQuePasan`
 * (día de Lima, con prueba).
 */
import { useState } from "react";
import { Search, Archive } from "@buleje/design-system/icons";
import { EmptyState } from "@/components/admin/EmptyState";
import { BarraDeSecciones } from "@/components/admin/shared/BarraDeSecciones";
import { FiltroColumnaRango } from "@/components/admin/shared/filtros-columna";
import type { Rango } from "@/lib/admin/filtros-columna";
import { cn } from "@/lib/utils";
import type { DbOrder, OrderStatus } from "@/lib/jsondb";
import { DESPLEGABLES_A_LA_ALTURA } from "./BarraPedidos";
import { archivadosQuePasan } from "./filtrar-pedidos";
import { cifrasDeArchivados } from "./cifras-archivados";
import { useIndicadoresArchivados } from "./use-indicadores-archivados";
import { TablaArchivados } from "./TablaArchivados";

interface OrdersArchiveProps {
  archivedOrders: DbOrder[];
  onSelectOrder: (order: DbOrder) => void;
  onDeleteOrder: (id: string) => void;
}

type Seccion = "todos" | "entregados" | "cancelados";
const ESTADO_DE: Record<Seccion, OrderStatus | null> = { todos: null, entregados: "entregado", cancelados: "cancelado" };
const ID_PANEL = "archivados-panel";

const CAMPO =
  "h-12 rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] outline-none focus:border-primary";

export function OrdersArchive({ archivedOrders, onSelectOrder, onDeleteOrder }: OrdersArchiveProps) {
  const [archiveSearch, setArchiveSearch] = useState("");
  const [rango, setRango] = useState<Rango<string>>({ min: null, max: null });
  const [seccion, setSeccion] = useState<Seccion>("todos");

  /* Las cifras y los conteos de las secciones miran cliente y fechas; la sección sólo recorta la tabla. */
  const delPeriodo = archivadosQuePasan(archivedOrders, { texto: archiveSearch, desde: rango.min, hasta: rango.max });
  const cifras = cifrasDeArchivados(delPeriodo);
  const estado = ESTADO_DE[seccion];
  const visibles = estado ? delPeriodo.filter((o) => o.status === estado) : delPeriodo;
  const indicadores = useIndicadoresArchivados(cifras);

  const secciones = [
    { clave: "todos" as const, rotulo: `Todos · ${delPeriodo.length}` },
    { clave: "entregados" as const, rotulo: `Entregados · ${cifras.entregados}` },
    { clave: "cancelados" as const, rotulo: `Cancelados · ${cifras.cancelados}` },
  ];

  return (
    <div className="space-y-3">
      <div className={cn("flex flex-wrap items-center gap-2", DESPLEGABLES_A_LA_ALTURA)}>
        <BarraDeSecciones secciones={secciones} activa={seccion} onCambiar={setSeccion} etiqueta="Secciones de Archivados" idPanel={ID_PANEL} />
        <div role="search" aria-label="Filtrar archivados" className="flex flex-[1_1_28rem] flex-wrap items-center gap-2">
          <div className="relative flex-[1_1_11rem]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
            <input
              type="search"
              placeholder="Buscar cliente o teléfono…"
              aria-label="Buscar archivados por cliente o teléfono"
              value={archiveSearch}
              onChange={(e) => setArchiveSearch(e.target.value)}
              className={cn(CAMPO, "w-full pl-9 pr-3")}
            />
          </div>
          <FiltroColumnaRango
            label="Fecha"
            esFecha
            placeholder="Fecha"
            valor={rango}
            onChange={(r) => setRango({ min: (r.min as string | null) ?? null, max: (r.max as string | null) ?? null })}
          />
          {indicadores.boton}
        </div>
      </div>

      {indicadores.panel}

      <div id={ID_PANEL} role="tabpanel" aria-label={secciones.find((s) => s.clave === seccion)?.rotulo} className="min-w-0">
        {visibles.length === 0 ? (
          <EmptyState
            icon={<Archive className="h-10 w-10 text-[var(--text-tertiary)]" />}
            title={
              archivedOrders.length === 0
                ? "Todavía no hay pedidos entregados ni cancelados"
                : "No encontramos pedidos con esa búsqueda"
            }
            actions={[]}
          />
        ) : (
          <TablaArchivados pedidos={visibles} onSelectOrder={onSelectOrder} onDeleteOrder={onDeleteOrder} />
        )}
      </div>
    </div>
  );
}
