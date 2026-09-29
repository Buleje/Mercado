"use client";

/**
 * Rendimiento y valor por especie: lo que «Extracción» no muestra. El talado,
 * el trozado, el despachado y el saldo por especie viven allá, por permiso.
 */

import { DataTable } from "@buleje/design-system";
import { fm } from "./loth-analitica-piezas";
import { Td, Th } from "./loth-rentabilidad-celdas";
import type { FilaRendimiento } from "./loth-rentabilidad-datos";

export default function LothRentabilidadRendimiento({ filas }: { filas: FilaRendimiento[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
      <DataTable className="w-full text-sm">
        <thead className="bg-[var(--surface-sunken)] text-left">
          <tr>
            <Th>Especie</Th>
            <Th className="text-right">Rendimiento</Th>
            <Th className="text-right">Merma (m³)</Th>
            <Th className="text-right">Valor movilizado</Th>
          </tr>
        </thead>
        <tbody>
          {filas.map((s) => (
            <tr key={s.species} className="border-t border-[var(--rule-soft)]">
              <Td>
                <span className="font-medium text-[var(--text-primary)]">{s.species}</span>
                {s.cites && <span className="ml-2 rounded bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]">CITES</span>}
              </Td>
              <Td className="text-right">
                {s.rendimientoPct != null && s.taladoM3 > 0 ? (
                  <span className={`font-mono font-bold tabular-nums ${s.rendimientoPct >= 60 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"}`}>{s.rendimientoPct}%</span>
                ) : (
                  <span className="text-[var(--text-tertiary)]">—</span>
                )}
              </Td>
              <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{s.taladoM3 > 0 ? fm(s.mermaM3, 4) : "—"}</Td>
              <Td className="text-right font-mono tabular-nums text-[var(--text-primary)]">S/ {fm(s.valorMovilizado)}</Td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
