"use client";

/**
 * /marketplace/para-vos — «Para ti»: destacados de las tiendas publicadas
 * (sort=popular = calificación + reparto por tienda + con foto; NO son pedidos).
 *
 * Datos REALES del catálogo público (sort=popular, mezclado por tienda), con
 * la tarjeta canónica del marketplace: agrega al carrito de verdad o abre la
 * ficha si el producto pide elegir algo. Antes era un mock con tiendas que no
 * existen y un «Agregar» que solo decía «— demo» (09-10).
 */

import Link from "next/link";
import { EmptyState } from "@buleje/design-system";
import { ArrowLeft, Sparkles, ShoppingBag } from "@buleje/design-system/icons";
import UnifiedProductCard from "@/components/marketplace/UnifiedProductCard";
import { Kicker } from "@/components/ui-system/Kicker";
import { useParaTi } from "./use-para-ti";

const GRID = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3";

export default function ParaVosPage() {
  const { items, cargando, error, hayMas, cargarMas, reintentar } = useParaTi();
  const vacio = !cargando && !error && items.length === 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-28">
      <div className="mb-5">
        <Link
          href="/marketplace"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Volver al marketplace
        </Link>
        <div className="mt-3 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[var(--accent)]" strokeWidth={2} aria-hidden />
          <Kicker className="text-[var(--accent-dark)] dark:text-[var(--accent)]">Para ti</Kicker>
        </div>
        <h1 className="mt-1 text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
          Destacados de las tiendas
        </h1>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-[var(--data-error)] bg-[var(--data-error-50)] px-4 py-3 text-base text-[var(--data-error)]"
        >
          No pudimos traer los productos.
          <button
            type="button"
            onClick={reintentar}
            className="h-11 px-4 rounded-xl border-2 border-[var(--data-error)] font-semibold hover:bg-[var(--surface-raised)]"
          >
            Reintentar
          </button>
        </div>
      )}

      {vacio && (
        <EmptyState
          icon={ShoppingBag}
          title="Todavía no hay productos publicados"
          description="Cuando las tiendas del marketplace suban productos con stock, los vas a ver aquí."
        />
      )}

      {items.length > 0 && (
        <ul className={GRID} aria-label="Productos destacados">
          {items.map((p, i) => (
            <li key={p.storeProductId}>
              <UnifiedProductCard product={p} href={p.href} layout="compact" index={i} aboveFold={i < 4} />
            </li>
          ))}
        </ul>
      )}

      {cargando && (
        <p role="status" className="mt-6 text-center text-base text-[var(--text-secondary)]">
          Cargando productos…
        </p>
      )}

      {!cargando && hayMas && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={cargarMas}
            className="h-12 px-6 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-semibold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            Ver más productos
          </button>
        </div>
      )}
    </div>
  );
}
