"use client";

/**
 * Productos del Marketplace (`?tab=marketplace&vista=productos`) con el patrón
 * del panel (11-10): una fila de filtros pegada a la tabla (buscador · estado ·
 * mostrar · categoría · Indicadores), un producto por fila con
 * Publicar/Despublicar a la vista y lo demás en «⋯». Los precios se siguen
 * editando en la celda; destacar abre su ventana; «Sincronizar» va al «⋯ Más».
 */

import { useState } from "react";
import { AlertCircle, CheckCircle, Eye, EyeOff, Package, RefreshCw, Search, X } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { useAccionesDeVista } from "@/components/admin/marketplace/acciones-de-vista";
import { button } from "@/components/ui-system/button-variants";
import { useMarketplaceProducts, type MarketplaceProduct } from "@/components/admin/marketplace/hooks/use-marketplace-products";
import { useMarketplaceTienda } from "@/components/admin/marketplace/hooks/use-marketplace-tienda";
import { useEdicionPrecio, useProductosVista, type FiltroPublicado, type FiltroStock, type ProductosVista } from "@/components/admin/marketplace/hooks/use-productos-vista";
import { BuscadorEnFila, CAMPO_EN_FILA, CounterChip, TableSkeleton } from "@/components/admin/marketplace/shared";
import { BoostModal } from "@/components/admin/marketplace/productos/BoostModal";
import { ProductosTabla } from "@/components/admin/marketplace/productos/ProductosTabla";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";

function useIndicadoresProductos(v: ProductosVista, cargando: boolean) {
  const { publicados, inactivos, critico, sinStock } = v.conteos;
  const porEstado = (f: FiltroPublicado) => () => { v.setPublicado(v.publicado === f ? "todos" : f); v.setStock("todos"); };
  const porStock = (f: FiltroStock) => () => { v.setStock(v.stock === f ? "todos" : f); v.setPublicado("todos"); };
  return useKpisPlegables({
    claveMemoria: "marketplace-productos",
    alto: "md",
    compactoEnMovil: true,
    sinDatosAun: cargando,
    filtrosActivos: (v.publicado !== "todos" ? 1 : 0) + (v.stock !== "todos" ? 1 : 0),
    resumen: `${sinStock} sin stock`,
    tarjetas: [
      <CounterChip key="pub" label="Publicados" value={publicados} tone="success" active={v.publicado === "publicados"} onClick={porEstado("publicados")} />,
      <CounterChip key="ina" label="Inactivos" value={inactivos} tone="neutral" active={v.publicado === "inactivos"} onClick={porEstado("inactivos")} />,
      <CounterChip key="cri" label="Stock crítico" value={critico} tone="warning" active={v.stock === "critico"} onClick={porStock("critico")} />,
      <CounterChip key="sin" label="Sin stock" value={sinStock} tone="danger" active={v.stock === "sin-stock"} onClick={porStock("sin-stock")} />,
    ],
  });
}

