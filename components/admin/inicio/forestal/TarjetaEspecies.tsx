"use client";

import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import type { InicioForestalCtp } from "@/lib/forestal/inicio-forestal";
import { TarjetaTablero } from "../resumen/TarjetaTablero";
import { BarraCrece, CTP, m3, PuntoLeyenda, TINTA } from "./comun";

/**
 * Las especies del período (2026-10-31): por cada una, lo que entró al patio y
 * lo que se aserró, en la misma escala. Es el `porEspecie` del Tablero del
 * Libro CTP (`movimientoDelLibro`), las de más movimiento primero; el servidor
 * manda las 6 primeras. Sin especies con movimiento, la tarjeta no se dibuja.
 */
export function TarjetaEspecies({ ctp, className }: { ctp: InicioForestalCtp; className?: string }) {
  const especies = (ctp.porEspecie ?? []).filter((e) => e.ingresoM3 > 0 || e.consumoM3 > 0);
  if (especies.length === 0) return null;
  const tope = Math.max(...especies.map((e) => Math.max(e.ingresoM3, e.consumoM3)));

  return (
    <TarjetaTablero
      id="forestal-especies"
      titulo="Especies del período"
      ayuda="Del Tablero del Libro CTP, el mismo período: por cada especie, los m³ de troza que entraron con guía y los que se aserraron. Van las de más movimiento primero; las dos barras están en la misma escala."
      className={className}
      pie={
        <EnlacePanel href={`${CTP}&vista=tablero`} className="inline-flex min-h-11 items-center">
          Ver por especie en el Tablero
        </EnlacePanel>
      }
    >
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Qué es cada color">
        <PuntoLeyenda color={TINTA.entra} texto="Entró" />
        <PuntoLeyenda color={TINTA.sierra} texto="Se aserró" />
      </ul>
      <ul className="space-y-2.5">
        {especies.map((e, i) => (
          <li key={e.especie}>
            {/* Si las cifras no entran al lado del nombre, bajan a su renglón: el nombre no se corta. */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="max-w-full truncate font-bold text-[var(--text-primary)]" title={e.especie}>
                {e.especie}
              </span>
              <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">
                {/* Un cero no se escribe: la barra vacía ya lo dice. */}
                {e.ingresoM3 > 0 && (
                  <>
                    entró <strong className="text-[var(--text-primary)]">{m3(e.ingresoM3)}</strong>
                  </>
                )}
                {e.ingresoM3 > 0 && e.consumoM3 > 0 && " · "}
                {e.consumoM3 > 0 && (
                  <>
                    se aserró <strong className="text-[var(--text-primary)]">{m3(e.consumoM3)}</strong>
                  </>
                )}
              </span>
            </div>
            <div className="mt-1 space-y-0.5">
              <BarraCrece pct={(e.ingresoM3 / tope) * 100} color={TINTA.entra} alto="h-2" retraso={i * 0.05} />
              <BarraCrece pct={(e.consumoM3 / tope) * 100} color={TINTA.sierra} alto="h-2" retraso={i * 0.05 + 0.04} />
            </div>
          </li>
        ))}
      </ul>
    </TarjetaTablero>
  );
}
