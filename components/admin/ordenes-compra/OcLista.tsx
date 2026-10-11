"use client";

import { DataTable } from "@buleje/design-system";
import { ChevronLeft, ChevronRight, ArrowDown, ArrowUp, ArrowUpDown } from "@buleje/design-system/icons";
import { POR_PAGINA, type OrdenDeLista } from "@/hooks/use-filtros-ordenes-compra";
import TableSkeleton from "@/components/admin/shared/TableSkeleton";
import { button } from "@/components/ui-system/button-variants";
import type { OrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";
import OcFilaOrden from "@/components/admin/ordenes-compra/OcFilaOrden";

type Columna = "proveedor" | "fecha" | "total";

/** Qué orden pone cada título y cuál es el segundo clic (fecha y total van y vuelven). */
const ORDEN_DE: Record<Columna, { primero: OrdenDeLista; segundo?: OrdenDeLista }> = {
  proveedor: { primero: "proveedor" },
  fecha: { primero: "reciente", segundo: "antigua" },
  total: { primero: "mayor-monto", segundo: "menor-monto" },
};

function sentidoDe(c: Columna, orden: OrdenDeLista): "ascending" | "descending" | undefined {
  if (c === "proveedor") return orden === "proveedor" ? "ascending" : undefined;
  if (c === "fecha") return orden === "reciente" ? "descending" : orden === "antigua" ? "ascending" : undefined;
  return orden === "mayor-monto" ? "descending" : orden === "menor-monto" ? "ascending" : undefined;
}

/** Título que ordena la tabla al tocarlo (`aria-sort` dice cómo está). */
function TituloOrdenable({ c, rotulo, derecha, orden, onOrdenar }: {
  c: Columna; rotulo: string; derecha?: boolean; orden: OrdenDeLista; onOrdenar: (c: Columna) => void;
}) {
  const s = sentidoDe(c, orden);
  const Icono = s === "ascending" ? ArrowUp : s === "descending" ? ArrowDown : ArrowUpDown;
  return (
    <th aria-sort={s ?? "none"} className={derecha ? "text-right" : undefined} data-label={rotulo}>
      <button
        type="button"
        onClick={() => onOrdenar(c)}
        className={`inline-flex h-12 items-center gap-1 font-semibold hover:text-[var(--text-primary)] ${derecha ? "flex-row-reverse" : ""}`}
      >
        {rotulo}
        <Icono className={`h-3.5 w-3.5 ${s ? "text-[var(--text-primary)]" : "opacity-40"}`} aria-hidden />
      </button>
    </th>
  );
}

/**
 * La lista de órdenes como TABLA (a 400 px se vuelve tarjetas sola, por
 * `useMobileTableCards`), con su paginado y sus estados de carga y vacío. El
 * orden se elige en los títulos de la tabla: antes era un select más en la fila
 * de filtros. Pieza de PurchaseOrdersTab: recibe `useOrdenesCompra` entero.
 */
export default function OcLista({ oc }: { oc: OrdenesCompra }) {
  const { loading, expanded, setShowCreate, suppliers, f, filteredOrders, orders } = oc;

  if (loading) {
    return <TableSkeleton rows={6} cols={5} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]" />;
  }
  if (filteredOrders.length === 0) {
    /* Buscar sin resultados no es lo mismo que no tener órdenes: ofrecer «crear la primera» desorienta. */
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-10 text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          {f.hayFiltros ? "Ninguna orden coincide con los filtros." : "Todavía no hay órdenes de compra."}
        </p>
        <button
          type="button"
          onClick={f.hayFiltros ? f.limpiar : () => setShowCreate(true)}
          className={button({ variant: "secondary", className: "rounded-xl" })}
        >
          {f.hayFiltros ? "Limpiar filtros" : "Crear la primera orden"}
        </button>
      </div>
    );
  }

  const ordenar = (c: Columna) => {
    const { primero, segundo } = ORDEN_DE[c];
    f.setOrden(f.orden === primero && segundo ? segundo : primero);
  };
  const filtradas = f.filtradas.length;
  const cuenta = f.totalPaginas > 1
    ? `${(f.pagina - 1) * POR_PAGINA + 1}–${Math.min(f.pagina * POR_PAGINA, filtradas)} de ${filtradas}${f.hayFiltros ? ` (filtradas de ${orders.length})` : " órdenes"}`
    : `${filtradas} de ${orders.length} órdenes`;

  return (
    <div className="space-y-3">
      {/* Encabezados a 14 px y sin versalitas: el DataTable los trae a 12. */}
      <DataTable className="[&_thead_th]:py-0 [&_thead_th]:text-sm [&_thead_th]:normal-case [&_thead_th]:tracking-normal">
        <thead>
          <tr>
            <TituloOrdenable c="proveedor" rotulo="Proveedor" orden={f.orden} onOrdenar={ordenar} />
            <TituloOrdenable c="fecha" rotulo="Pedida" orden={f.orden} onOrdenar={ordenar} />
            <TituloOrdenable c="total" rotulo="Total" derecha orden={f.orden} onOrdenar={ordenar} />
            <th>Estado</th>
            <th className="text-right"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {filteredOrders.map((o) => (
            <OcFilaOrden key={o.id} oc={oc} o={o} supplier={suppliers.find((s) => s.id === o.supplierId)} isExpanded={expanded === o.id} />
          ))}
        </tbody>
      </DataTable>

      {(f.totalPaginas > 1 || f.hayFiltros) && (
        <nav aria-label="Páginas de órdenes" className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-[var(--text-secondary)]">{cuenta}</p>
          {f.totalPaginas > 1 && (
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Página anterior" disabled={f.pagina <= 1} onClick={() => f.setPagina(f.pagina - 1)} className={button({ variant: "ghost", className: "w-12 rounded-xl px-0" })}>
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <span className="px-1 text-sm font-semibold tabular-nums text-[var(--text-primary)]">{f.pagina} / {f.totalPaginas}</span>
              <button type="button" aria-label="Página siguiente" disabled={f.pagina >= f.totalPaginas} onClick={() => f.setPagina(f.pagina + 1)} className={button({ variant: "ghost", className: "w-12 rounded-xl px-0" })}>
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}
        </nav>
      )}
    </div>
  );
}
