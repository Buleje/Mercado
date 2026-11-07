"use client";

/**
 * Cuadros Resumen 2 y 3 del LO-CTP (productos transformados y balance de la
 * transformación primaria), más el rendimiento de cada lote contra su franja.
 *
 * Salieron de `CtpResumenesSerfor` (compactación del libro, 17-10) sin cambiar
 * una celda: los mismos casilleros numerados del formato oficial.
 */

import { cn } from "@/lib/utils";
import { unidadOficial } from "@/lib/forestal/loctp-campos";
import type { FilaResumen2, FilaResumen3 } from "@/lib/forestal/loctp-resumenes";
import CtpRendimientoLotes from "./CtpRendimientoLotes";
import { Celda, Cuadro, Th } from "./ctp-cuadro-shared";

export default function CtpCuadrosResumen23({
  resumen2,
  resumen3,
}: {
  resumen2: readonly FilaResumen2[];
  resumen3: FilaResumen3[];
}) {
  return (
    <>
      <Cuadro
        titulo="Cuadro Resumen 2 · Saldos y movimientos de productos transformados"
        subtitulo="Por especie, tipo de producto y unidad: 10 casilleros."
      >
        <thead>
          <tr>
            <Th>(1) Especie</Th>
            <Th>(3) Tipo de producto</Th>
            <Th>(4) Unidad</Th>
            <Th>(5) Inicial</Th>
            <Th>(6) Ingresó</Th>
            <Th>(7) Consumido</Th>
            <Th>(8) Producido</Th>
            <Th>(9) Salió</Th>
            <Th>(10) Saldo</Th>
          </tr>
        </thead>
        <tbody>
          {resumen2.length === 0 ? (
            <tr>
              <td colSpan={9} className="text-center text-[var(--text-secondary)]">
                Sin productos transformados en el período.
              </td>
            </tr>
          ) : (
            resumen2.map((f) => (
              <tr key={`${f.especie}|${f.tipoProducto}|${f.unidad}`}>
                <td className="font-bold">{f.especie}</td>
                <td>{f.tipoProducto}</td>
                <td className="text-[var(--text-secondary)]">{unidadOficial(f.unidad)}</td>
                <Celda v={f.inicial} />
                <Celda v={f.ingresado} />
                <Celda v={f.consumido} />
                <Celda v={f.producido} />
                <Celda v={f.salido} />
                <Celda v={f.saldo} negativo />
              </tr>
            ))
          )}
        </tbody>
      </Cuadro>

      <Cuadro
        titulo="Cuadro Resumen 3 · Balance de la transformación primaria"
        subtitulo="Por lote y línea de producción: 13 casilleros. Con unidades distintas el formato pide el factor de conversión, no un porcentaje."
      >
        <thead>
          <tr>
            <Th>(1) Lote</Th>
            <Th>(2) Producto</Th>
            <Th>(3) Especie</Th>
            <Th>(6) Consumido m³</Th>
            <Th>(7) Línea</Th>
            <Th>(9) Producido</Th>
            <Th>(11) Salió</Th>
            <Th>(12) Stock</Th>
            <Th>(13) Rendimiento</Th>
          </tr>
        </thead>
        <tbody>
          {resumen3.length === 0 ? (
            <tr>
              <td colSpan={9} className="text-center text-[var(--text-secondary)]">
                Sin producción en el período.
              </td>
            </tr>
          ) : (
            resumen3.map((f) => (
              <tr key={`${f.lote}|${f.lineaProduccion}|${f.tipoProducto}|${f.especie}`}>
                <td className="font-mono font-bold">{f.lote}</td>
                <td>{f.tipoProducto}</td>
                <td>{f.especie}</td>
                <Celda v={f.cantidadConsumida} />
                <td>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[length:var(--ts-2xs,11px)] font-bold",
                      f.lineaProduccion === "LRE"
                        ? "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]"
                        : "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
                    )}
                  >
                    {f.lineaProduccion}
                  </span>
                </td>
                <Celda v={f.cantidadProducida} />
                <Celda v={f.salido} />
                <Celda v={f.stock} negativo />
                <td className="text-right font-mono tabular-nums">
                  {f.rendimientoPct != null ? `${f.rendimientoPct}%` : (f.factorConversion ?? "—")}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </Cuadro>

      {/* El (13) del cuadro de arriba, puesto contra su referencia: el
        número sin la franja al lado obliga a saberse los rangos de
        memoria y a comparar fila por fila. */}
      <CtpRendimientoLotes filas={resumen3} />
    </>
  );
}
