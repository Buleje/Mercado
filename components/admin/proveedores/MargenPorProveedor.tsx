"use client";

/**
 * Cuánto ganas con cada proveedor (Compras › Proveedores › Comparar): ventas,
 * costo y ganancia de los productos que le compras a cada uno en el período.
 * Cada producto va con el proveedor de su ÚLTIMA compra recibida; lo vendido
 * sin compra recibida, en su propia fila. Las cifras las arma el servidor
 * (`lib/analytics/margen-por-proveedor.ts`).
 */
import { useState } from "react";
import { DataTable } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { button } from "@/components/ui-system/button-variants";
import type { FilaProveedor } from "@/lib/analytics/margen-por-proveedor";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMargenProveedor, type DiasMargen } from "./use-margen-proveedor";

const PERIODOS: { value: DiasMargen; label: string }[] = [
  { value: "7", label: "7 días" },
  { value: "30", label: "30 días" },
  { value: "90", label: "90 días" },
];

const pct = (n: number) => `${formatNumber(n, { max: 1 })} %`;

function Fila({ f, apagada = false }: { f: FilaProveedor; apagada?: boolean }) {
  const productos = f.top.slice(0, 3).map((t) => t.nombre).join(", ") + (f.productos > 3 ? ` y ${f.productos - 3} más` : "");
  return (
    <tr className={cn(apagada && "text-[var(--text-secondary)]")}>
      <td>
        {/* Un div: en la tarjeta del celular el td es flex y ponía nombre y productos lado a lado («Mayoris…»). */}
        <div className="min-w-0 max-w-[18rem] text-right sm:text-left">
          <span className={cn("block truncate font-semibold", apagada ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]")}>{f.proveedor}</span>
          <span className="block truncate text-sm text-[var(--text-tertiary)]" title={productos}>{productos}</span>
        </div>
      </td>
      <td className="text-right tabular-nums">{formatNumber(f.productos)}</td>
      <td className="whitespace-nowrap text-right tabular-nums">{formatCurrency(f.ventas)}</td>
      <td className="whitespace-nowrap text-right tabular-nums">{formatCurrency(f.costo)}</td>
      <td className={cn("whitespace-nowrap text-right font-bold tabular-nums", f.ganancia < 0 ? "text-[var(--data-error-ink)]" : "text-[var(--text-primary)]")}>
        {f.costoEstimado ? "≈ " : ""}
        {formatCurrency(f.ganancia)}
      </td>
      <td className="whitespace-nowrap text-right tabular-nums">{f.ventas > 0 ? pct(f.margenPct) : "—"}</td>
    </tr>
  );
}

export default function MargenPorProveedor() {
  const [dias, setDias] = useState<DiasMargen>("30");
  const { datos, cargando, error, reintentar } = useMargenProveedor(dias);
  const hayEstimado = !!datos && [...datos.filas, ...(datos.sinProveedor ? [datos.sinProveedor] : [])].some((f) => f.costoEstimado);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SegmentedControl<DiasMargen> value={dias} onChange={setDias} options={PERIODOS} size="lg" label="Período" />
        {datos && datos.resumen.ventas > 0 && (
          <p className="text-sm text-[var(--text-secondary)]">
            Vendiste <strong className="tabular-nums text-[var(--text-primary)]">{formatCurrency(datos.resumen.ventas)}</strong>{" "}
            {datos.resumen.ganancia < 0 ? "y perdiste" : "y ganaste"}{" "}
            <strong className="tabular-nums text-[var(--text-primary)]">{formatCurrency(Math.abs(datos.resumen.ganancia))}</strong> ({pct(datos.resumen.margenPct)})
            {datos.sinProveedor ? ` · ${pct(datos.resumen.conProveedorPct)} con proveedor` : ""}
          </p>
        )}
        <InfoTip
          title="Cuánto ganas con cada proveedor"
          what="Lo que vendiste de los productos que le compras a cada proveedor, su costo y lo que te quedó. Cada producto cuenta para el proveedor de su última compra que llegó (orden recibida o parcial)."
          affects={`«Sin compra registrada» = lo que vendiste sin ninguna orden de compra recibida: no se reparte a ojo.${hayEstimado ? " «≈» = alguna venta no guardó su costo y se usó el costo de hoy del producto." : ""}`}
          example="Si a Distribuidora Lima le compraste el arroz y el aceite, ahí suman las ventas de los dos."
        />
      </div>

      {error ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-base)] p-4 text-sm">
          <span className="text-[var(--data-error-ink)]">No se pudo calcular el margen por proveedor.</span>
          <button type="button" onClick={reintentar} className={button({ variant: "ghost", className: "rounded-xl text-sm" })}>Reintentar</button>
        </div>
      ) : !datos ? (
        <p className="p-4 text-sm text-[var(--text-tertiary)]">Calculando…</p>
      ) : datos.filas.length === 0 && !datos.sinProveedor ? (
        <p className="p-4 text-sm text-[var(--text-secondary)]">No vendiste nada en estos {datos.periodDays} días.</p>
      ) : (
        <div className={cn("overflow-x-auto rounded-xl border border-[var(--rule-base)] transition-opacity", cargando && "opacity-60")} aria-busy={cargando}>
          <DataTable>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th className="text-right">Productos</th>
                <th className="text-right">Ventas</th>
                <th className="text-right">Costo</th>
                <th className="text-right">Ganancia</th>
                <th className="text-right">Margen</th>
              </tr>
            </thead>
            <tbody>
              {datos.filas.map((f) => <Fila key={f.supplierId ?? "sin"} f={f} />)}
              {datos.sinProveedor && <Fila f={datos.sinProveedor} apagada />}
            </tbody>
          </DataTable>
          {datos.filas.length === 0 && (
            <p className="border-t border-[var(--rule-soft)] p-3 text-sm text-[var(--text-secondary)]">
              Ninguna orden de compra recibida tiene productos vendidos en el período: recibe tus órdenes en Compras › Órdenes para ver a quién le ganas más.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
