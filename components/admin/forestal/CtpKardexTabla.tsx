"use client";

/**
 * Los movimientos del kardex de una especie, con el filtro en el encabezado de
 * cada columna (26-10, como el resto del panel). El saldo corrido de cada fila
 * es el del libro: filtrar esconde filas, no lo recalcula. Los totales del pie
 * son del kardex entero y lo dicen.
 */

import { ArrowDownRight, ArrowUpRight } from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatDate } from "@/lib/format";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna, type AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "./filtros-tabla-forestal";

export interface MovimientoKardex {
  fecha: string;
  tipo: "ingreso" | "consumo";
  doc: string;
  entra: number;
  sale: number;
  saldo: number;
}

const n4 = (v: number) => fmtM3(v);
// entryDate es date-only a medianoche UTC → sin timeZone:UTC se corre un día.
const fmtDate = (iso: string) => {
  try {
    return formatDate(iso, { soloFecha: true });
  } catch {
    return iso;
  }
};

const COLUMNAS: readonly ColumnaFiltro<MovimientoKardex>[] = [
  { id: "fecha", label: "Fecha", tipo: "fecha", numero: (m) => m.fecha.slice(0, 10) },
  { id: "doc", label: "Documento", tipo: "texto", valor: (m) => m.doc },
  { id: "entra", label: "Entra", tipo: "rango", numero: (m) => (m.entra > 0 ? m.entra : null), unidad: "m³", paso: 0.0001 },
  { id: "sale", label: "Sale", tipo: "rango", numero: (m) => (m.sale > 0 ? m.sale : null), unidad: "m³", paso: 0.0001 },
];

const ORDEN: Record<string, AccesorOrden<MovimientoKardex>> = {
  fecha: { valor: (m) => m.fecha.slice(0, 10) },
  doc: { valor: (m) => m.doc, texto: true },
  entra: { valor: (m) => (m.entra > 0 ? m.entra : null) },
  sale: { valor: (m) => (m.sale > 0 ? m.sale : null) },
};

export default function CtpKardexTabla({
  movimientos,
  ingresoTotal,
  consumoTotal,
  saldo,
  vacio,
  excel,
}: {
  movimientos: MovimientoKardex[];
  ingresoTotal: number;
  consumoTotal: number;
  saldo: number;
  vacio: string;
  excel: string;
}) {
  const f = useFiltrosTabla(movimientos, COLUMNAS);
  const ord = useOrdenColumna(ORDEN);
  const filas = ord.ordenar(f.filtradas);
  const rojo = (v: number) => (v < 0 ? "text-[var(--data-error-ink)]" : "text-[var(--text-primary)]");
  return (
    <div className="min-w-0 space-y-2">
      <BarraFiltrosTabla f={f} excel={excel} />
      <div className="overflow-x-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <DataTable className="w-full">
          <thead>
            <tr>
              <ThColumna label="Fecha" ids={["fecha"]} f={f} orden={ord} ordenId="fecha" className="align-top" />
              <ThColumna label="Documento" ids={["doc"]} f={f} orden={ord} ordenId="doc" className="align-top" />
              <ThColumna label="Entra" ids={["entra"]} f={f} derecha orden={ord} ordenId="entra" className="align-top" />
              <ThColumna label="Sale" ids={["sale"]} f={f} derecha orden={ord} ordenId="sale" className="align-top" />
              <ThColumna label="Saldo" derecha className="align-top" />
            </tr>
          </thead>
          <tbody>
            {movimientos.length > 0 && filas.length === 0 && <SinCoincidenciasFila colSpan={5} />}
            {filas.map((m, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap text-[var(--text-secondary)]">{fmtDate(m.fecha)}</td>
                <td>
                  <span className="inline-flex items-center gap-1.5 text-[var(--text-primary)]">
                    {m.tipo === "ingreso" ? (
                      <ArrowUpRight className="h-3.5 w-3.5 text-[var(--data-success-ink)]" aria-hidden />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5 text-[var(--data-warning-ink)]" aria-hidden />
                    )}
                    {m.doc}
                  </span>
                </td>
                <td className="text-right font-mono tabular-nums text-[var(--data-success-ink)]">{m.entra > 0 ? n4(m.entra) : "—"}</td>
                <td className="text-right font-mono tabular-nums text-[var(--data-warning-ink)]">{m.sale > 0 ? n4(m.sale) : "—"}</td>
                <td className="text-right">
                  <span className={`font-mono font-bold tabular-nums ${rojo(m.saldo)}`}>{n4(m.saldo)}</span>
                </td>
              </tr>
            ))}
          </tbody>
          {movimientos.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] font-bold">
                <td colSpan={2}>{f.activos > 0 ? "Totales de todo el kardex" : "Totales"}</td>
                <td className="text-right font-mono tabular-nums text-[var(--data-success-ink)]">{n4(ingresoTotal)}</td>
                <td className="text-right font-mono tabular-nums text-[var(--data-warning-ink)]">{n4(consumoTotal)}</td>
                <td className="text-right">
                  <span className={`font-mono tabular-nums ${rojo(saldo)}`}>{n4(saldo)}</span>
                </td>
              </tr>
            </tfoot>
          )}
        </DataTable>
        {movimientos.length === 0 && <div className="p-8 text-center text-sm text-[var(--text-tertiary)]">{vacio}</div>}
      </div>
    </div>
  );
}
