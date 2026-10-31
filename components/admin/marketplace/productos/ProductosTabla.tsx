"use client";

import { useRef } from "react";
import { DataTable } from "@buleje/design-system";
import { ExternalLink, Eye, EyeOff, ImageOff, Megaphone, MoreHorizontal, Pencil, Sparkles, Tag, Users, X } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import type { MarketplaceProduct } from "@/components/admin/marketplace/hooks/use-marketplace-products";
import { STOCK_CRITICO, type ProductosVista, type useEdicionPrecio } from "@/components/admin/marketplace/hooks/use-productos-vista";
import { useOrdenDeVista, useSoltarSeleccionOculta } from "@/components/admin/marketplace/orden-de-vista";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { CompetitionChip, OfertaCell, PriceCell } from "@/components/admin/marketplace/productos/celdas-precio";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Casilla } from "@/components/ui-system/Casilla";

const TH = "px-3 py-3 text-sm font-semibold text-[var(--text-secondary)]";

/* Filtros de columna con rango. Estado, stock bajo y categoría ya tienen sus selectores arriba. */
const COLUMNAS: readonly ColumnaFiltro<MarketplaceProduct>[] = [
  { id: "precio", label: "Precio", tipo: "rango", numero: (p) => p.retailPrice, unidad: "S/", paso: 0.01 },
  { id: "mayorista", label: "Mayorista", tipo: "rango", numero: (p) => (p.wholesalePrice > 0 ? p.wholesalePrice : null), unidad: "S/", paso: 0.01 },
  { id: "stock", label: "Stock", tipo: "rango", numero: (p) => p.stock },
];

/** Publicar/Despublicar a la vista (48 px) y en «⋯» destacar y ver en el marketplace. */
function AccionesProducto({
  p, publicando, slug, onPublicar, onDestacar, onPrecio, onQuitarOferta,
}: {
  p: MarketplaceProduct; publicando: boolean; slug: string; onPublicar: () => void; onDestacar: () => void;
  onPrecio: (campo: "retailPrice" | "discountPrice" | "wholesalePrice") => void; onQuitarOferta: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const enfocarMenu = () => ref.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus({ preventScroll: true });
  const base: MenuAccion[] = [
    { id: "precio", label: "Cambiar el precio", icon: Pencil, onSelect: () => onPrecio("retailPrice") },
    { id: "oferta", label: p.discountPrice != null ? "Cambiar la oferta" : "Poner en oferta", icon: Tag, onSelect: () => onPrecio("discountPrice") },
    ...(p.discountPrice != null ? [{ id: "quitar-oferta", label: "Quitar la oferta", icon: X, onSelect: onQuitarOferta }] : []),
    { id: "mayorista", label: p.wholesalePrice > 0 ? "Cambiar el precio mayorista" : "Poner precio mayorista", icon: Users, onSelect: () => onPrecio("wholesalePrice") },
    ...(p.boost
      ? [{ id: "boost", label: "Ver el destacado", hint: `S/ ${p.boost.bidAmount} por día · gastado ${formatCurrency(p.boost.totalSpentPen)} de S/ ${p.boost.maxBudgetPen.toFixed(0)}`, icon: Sparkles, onSelect: onDestacar }]
      : p.isActive && p.productId
        ? [{ id: "destacar", label: "Destacar en el marketplace", hint: "Aparece primero en búsquedas, con un tope de gasto", icon: Megaphone, onSelect: onDestacar }]
        : []),
    ...(p.isActive && slug
      ? [{ id: "ver", label: "Ver en el marketplace", hint: "Tu tienda pública, en otra pestaña", icon: ExternalLink, onSelect: () => window.open(`/marketplace/${slug}#producto-${p.id}`, "_blank", "noopener,noreferrer") }]
      : []),
  ];
  const acciones = base.map((a) => ({ ...a, onSelect: () => { enfocarMenu(); a.onSelect(); } }));
  return (
    <div ref={ref} className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={onPublicar}
        disabled={publicando}
        aria-pressed={p.isActive}
        aria-label={`${p.isActive ? "Publicado" : "Inactivo"} en el marketplace: ${p.name}`}
        title={p.isActive ? "Publicado: tócalo para sacarlo del marketplace" : "Inactivo: tócalo para publicarlo"}
        className={cn(
          "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-60",
          p.isActive
            ? "bg-[var(--data-success-500)]/10 text-[var(--data-success-ink)] hover:bg-[var(--data-success-500)]/20"
            : "border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
        )}
      >
        {publicando ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
        ) : p.isActive ? (
          <Eye className="h-5 w-5" aria-hidden />
        ) : (
          <EyeOff className="h-5 w-5" aria-hidden />
        )}
      </button>
      {p.boost && <Sparkles className="h-4 w-4 shrink-0 text-[var(--brand-secondary)]" aria-label="Destacado" />}
      {acciones.length > 0 ? (
        <ActionMenu
          label={`Más acciones de ${p.name}`}
          title="Precios, destacar y ver en el marketplace"
          icon={MoreHorizontal}
          actions={acciones}
          soloIcono
          size="md"
          className={cn("w-12 shrink-0", "border-transparent! bg-transparent! hover:bg-[var(--surface-sunken)]!")}
        />
      ) : (
        <span className="inline-block w-12 shrink-0" aria-hidden />
      )}
    </div>
  );
}

