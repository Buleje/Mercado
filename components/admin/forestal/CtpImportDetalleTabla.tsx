"use client";

/**
 * El detalle fila por fila de lo que dice el importador (vista previa y
 * resultado): con 300 filas, lo que se busca es «las que dan error» o «esta GTF».
 * Filtro en el encabezado de cada columna, como el resto del panel (26-10).
 * El resumen de arriba («Importar N») cuenta TODAS las filas, no las que se ven.
 */

import { DataTable } from "@buleje/design-system";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "./filtros-tabla-forestal";

export type AccionImport = "crear" | "creado" | "existe" | "difiere" | "error";
export interface FilaImport {
  row?: number;
  gtf: string | null;
  action: AccionImport;
  message: string;
  seccion?: string;
}

const ETIQUETA: Record<AccionImport, { label: string; cls: string }> = {
  crear: { label: "A crear", cls: "bg-[var(--data-info-100)] text-[var(--data-info-700)]" },
  creado: { label: "Creado", cls: "bg-[var(--data-success-100)] text-[var(--data-success-700)]" },
  existe: { label: "Ya existe", cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
  difiere: { label: "Difiere", cls: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]" },
  error: { label: "Error", cls: "bg-[var(--data-error-100)] text-[var(--data-error-700)]" },
};

function ActionBadge({ action }: { action: AccionImport }) {
  const m = ETIQUETA[action];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${m.cls}`}>{m.label}</span>;
}

const COLUMNAS: readonly ColumnaFiltro<FilaImport>[] = [
  { id: "seccion", label: "Registro", tipo: "multi", valor: (d) => d.seccion ?? "—" },
  { id: "fila", label: "Fila", tipo: "rango", numero: (d) => d.row ?? null },
  { id: "gtf", label: "GTF", tipo: "texto", valor: (d) => d.gtf },
  { id: "estado", label: "Estado", tipo: "multi", valor: (d) => ETIQUETA[d.action].label },
  { id: "detalle", label: "Detalle", tipo: "texto", valor: (d) => d.message },
];

export default function CtpImportDetalleTabla({ detalle, conRegistro }: { detalle: readonly FilaImport[]; conRegistro: boolean }) {
  const f = useFiltrosTabla(detalle, COLUMNAS);
  const filas = f.filtradas;
  return (
    <div className="space-y-2">
      <BarraFiltrosTabla f={f} excel="Detalle de la importación" />
      <div className="max-h-[46vh] overflow-y-auto rounded-2xl border border-[var(--rule-base)]">
        <DataTable className="w-full">
          <thead className="sticky top-0">
            <tr>
              {conRegistro && <ThColumna label="Registro" ids={["seccion"]} f={f} className="align-top" />}
              <ThColumna label="Fila" ids={["fila"]} f={f} className="align-top" />
              <ThColumna label="GTF" ids={["gtf"]} f={f} className="align-top" />
              <ThColumna label="Estado" ids={["estado"]} f={f} className="align-top" />
              <ThColumna label="Detalle" ids={["detalle"]} f={f} className="align-top" />
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && detalle.length > 0 && <SinCoincidenciasFila colSpan={conRegistro ? 5 : 4} />}
            {filas.map((d, i) => (
              <tr key={i}>
                {conRegistro && <td className="font-bold text-[var(--text-secondary)]">{d.seccion ?? "—"}</td>}
                <td className="font-mono text-[var(--text-tertiary)]">{d.row ?? "—"}</td>
                <td className="font-mono font-bold">{d.gtf ?? "—"}</td>
                <td><ActionBadge action={d.action} /></td>
                <td className="text-[var(--text-secondary)]">{d.message}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}
