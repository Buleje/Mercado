"use client";

import Link from "next/link";
import { BadgeStatus, CardTitle } from "@buleje/design-system";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { InspeccionResumen, PendientePlanta } from "@/lib/superadmin/plantas-forestales/tipos";
import { SinLectura } from "./cifras";
import { URGENCIA } from "./formato";
import { NuevaInspeccion } from "./inspeccion/NuevaInspeccion";
import { enlaceInspeccion, TablaInspecciones } from "./inspeccion/TablaInspecciones";

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

/** Inspecciones de la planta: abrir una nueva, seguir la abierta o ver las anteriores. */
export function FichaInspecciones({ tenantId, inspecciones }: { tenantId: string; inspecciones: InspeccionResumen[] }) {
  const abierta = inspecciones.find((i) => i.estado === "abierta");
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <CardTitle>Inspecciones</CardTitle>
          <InfoTip title="Inspecciones" what="Visitas a la planta para contar lo que hay y compararlo con su libro." affects="Cada una guarda una foto del libro del día: el acta compara contra eso." />
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {abierta && (
            <Link href={enlaceInspeccion({ tenantId, id: abierta.id })} className={button({ variant: "secondary" })}>
              Seguir la abierta
            </Link>
          )}
          <NuevaInspeccion tenantId={tenantId} />
        </div>
      </div>
      {inspecciones.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">Sin inspecciones todavía.</p>
      ) : (
        <TablaInspecciones filas={inspecciones.map((i) => ({ ...i, tenantId }))} />
      )}
    </section>
  );
}
