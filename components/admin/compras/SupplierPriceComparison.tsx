"use client";

import { useEffect, useState } from "react";
import { BlockTitle, DataTable } from "@buleje/design-system";
import { AlertTriangle, TrendingDown, TrendingUp } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import TableSkeleton from "@/components/admin/shared/TableSkeleton";
import { button } from "@/components/ui-system/button-variants";
import { diaCorto } from "@/lib/compras/ciclo-oc";
import { DIAS_PRECIO_VIEJO, type FilaComparable } from "@/lib/compras/precio-comparable";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface SupplierPriceComparisonProps {
  productId: number;
  productName: string;
}

export { QuotationComparator } from "./QuotationComparator";

const CHIP = "inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-0.5 text-sm font-semibold";
const CHIP_VERDE = "bg-[var(--data-success-100)] text-[var(--data-success-ink)] dark:bg-[var(--data-success-500)]/15";
const CHIP_AMBAR = "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/15";
const CHIP_GRIS = "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";

const haceDias = (n: number) => (n === 0 ? "hoy" : n === 1 ? "ayer" : `hace ${n} días`);

/**
 * Cuánto te cuesta un producto con cada proveedor (C37): costo PUESTO en tu
 * tienda (descuento, IGV y flete de la orden), una fila por proveedor y unidad,
 * y «el mejor» sólo entre filas de la misma unidad. Lo calcula el servidor
 * (`lib/compras/precio-comparable.ts`); acá sólo se dibuja.
 */
export default function SupplierPriceComparison({ productId, productName }: SupplierPriceComparisonProps) {
  const [filas, setFilas] = useState<{ id: number; filas: FilaComparable[] } | null>(null);
  const [error, setError] = useState(false);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(false);
    fetch(`/api/compras/precio-comparativo?productId=${productId}`, { signal: ctrl.signal, cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as { comparaciones?: FilaComparable[] };
        setFilas({ id: productId, filas: data.comparaciones ?? [] });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        console.warn("[SupplierPriceComparison] fetch failed:", err);
        setError(true);
      });
    return () => ctrl.abort();
  }, [productId, vuelta]);

  const producto = <EnlacePanel cosa="producto" id={String(productId)} apariencia="heredada">{productName}</EnlacePanel>;

  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-2 py-3 text-sm">
        <span className="text-[var(--data-error-ink)]">No se pudo comparar los precios de {productName}.</span>
        <button type="button" onClick={() => setVuelta((v) => v + 1)} className={button({ variant: "ghost", className: "rounded-xl" })}>Reintentar</button>
      </div>
    );
  }
  if (!filas || filas.id !== productId) return <TableSkeleton rows={2} cols={4} />;

  const comparaciones = filas.filas;
  if (comparaciones.length === 0) {
    return (
      <div className="py-4 text-center">
        <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-[var(--text-tertiary)]" aria-hidden />
        <p className="text-sm text-[var(--text-secondary)]">No hay compras de <strong>{producto}</strong> (sin contar las anuladas).</p>
      </div>
    );
  }

  const unidades = new Set(comparaciones.map((c) => c.unidad));
  const proveedores = new Set(comparaciones.map((c) => c.supplierId));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <BlockTitle>Cuánto te cuesta puesto: {producto}</BlockTitle>
        <InfoTip
          title="Costo puesto en tu tienda"
          what="El costo de la orden con su descuento, más IGV si se cargó sin IGV, más el flete y otros gastos de esa orden repartidos por valor."
          affects={`Se toma la última compra que llegó de cada proveedor (si nunca llegó, la última pedida, marcada). «Mejor» sólo compara la misma unidad: un saco no se compara con un kilo. Un precio de más de ${DIAS_PRECIO_VIEJO} días puede no ser el de hoy.`}
          example="S/ 100 con 10 % de descuento, sin IGV y S/ 5 de flete repartido = S/ 111,20."
        />
      </div>

      {proveedores.size === 1 && (
        <p className="flex items-center gap-2 rounded-lg border border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)] px-3 py-2 text-sm text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/10">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Sólo le compraste a 1 proveedor: cotiza con otro para tener con qué comparar.
        </p>
      )}
      {unidades.size > 1 && (
        <p className="text-sm text-[var(--text-secondary)]">Lo compraste en {unidades.size} unidades distintas: cada una se compara por separado.</p>
      )}

      <div className="overflow-x-auto">
        <DataTable className="w-full">
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Unidad</th>
              <th className="text-right">Costo puesto</th>
              <th className="text-right">Fecha</th>
              <th className="text-right">Compras</th>
              <th className="text-right">Frente al mejor</th>
            </tr>
          </thead>
          <tbody>
            {comparaciones.map((c) => (
              <tr key={`${c.supplierId}|${c.unidad}`}>
                <td>
                  <div className="min-w-0">
                    <EnlacePanel cosa="proveedor" id={c.supplierId} apariencia="heredada" className="font-semibold">{c.supplierName}</EnlacePanel>
                    <div className="mt-0.5 flex flex-wrap gap-1 empty:hidden">
                      {c.mejor && <span className={cn(CHIP, CHIP_VERDE)}><TrendingDown className="h-3 w-3" aria-hidden /> Mejor</span>}
                      {!c.llego && <span className={cn(CHIP, CHIP_GRIS)}>Sólo pedida</span>}
                      {c.vieja && <span className={cn(CHIP, CHIP_AMBAR)}>Precio viejo</span>}
                    </div>
                  </div>
                </td>
                <td>{c.unidad}</td>
                <td className="text-right">
                  <div className="min-w-0">
                    <p className="font-bold tabular-nums">{c.costoPuesto > 0 ? formatCurrency(c.costoPuesto) : "Sin costo"}</p>
                    {c.ajustes.length > 0 && (
                      <p className="text-sm text-[var(--text-tertiary)]" title={c.ajustes.join(" · ")}>
                        en la orden {formatCurrency(c.costoDeLista)}
                      </p>
                    )}
                  </div>
                </td>
                <td className="text-right">
                  <div className="min-w-0">
                    <p>{diaCorto(c.fecha)}</p>
                    <p className="text-sm text-[var(--text-tertiary)]">{haceDias(c.diasDesde)}</p>
                  </div>
                </td>
                <td className="text-right tabular-nums">{c.compras}</td>
                <td className="text-right">
                  {c.mejor ? (
                    <span className="text-sm font-bold text-[var(--data-success-ink)]">El mejor</span>
                  ) : c.sobreElMejor !== null ? (
                    <span className="inline-flex items-center justify-end gap-0.5 text-sm font-semibold text-[var(--data-error-ink)]">
                      <TrendingUp className="h-3 w-3" aria-hidden /> +{c.sobreElMejor} %
                    </span>
                  ) : (
                    <span className="text-sm text-[var(--text-tertiary)]">Sin con quién comparar</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}