export function MarketplaceProductosTab() {
  const {
    products, loading, error, toggling, syncing, syncResult, bulkBusy, pricingId,
    load, handleSync, toggleActive, bulkSetActive, updatePrice, updateOferta, createBoost, stopBoost,
  } = useMarketplaceProducts();
  const { store } = useMarketplaceTienda();
  const storeId = store.id ?? "";
  const v = useProductosVista(products);
  const precio = useEdicionPrecio(updatePrice, updateOferta);
  const kpis = useIndicadoresProductos(v, loading);
  const [destacando, setDestacando] = useState<MarketplaceProduct | null>(null);
  useAccionesDeVista([
    { id: "sync", label: syncing ? "Sincronizando…" : "Sincronizar inventario", hint: "Trae los productos nuevos de tu inventario y saca los que diste de baja", icon: RefreshCw, disabled: syncing, onSelect: () => void handleSync() },
  ]);
  const mostrar = v.publicado !== "todos" ? v.publicado : v.stock === "critico" || v.stock === "sin-stock" ? v.stock : "todos";
  const elegirMostrar = (valor: string) => {
    v.setPublicado(valor === "publicados" || valor === "inactivos" ? valor : "todos");
    v.setStock(valor === "critico" || valor === "sin-stock" ? valor : "todos");
  };

  if (loading) return <TableSkeleton />;

  async function enLote(isActive: boolean) {
    const r = await bulkSetActive(Array.from(v.seleccion), isActive);
    if (r.ok) v.setSeleccion(new Set());
  }

  const elegidos = v.seleccion.size;

  return (
    <div className="space-y-3">
      {/* Una fila: ⓘ · buscador · mostrar · categoría · Indicadores. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="hidden h-12 w-8 shrink-0 items-center justify-center sm:inline-flex">
          <InfoTip title="Productos en el marketplace" what="Qué productos de tu inventario se ven en el marketplace y a qué precio. Toca un precio para cambiarlo ahí mismo." affects="«Sincronizar» trae los nuevos de tu inventario y saca los que diste de baja. Publicar o sacar uno no toca tu stock." example="Arroz 5 kg a S/ 24 con oferta S/ 21,90 (-9 %) y «12 % caro» = está sobre el promedio de otras tiendas." side="bottom" />
        </span>
        <BuscadorEnFila valor={v.query} onCambiar={v.setQuery} placeholder="Buscar por nombre, SKU o categoría" className="sm:basis-48" />
        {/* Publicado y stock en UN select: las tarjetas ya los usaban como excluyentes (tocar una limpia la otra). */}
        <select value={mostrar} onChange={(e) => elegirMostrar(e.target.value)} aria-label="Mostrar" className={cn(CAMPO_EN_FILA, "min-w-0 flex-1 px-3 sm:flex-none sm:shrink-0")}>
          <option value="todos">Todos los productos</option>
          <option value="publicados">Publicados</option>
          <option value="inactivos">Inactivos</option>
          <option value="critico">Stock crítico</option>
          <option value="sin-stock">Sin stock</option>
        </select>
        {v.categorias.length > 0 && (
          <select value={v.categoria} onChange={(e) => v.setCategoria(e.target.value)} aria-label="Categoría" className={cn(CAMPO_EN_FILA, "min-w-0 flex-1 px-3 sm:max-w-[12rem] sm:flex-none sm:shrink-0")}>
            <option value="todos">Todas las categorías</option>
            {v.categorias.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {kpis.boton}
        </div>
      </div>
      {kpis.panel}

      {elegidos > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--accent)]/40 bg-primary/10 p-2 pl-3">
          <p className="text-sm font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]">
            {elegidos} elegido{elegidos !== 1 ? "s" : ""}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => void enLote(true)} disabled={bulkBusy} className="inline-flex h-12 items-center gap-1.5 rounded-xl bg-[var(--data-success-500)]/15 px-3 text-sm font-semibold text-[var(--data-success-ink)] hover:bg-[var(--data-success-500)]/25 disabled:opacity-60">
              <Eye className="h-4 w-4" aria-hidden /> Publicar
            </button>
            <button type="button" onClick={() => void enLote(false)} disabled={bulkBusy} className="inline-flex h-12 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-60">
              <EyeOff className="h-4 w-4" aria-hidden /> Despublicar
            </button>
            <button type="button" onClick={() => v.setSeleccion(new Set())} className="inline-flex h-12 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]">
              <X className="h-4 w-4" aria-hidden /> Soltar
            </button>
          </div>
        </div>
      )}

      {syncResult && (
        <p className="flex items-center gap-2 rounded-xl border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/10 p-3 text-sm font-semibold text-[var(--data-success-ink)]" role="status">
          <CheckCircle className="h-4 w-4 shrink-0" aria-hidden /> Sincronizado: {syncResult}
        </p>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/10 p-2 pl-3 text-sm font-semibold text-[var(--data-error-ink)]">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {error}
          <button type="button" onClick={load} className="ml-auto h-12 rounded-xl px-3 underline">Reintentar</button>
        </div>
      )}

      {products.length === 0 && !error ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] py-12 text-[var(--text-tertiary)]">
          <Package className="h-8 w-8 opacity-40" aria-hidden />
          <p className="text-sm font-semibold">Todavía no publicaste productos: trae los de tu inventario.</p>
          <button type="button" onClick={handleSync} disabled={syncing} className={button({ variant: "primary", className: "h-12 gap-2 rounded-xl px-4" })}>
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} aria-hidden />
            {syncing ? "Sincronizando…" : "Sincronizar inventario"}
          </button>
        </div>
      ) : v.filtrados.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] py-10 text-[var(--text-tertiary)]">
          <Search className="h-6 w-6 opacity-40" aria-hidden />
          <p className="text-sm font-semibold">Ningún producto con esos filtros.</p>
          <button type="button" onClick={v.limpiar} className="h-12 px-3 text-sm font-semibold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
            Ver todos
          </button>
        </div>
      ) : (
        <>
          <ProductosTabla
            v={v}
            precio={precio}
            pricingId={pricingId}
            toggling={toggling}
            slug={store.slug}
            onPublicar={(p) => void toggleActive(p)}
            onQuitarOferta={(id) => void updateOferta(id, { discountPrice: null })}
            onDestacar={setDestacando}
          />
          {v.filtrados.length < products.length && (
            <div className="flex items-center justify-between gap-2 text-sm text-[var(--text-secondary)]">
              <span>
                <strong className="tabular-nums">{v.filtrados.length}</strong> de <strong className="tabular-nums">{products.length}</strong> productos
              </span>
              <button type="button" onClick={v.limpiar} className="h-12 px-3 font-semibold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
                Ver todos
              </button>
            </div>
          )}
        </>
      )}

      {destacando && (
        <BoostModal
          product={destacando}
          storeId={storeId}
          onClose={() => setDestacando(null)}
          onCreate={async (payload) => {
            if (!destacando.productId) return { ok: false };
            const r = await createBoost(destacando.productId, storeId, payload);
            if (r.ok) setDestacando(null);
            return r;
          }}
          onStop={async () => {
            if (!destacando.boost) return { ok: false };
            const r = await stopBoost(destacando.boost.id);
            if (r.ok) setDestacando(null);
            return r;
          }}
        />
      )}
    </div>
  );
}
