"use client";

/**
 * «Lo que vas a importar» de la Rolliza en patio, por especie (Brandon 19-10):
 * trozas, m³ y pt aserrables de todos los archivos de la caja, ANTES de
 * pulsar Importar. Cuenta lo mismo que el envío (sin problemas, en stock).
 */

import { useMemo } from "react";
import { DataTable } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { resumirRollizaPorEspecie } from "@/lib/forestal/resumen-rolliza-por-especie";
import type { ArchivoCargado } from "./use-archivos-del-libro";

const NUM = "text-right tabular-nums";

export default function ResumenRollizaPatio({ archivos }: { archivos: readonly ArchivoCargado[] }) {
  const r = useMemo(() => resumirRollizaPorEspecie(archivos.flatMap((a) => a.seccion.parseadas)), [archivos]);
  if (r.filas.length === 0 && r.fueraDeStock === 0) return null;

  return (
    <div className="mt-3 space-y-2 rounded-lg bg-[var(--surface-raised)] p-2" data-resumen-rolliza>
      <p className="flex items-center gap-1.5 text-base font-extrabold text-[var(--text-primary)]">
        Lo que vas a importar
        <InfoTip
          icono="ayuda"
          title="pt aserrables"
          what="pt aserrables = m³ × 56 % (rendimiento de referencia SERFOR para aserrada) × 424 pt por m³. Es una estimación de lo que rendiría en tablas, no el volumen de la troza."
        />
      </p>
      {r.filas.length > 0 && (
        <DataTable className="w-full [&_td]:px-2 [&_th]:px-2 sm:[&_td]:px-4 sm:[&_th]:px-4">
          <thead>
            <tr>
              <th className="text-left">Especie</th>
              <th className={NUM}>Trozas</th>
              <th className={NUM}>m³</th>
              <th className={NUM}>pt aserrables</th>
            </tr>
          </thead>
          <tbody>
            {r.filas.map((f) => (
              <tr key={f.especie}>
                <td className="font-semibold text-[var(--text-primary)]">{f.especie}</td>
                <td className={NUM}>{f.trozas}</td>
                <td className={NUM}>{fmtM3(f.m3)}</td>
                <td className={NUM}>{fmtPt(f.ptAserrable)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] font-extrabold">
            <tr>
              <td>Total</td>
              <td className={NUM}>{r.total.trozas}</td>
              <td className={NUM}>{fmtM3(r.total.m3)}</td>
              <td className={NUM}>{fmtPt(r.total.ptAserrable)}</td>
            </tr>
          </tfoot>
        </DataTable>
      )}
      {r.fueraDeStock > 0 && (
        <p className="text-sm font-semibold text-[var(--data-warning)]">
          {r.fueraDeStock} {r.fueraDeStock === 1 ? "fila no entra" : "filas no entran"} (no {r.fueraDeStock === 1 ? "está" : "están"} en stock)
        </p>
      )}
    </div>
  );
}

/** La línea corta de un archivo: «12 trozas · 8,412 m³ · 2.000 pt». */
export function lineaDeRolliza(a: ArchivoCargado): string | null {
  const { total } = resumirRollizaPorEspecie(a.seccion.parseadas);
  if (total.trozas === 0) return null;
  return `${total.trozas} ${total.trozas === 1 ? "troza" : "trozas"} · ${fmtM3(total.m3)} m³ · ${fmtPt(total.ptAserrable)} pt`;
}
