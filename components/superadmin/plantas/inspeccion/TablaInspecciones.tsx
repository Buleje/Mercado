"use client";

/**
 * Inspecciones en tabla (escritorio) o tarjetas (celular). La usan la ficha de
 * la planta (sin columna «Planta») y la lista de todas las inspecciones.
 */
import Link from "next/link";
import { BadgeStatus, DataTable } from "@buleje/design-system";
import { ChevronRight } from "@buleje/design-system/icons";
import type { InspeccionResumen } from "@/lib/superadmin/plantas-forestales/tipos";
import { diaCorto, ESTADO_INSPECCION } from "../formato";

export type FilaDeInspeccion = InspeccionResumen & { tenantId: string; plantaNombre?: string | null };

export const enlaceInspeccion = (f: Pick<FilaDeInspeccion, "tenantId" | "id">) =>
  `/superadmin/plantas/${encodeURIComponent(f.tenantId)}/inspeccion/${encodeURIComponent(f.id)}`;

function Faltantes({ n }: { n: number | null }) {
  return n == null ? <span title="No se contó el patio">—</span> : <>{n}</>;
}

function Estado({ f }: { f: FilaDeInspeccion }) {
  const e = ESTADO_INSPECCION[f.estado];
  return <BadgeStatus variant={e.variante} label={e.rotulo} size="sm" />;
}

export function TablaInspecciones({ filas, conPlanta = false }: { filas: FilaDeInspeccion[]; conPlanta?: boolean }) {
  const planta = (f: FilaDeInspeccion) => f.plantaNombre ?? "Planta sin nombre";
  return (
    <>
      <div className="hidden md:block">
        <DataTable>
          <thead>
            <tr>
              <th>Fecha</th>
              {conPlanta && <th>Planta</th>}
              <th>Inspector</th>
              <th>Estado</th>
              <th className="text-right">Trozas que faltaron</th>
              <th className="text-right">Hallazgos</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id}>
                <td className="whitespace-nowrap">
                  <Link href={enlaceInspeccion(f)} className="font-semibold text-[var(--text-primary)] underline-offset-2 hover:underline">
                    {diaCorto(f.fecha)}
                  </Link>
                </td>
                {conPlanta && <td>{planta(f)}</td>}
                <td>{f.inspector}</td>
                <td><Estado f={f} /></td>
                <td className="text-right tabular-nums"><Faltantes n={f.faltantesTrozas} /></td>
                <td className="text-right tabular-nums">{f.hallazgos}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>

      <ul className="space-y-3 md:hidden">
        {filas.map((f) => (
          <li key={f.id}>
            <Link
              href={enlaceInspeccion(f)}
              className="flex items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 text-sm"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[var(--text-primary)] first-letter:uppercase">{diaCorto(f.fecha)}</span>
                  <Estado f={f} />
                </div>
                {conPlanta && <p className="break-words font-semibold text-[var(--text-primary)]">{planta(f)}</p>}
                <p className="text-[var(--text-secondary)]">{f.inspector}</p>
                <p className="tabular-nums text-[var(--text-secondary)]">
                  Faltaron <Faltantes n={f.faltantesTrozas} /> trozas · {f.hallazgos} {f.hallazgos === 1 ? "hallazgo" : "hallazgos"}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
