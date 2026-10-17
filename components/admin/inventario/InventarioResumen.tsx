"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Package, Wallet } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { fmt } from "@/components/admin/inventario/inventario-compartido";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

interface Tarjeta {
  rotulo: string;
  valor: string;
  detalle: string;
  icono: typeof Package;
  aviso?: boolean;
  ayuda?: ReactNode;
}

/**
 * Los indicadores de Productos y stock con el patrón del panel (10-10): un
 * botón «Indicadores» en la cabecera que, plegado, lleva el valor del
 * inventario adentro. Antes eran 4 tarjetas grandes siempre abiertas y el
 * margen por categoría plegado en otra fila.
 *
 * «Próx. a vencer» ya no está: repetía Vencimientos (la pestaña de al lado,
 * que lo cuenta por LOTE —el de acá contaba productos—, con sus urgencias y
 * la baja por vencimiento). La columna «Vence» y su filtro siguen en la tabla.
 */
export function useIndicadoresInventario(inv: Inventario) {
  const { totalProducts, activeProducts, lowStockCount, totalStockValue, loading } = inv;
  const inactivos = totalProducts - activeProducts;
  const tarjetas: Tarjeta[] = [
    {
      rotulo: "Productos",
      valor: String(totalProducts),
      detalle: `${activeProducts} activos${inactivos > 0 ? ` · ${inactivos} inactivo${inactivos === 1 ? "" : "s"}` : ""}`,
      icono: Package,
    },
    {
      rotulo: "Bajo stock",
      valor: String(lowStockCount),
      detalle: lowStockCount > 0 ? "Por reponer" : "Stock saludable",
      icono: AlertTriangle,
      aviso: lowStockCount > 0,
      ayuda: "Productos activos con stock en su mínimo o debajo (si no le pusiste mínimo, cuenta desde 5).",
    },
    {
      rotulo: "Valor del inventario",
      valor: fmt(totalStockValue),
      detalle: "A costo",
      icono: Wallet,
      ayuda: "Stock × costo de cada producto. Los que no tienen costo no suman: complétalo en «⋯ › Más columnas».",
    },
  ];
  return useKpisPlegables({
    claveMemoria: "inventario-stock",
    alto: "md",
    compactoEnMovil: true,
    sinDatosAun: loading,
    resumen: `${fmt(totalStockValue)} a costo`,
    tarjetas: tarjetas.map(({ rotulo, valor, detalle, icono: Icono, aviso, ayuda }) => (
      <div key={rotulo} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
            <Icono className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
          {ayuda && <InfoTip what={ayuda} />}
        </div>
        <p className={cn("text-lg font-extrabold tabular-nums", aviso ? "text-[var(--data-warning-ink)]" : "text-[var(--text-primary)]")}>
          {valor}
        </p>
        <p className="text-sm text-[var(--text-secondary)]">{detalle}</p>
      </div>
    )),
  });
}

/** Tono del margen: verde > 25 %, ámbar 15-25 %, rojo < 15 % (los cortes de siempre). */
const tonoMargen = (m: number) =>
  m > 25
    ? "border-[var(--data-success-500)]/40 text-[var(--data-success-ink)]"
    : m >= 15
      ? "border-[var(--data-warning-500)]/40 text-[var(--data-warning-ink)]"
      : "border-[var(--data-error-500)]/40 text-[var(--data-error-ink)]";

/**
 * El margen por categoría, debajo de las tarjetas cuando los indicadores están
 * abiertos (antes, un «› Margen por categoría (8)» plegado aparte). Con el
 * nombre de la categoría, no su clave («abarrotes» → «Abarrotes»).
 */
export function MargenPorCategoria({ inv }: { inv: Inventario }) {
  const { categoryMargins, catLabelOf } = inv;
  if (categoryMargins.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2">
      <span className="text-sm font-semibold text-[var(--text-secondary)]">Margen por categoría</span>
      <InfoTip
        what="Margen promedio de los productos activos con costo, en las categorías con 3 o más."
        example="Precio S/ 10 y costo S/ 7 = 30 %. Verde más de 25 %, ámbar de 15 a 25 %, rojo menos de 15 %."
      />
      {categoryMargins.map((cm) => (
        <span key={cm.cat} className={cn("rounded-full border px-2.5 py-0.5 text-sm font-semibold tabular-nums", tonoMargen(cm.margin))}>
          {catLabelOf(cm.cat)} {Number(cm.margin).toFixed(0)} %
        </span>
      ))}
    </div>
  );
}

/** Posibles duplicados por nombre, en una línea. */
export function AvisoDuplicados({ inv }: { inv: Inventario }) {
  const { duplicateWarning } = inv;
  if (duplicateWarning.length === 0) return null;
  return (
    <div className="flex min-h-12 flex-wrap items-center gap-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-4 py-2">
      <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
      <span className="text-sm text-[var(--data-warning-ink)]">
        ¿Duplicados? <span className="font-bold">{duplicateWarning[0].a}</span> y <span className="font-bold">{duplicateWarning[0].b}</span>
        {duplicateWarning.length > 1 && ` (y ${duplicateWarning.length - 1} más)`}
      </span>
      <InfoTip
        what={duplicateWarning.map((d) => `${d.a} ↔ ${d.b}`).join(" · ")}
        affects="Dos fichas del mismo producto parten el stock y las ventas en dos."
      />
    </div>
  );
}
