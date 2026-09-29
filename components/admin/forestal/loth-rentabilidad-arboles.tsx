"use client";

/**
 * Margen árbol por árbol. Contesta «¿convino tumbar ESTE?», que el promedio por
 * especie no puede contestar: un fuste que rindió 30% y otro que rindió 80%
 * viven en la misma fila de la especie.
 */

import { StatCard, DataTable } from "@buleje/design-system";
import { Award, Coins, TrendingUp } from "@buleje/design-system/icons";
import type { margenPorArbol, resumirMargenArbol } from "@/lib/forestal/loth-margen-arbol";
import { BarraMargen, Td, Th, soles } from "./loth-rentabilidad-celdas";

export default function LothRentabilidadArboles({
  filas,
  resumen,
}: {
  filas: ReturnType<typeof margenPorArbol>;
  resumen: ReturnType<typeof resumirMargenArbol>;
}) {
  if (filas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--rule-base)] p-6 text-center text-sm text-[var(--text-tertiary)]">
        Todavía no hay árboles talados para valorizar.
      </div>
    );
  }
  const maxAbs = Math.max(...filas.map((a) => Math.abs(a.margen)), 1);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          density="compact"
          label="Árboles que rindieron"
          value={`${resumen.conMovimiento}/${resumen.arboles}`}
          subValue={resumen.sinMovilizar > 0 ? `${Number(resumen.sinMovilizarM3).toFixed(2)} m³ tumbados sin salir` : "todos movilizados"}
          icon={TrendingUp}
          emphasis={resumen.sinMovilizar > 0 ? "warning" : "success"}
        />
        <StatCard
          density="compact"
          label="Margen de trozas vendidas"
          value={soles(resumen.margen)}
          subValue={
            resumen.consumidoM3 > 0
              ? `${Number(resumen.consumidoM3).toFixed(2)} m³ fueron al aserrío (su plata está en el producto)`
              : `ingreso ${soles(resumen.ingreso)}`
          }
          icon={Coins}
          emphasis={resumen.margen > 0 ? "success" : "neutral"}
        />
        <StatCard
          density="compact"
          label="El que más dejó"
          value={resumen.mejor?.tree ?? "—"}
          subValue={resumen.mejor ? `${soles(resumen.mejor.margen)} · ${Number(resumen.mejor.movilizadoM3).toFixed(2)} m³` : "sin movimiento"}
          icon={Award}
          emphasis="neutral"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
        <DataTable className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)] text-left">
            <tr>
              <Th>Árbol</Th>
              <Th>Especie</Th>
              <Th className="text-right">Talado</Th>
              <Th className="text-right">Movilizado</Th>
              <Th className="text-right">Rend.</Th>
              <Th className="text-right">Ingreso</Th>
              <Th className="text-right">Margen</Th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.tree} className={`border-t border-[var(--rule-soft)] ${f.movilizadoM3 <= 0 ? "opacity-60" : ""}`}>
                <Td>
                  <span className="font-mono font-bold text-[var(--text-primary)]">{f.tree}</span>
                </Td>
                <Td className="text-[var(--text-secondary)]">
                  {f.especie ?? "—"}
                  {f.sinPrecio && (
                    <span className="ml-1.5 rounded bg-[var(--data-warning-500)]/15 px-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                      sin precio
                    </span>
                  )}
                </Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{Number(f.taladoM3).toFixed(2)} m³</Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{f.movilizadoM3 > 0 ? `${Number(f.movilizadoM3).toFixed(2)} m³` : "—"}</Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{f.rendimientoPct != null ? `${Number(f.rendimientoPct).toFixed(1)}%` : "—"}</Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{f.ingreso > 0 ? soles(f.ingreso) : "—"}</Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <BarraMargen margen={f.margen} maxAbs={maxAbs} minimo={2} />
                    <span className={`font-mono font-bold tabular-nums ${f.margen > 0 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--text-tertiary)]"}`}>
                      {f.margen > 0 ? soles(f.margen) : "—"}
                    </span>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}
