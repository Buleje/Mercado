"use client";

/**
 * La lista de recojo en pantalla: lo que hay que juntar sumado por producto,
 * en el orden del almacén (categoría y nombre). Cada fila dice de qué pedidos
 * sale y cuánto de cada uno; el número abre el pedido.
 *
 * Se arma en el navegador con `consolidarPorProducto` sobre las líneas que
 * mandó el servidor: son cantidades a juntar, no plata (ningún total en soles).
 */

import { useMemo } from "react";
import { DataTable } from "@buleje/design-system";
import { Package } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { consolidarPorProducto, type PedidoPrep } from "@/lib/pedidos/preparacion";
import { NumerosDePedido, Vacio } from "./piezas";

export function PorProducto({ pedidos }: { pedidos: readonly PedidoPrep[] }) {
  const filas = useMemo(() => consolidarPorProducto(pedidos), [pedidos]);
  if (filas.length === 0) return <Vacio icono={Package} texto="No hay nada que juntar: ningún pedido confirmado o en preparación." />;

  return (
    <DataTable>
      <thead>
        <tr>
          <th>Producto</th>
          <th className="text-right">Juntar</th>
          <th className="text-right">Juntado</th>
          <th className="text-right">Stock</th>
          <th>De qué pedidos</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => {
          const completo = f.juntado >= f.total;
          return (
            <tr key={f.clave}>
              <td>
                <span className={cn("block font-semibold text-[var(--text-primary)]", completo && "text-[var(--text-tertiary)] line-through")}>{f.nombre}</span>
                {f.categoria && <span className="block text-xs text-[var(--text-tertiary)]">{f.categoria}</span>}
              </td>
              <td className="text-right font-bold tabular-nums">
                {f.total} {f.unidad}
              </td>
              <td className={cn("text-right tabular-nums", completo ? "text-[var(--data-success-ink)]" : "text-[var(--text-secondary)]")}>
                {f.juntado}
              </td>
              <td className="text-right tabular-nums">
                {f.stock == null ? (
                  <span className="text-[var(--text-tertiary)]">Sin control</span>
                ) : (
                  <span className={cn(f.stockCorto && "font-semibold text-[var(--data-warning-ink)]")} title={f.stockCorto ? "El sistema dice que no alcanza para lo que falta juntar" : undefined}>
                    {f.stock}
                    {f.stockCorto && " · no alcanza"}
                  </span>
                )}
              </td>
              <td>
                <NumerosDePedido
                  ids={f.pedidos.map((x) => ({ id: x.id, extra: `×${x.cantidad}` }))}
                  max={4}
                  etiqueta={`Pedidos con ${f.nombre}`}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
