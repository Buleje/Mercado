"use client";

/**
 * TramiteHistorialRelaciones — las relaciones YA presentadas de este mismo
 * formato (ADR-364 ronda 4, Brandon 2026-08-20: "una bandeja para ver de un
 * vistazo qué le declaraste a SERFOR en el año"). N°, período, estado y
 * fecha, sin salir del formulario — la actual (si ya se guardó) no aparece,
 * sólo las OTRAS.
 */
import { DataTable } from "@buleje/design-system";
import { History } from "@buleje/design-system/icons";
import { ESTADOS_TRAMITE, type TramiteRegistro } from "@/lib/forestal/tramites-registro";

const fmtFecha = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
};

export default function TramiteHistorialRelaciones({
  relaciones,
  idActual,
}: {
  /** Ya filtradas por formato (`relacionesDelFormato`), ordenadas más reciente primero. */
  relaciones: TramiteRegistro[];
  idActual?: string | null;
}) {
  const otras = relaciones.filter((t) => t.id !== idActual);
  if (otras.length === 0) return null;

  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
        <h4 className="text-sm font-bold text-[var(--text-primary)]">
          Relaciones presentadas antes ({otras.length})
        </h4>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
        <DataTable className="w-full min-w-[420px] text-xs">
          <caption className="sr-only">Historial de relaciones de guías presentadas</caption>
          <thead>
            <tr className="bg-[var(--surface-sunken)] text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              <th scope="col" className="px-3 py-2">N°</th>
              <th scope="col" className="px-3 py-2">Período</th>
              <th scope="col" className="px-3 py-2">Estado</th>
              <th scope="col" className="px-3 py-2">Presentado</th>
            </tr>
          </thead>
          <tbody>
            {otras.map((t) => (
              <tr key={t.id} className="border-t border-[var(--rule-soft)] even:bg-[var(--surface-raised)]/50">
                <td className="px-3 py-2 font-bold text-[var(--text-primary)]">{t.numeroDocumento ?? "—"}</td>
                <td className="px-3 py-2 text-[var(--text-secondary)]">
                  {fmtFecha(t.datos.periodoDesde || null)} – {fmtFecha(t.datos.periodoHasta || null)}
                </td>
                <td className="px-3 py-2 text-[var(--text-secondary)]">
                  {ESTADOS_TRAMITE.find((e) => e.key === t.estado)?.label ?? t.estado}
                </td>
                <td className="px-3 py-2 text-[var(--text-secondary)]">{fmtFecha(t.fechaPresentacion)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </section>
  );
}