/** Un producto por fila. En el celular la tabla pasa a tarjetas (`useMobileTableCards`). */
export function ProductosTabla({
  v, precio, pricingId, toggling, slug, onPublicar, onQuitarOferta, onDestacar,
}: {
  v: ProductosVista;
  precio: ReturnType<typeof useEdicionPrecio>;
  pricingId: string | null;
  toggling: string | null;
  slug: string;
  onPublicar: (p: MarketplaceProduct) => void;
  onQuitarOferta: (id: string) => void;
  onDestacar: (p: MarketplaceProduct) => void;
}) {
  const f = useFiltrosTabla(v.filtrados, COLUMNAS);
  const filas = f.filtradas;
  const orden = useOrdenDeVista(v.sortKey, v.sortDir, v.ordenarPor);
  useSoltarSeleccionOculta(f.activos > 0, filas, v.seleccion, v.setSeleccion);
  const todos = filas.length > 0 && filas.every((p) => v.seleccion.has(p.id));
  const algunos = filas.some((p) => v.seleccion.has(p.id));
  const alternarTodos = () => {
    const next = new Set(v.seleccion);
    for (const p of filas) {
      if (todos) next.delete(p.id);
      else next.add(p.id);
    }
    v.setSeleccion(next);
  };
  return (
    <>
    <BarraFiltrosTabla excel="Productos del marketplace" vistas="marketplace-productos" f={f} />
    <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="max-h-[calc(100vh-20rem)] overflow-x-auto">
        <DataTable className="w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-12" data-label="Elegir">
                <Casilla
                  checked={todos}
                  ref={(el) => {
                    if (el) el.indeterminate = !todos && algunos;
                  }}
                  onChange={alternarTodos}
                  aria-label="Elegir todos los productos de la lista" />
              </th>
              <ThColumna label="Producto" orden={orden} ordenId="name" />
              <ThColumna label="Precio" ids={["precio"]} f={f} derecha orden={orden} ordenId="retailPrice" />
              <th className={cn(TH, "text-right")}>Oferta</th>
              <ThColumna label="Mayorista" ids={["mayorista"]} f={f} derecha orden={orden} ordenId="wholesalePrice" className="hidden lg:table-cell" />
              <ThColumna label="Stock" ids={["stock"]} f={f} derecha orden={orden} ordenId="stock" />
              <th className={cn(TH, "text-right")}>En el marketplace</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)]">
            {filas.length === 0 && <SinCoincidenciasFila colSpan={7} />}
            {filas.map((p) => {
              const elegido = v.seleccion.has(p.id);
              const tono = p.stock <= 0 ? "error" : p.stock <= STOCK_CRITICO ? "warning" : "success";
              const ocupado = pricingId === p.id;
              return (
                <tr key={p.id} className={cn("", elegido ? "bg-primary/10" : "hover:bg-[var(--surface-sunken)]/50")}>
                  <td>
                    <Casilla
                      checked={elegido}
                      onChange={() => v.alternar(p.id)}
                      aria-label={`Elegir ${p.name}`} />
                  </td>
                  <td>
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-sunken)]">
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[var(--text-tertiary)]">
                            <ImageOff className="h-4 w-4 opacity-50" aria-hidden />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[var(--text-primary)]">{p.name}</p>
                        <p className="truncate text-sm text-[var(--text-tertiary)]">
                          <span className="font-mono">{p.sku || "—"}</span>
                          {p.category && <span className="capitalize text-[var(--text-secondary)]"> · {p.category}</span>}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="text-right">
                    <div className="flex flex-col items-end">
                      <PriceCell value={p.retailPrice} busy={ocupado} onStartEdit={() => precio.empezar(p.id, "retailPrice", p.retailPrice)} {...precio.celda(p.id, "retailPrice")} alwaysBold />
                      <CompetitionChip myPrice={p.retailPrice} avg={p.competitionAvgPrice ?? null} count={p.competitionStoreCount ?? 0} />
                    </div>
                  </td>
                  {/* El precio que se cobra sale de `precioVigente()`: una oferta vencida NO se aplica. */}
                  <td className="text-right">
                    <OfertaCell
                      lista={p.retailPrice}
                      oferta={p.discountPrice ?? null}
                      hasta={p.discountUntil ?? null}
                      busy={ocupado}
                      onStartEdit={() => precio.empezar(p.id, "discountPrice", p.discountPrice ?? null)}
                      onQuitar={() => onQuitarOferta(p.id)}
                      {...precio.celda(p.id, "discountPrice")}
                    />
                  </td>
                  <td className="hidden text-right lg:table-cell">
                    <PriceCell value={p.wholesalePrice} busy={ocupado} onStartEdit={() => precio.empezar(p.id, "wholesalePrice", p.wholesalePrice)} {...precio.celda(p.id, "wholesalePrice")} />
                  </td>
                  <td className="text-right">
                    <span
                      title={p.stock <= 0 && p.isActive ? "Sin stock: los clientes no pueden comprarlo" : undefined}
                      className={cn(
                        "inline-flex h-7 min-w-[2.75rem] items-center justify-center rounded-full px-2 text-sm font-bold tabular-nums",
                        tono === "success" && "bg-[var(--data-success-500)]/10 text-[var(--data-success-ink)]",
                        tono === "warning" && "bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)]",
                        tono === "error" && "bg-[var(--data-error-500)]/10 text-[var(--data-error-ink)]",
                      )}
                    >
                      {p.stock}
                    </span>
                  </td>
                  <td>
                    <AccionesProducto p={p} publicando={toggling === p.id} slug={slug} onPublicar={() => onPublicar(p)} onDestacar={() => onDestacar(p)}
                      onPrecio={(campo) => precio.empezar(p.id, campo, campo === "retailPrice" ? p.retailPrice : campo === "discountPrice" ? (p.discountPrice ?? null) : p.wholesalePrice)}
                      onQuitarOferta={() => onQuitarOferta(p.id)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </div>
    </div>
    </>
  );
}
