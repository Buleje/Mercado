"use client";

import { BadgeStatus, CardTitle, DataTable } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { InspeccionResumen, PendientePlanta } from "@/lib/superadmin/plantas-forestales/tipos";
import { SinLectura } from "./cifras";
import { diaCorto, ESTADO_INSPECCION, URGENCIA } from "./formato";

const ORDEN_URGENCIA: Record<PendientePlanta["urgencia"], number> = { bloquea: 0, atrasado: 1, pendiente: 2 };

/** Lo que la planta tiene sin cerrar en su libro (de la misma lista que ve ella). */
export function FichaPendientes({ pendientes, leidos }: { pendientes: PendientePlanta[]; leidos: boolean }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1.5">
        <CardTitle>Pendientes de su libro</CardTitle>
        <InfoTip title="Pendientes" what="Lo que la planta tiene por cerrar: guías sin recibir, corridas abiertas, formatos sin presentar." affects="«Bloquea» frena otro paso del libro; «Atrasado» ya pasó su fecha." />
      </div>
      {!leidos ? (
        <p className="text-sm"><SinLectura fuente="pendientes" /></p>
      ) : pendientes.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">Nada pendiente.</p>
      ) : (
        <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          {[...pendientes].sort((a, b) => ORDEN_URGENCIA[a.urgencia] - ORDEN_URGENCIA[b.urgencia]).map((p) => (
            <li key={`${p.urgencia}:${p.titulo}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0 text-[var(--text-primary)]">{p.titulo}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="tabular-nums font-semibold">{p.cantidad}</span>
                <BadgeStatus variant={URGENCIA[p.urgencia].variante} label={URGENCIA[p.urgencia].rotulo} size="sm" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Inspecciones hechas a la planta. Crear una llega en la fase 3. */
export function FichaInspecciones({ inspecciones }: { inspecciones: InspeccionResumen[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1.5">
        <CardTitle>Inspecciones</CardTitle>
        <InfoTip title="Inspecciones" what="Visitas a la planta para contar lo que hay y compararlo con su libro." affects="Cada una guarda una foto del libro del día: el acta compara contra eso." />
      </div>
      {inspecciones.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">Sin inspecciones todavía.</p>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Inspector</th>
              <th>Estado</th>
              <th className="text-right">Hallazgos</th>
              <th className="text-right">Trozas que faltaron</th>
            </tr>
          </thead>
          <tbody>
            {inspecciones.map((i) => (
              <tr key={i.id}>
                <td className="whitespace-nowrap">{diaCorto(i.fecha)}</td>
                <td>{i.inspector}</td>
                <td><BadgeStatus variant={ESTADO_INSPECCION[i.estado].variante} label={ESTADO_INSPECCION[i.estado].rotulo} size="sm" /></td>
                <td className="text-right tabular-nums">{i.hallazgos}</td>
                <td className="text-right tabular-nums">{i.faltantesTrozas == null ? <span title="No se contó el patio">—</span> : i.faltantesTrozas}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </section>
  );
}
