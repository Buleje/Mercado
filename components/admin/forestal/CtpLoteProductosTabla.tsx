"use client";

/**
 * Tabla de «Qué salió de un lote»: producto por producto, con su destino.
 * Con más de 3 corridas cada columna filtra y ordena desde su encabezado.
 */

import { DataTable } from "@buleje/design-system";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import {
  AYUDA_DESTINO,
  ETIQUETA_DESTINO,
  type DestinoProducto,
  type ProductoDeLote,
} from "@/lib/forestal/productos-de-lote";
import { formatDate } from "@/lib/format";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "./filtros-tabla-forestal";

const CELDA = "px-3 py-2.5 text-sm";
const CIFRA = `${CELDA} text-right font-mono tabular-nums`;

const TONO_DESTINO: Record<DestinoProducto, string> = {
  disponible:
    "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  despachado: "bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]",
  usado: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  reprocesado: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  agotado: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
};

/** «MADERA ASERRADA (COMERCIAL)» se lee a los gritos en una tabla. */
const productoLegible = (p: string | null) =>
  !p ? "—" : p.length > 3 && p === p.toUpperCase() ? p.charAt(0) + p.slice(1).toLowerCase() : p;

/**
 * ¿El motivo dice algo que la pastilla no diga ya?
 *
 * `usadoMotivo` viene «Usado» cuando nadie escribió uno: repetirlo al lado de
 * «Uso propio» ocupa lugar y no agrega información.
 */
const motivoQueAporta = (motivo: string | null) => {
  const m = (motivo ?? "").trim().toLowerCase();
  return m.length > 0 && m !== "usado" && m !== "uso propio";
};

const fmtFecha = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : formatDate(d, { soloFecha: true });
};

const COLUMNAS: readonly ColumnaFiltro<ProductoDeLote>[] = [
  { id: "producto", label: "Producto", tipo: "multi", valor: (p) => productoLegible(p.corrida.producto) },
  { id: "corrida", label: "Corrida", tipo: "texto", valor: (p) => `N° ${p.corrida.lineNo ?? ""}` },
  { id: "produjo", label: "Produjo", tipo: "rango", numero: (p) => p.corrida.producido, unidad: "m³", paso: 0.0001 },
  { id: "queda", label: "Queda", tipo: "rango", numero: (p) => p.corrida.disponible, unidad: "m³", paso: 0.0001 },
  { id: "destino", label: "En qué terminó", tipo: "multi", valor: (p) => ETIQUETA_DESTINO[p.destino] },
];

export default function CtpLoteProductosTabla({ productos, nombre }: { productos: ProductoDeLote[]; nombre: string }) {
  const f = useFiltrosTabla(productos, COLUMNAS);
  /* Con 3 corridas o menos no hay qué filtrar: el embudo sólo estorba. */
  const conFiltros = productos.length > 3;
  const th = conFiltros ? f : undefined;
  return (
    <div className="space-y-2">
      {conFiltros && <BarraFiltrosTabla f={f} sinConteo excel={nombre} />}
            {/* Lo que Brandon pidió ver: producto por producto, con su destino. */}
            <div className="max-h-[46vh] overflow-auto rounded-xl border border-[var(--rule-base)]">
              <DataTable className="w-full min-w-[40rem]">
                <thead className="sticky top-0 z-[1]">
                  <tr className="[&>th]:border-b [&>th]:border-[var(--rule-base)]">
                    <ThColumna label="Producto" ids={conFiltros ? ["producto"] : []} f={th} className={`${CELDA} align-top`} />
                    <ThColumna label="Corrida" ids={conFiltros ? ["corrida"] : []} f={th} className={`${CELDA} align-top`} />
                    <ThColumna label="Produjo" ids={conFiltros ? ["produjo"] : []} f={th} derecha className={`${CELDA} align-top`} />
                    <ThColumna label="Queda" ids={conFiltros ? ["queda"] : []} f={th} derecha className={`${CELDA} align-top`} />
                    <ThColumna label="En qué terminó" ids={conFiltros ? ["destino"] : []} f={th} className={`${CELDA} align-top`} />
                  </tr>
                </thead>
                <tbody>
                  {conFiltros && f.filtradas.length === 0 && <SinCoincidenciasFila colSpan={5} />}
                  {f.filtradas.map((p) => (
                    <tr key={p.corrida.id}>
                      <td className={CELDA}>
                        <span className="font-medium text-[var(--text-primary)]">
                          {productoLegible(p.corrida.producto)}
                        </span>
                        {p.corrida.paquetes.length > 0 && (
                          <span className="ml-1.5 text-[var(--text-tertiary)]">
                            · {p.corrida.paquetes.length} paquete
                            {p.corrida.paquetes.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </td>
                      <td className={`${CELDA} whitespace-nowrap text-[var(--text-secondary)]`}>
                        <span className="font-mono tabular-nums">N° {p.corrida.lineNo ?? "—"}</span>
                        <span className="ml-1.5 text-[var(--text-tertiary)]">
                          {fmtFecha(p.corrida.fecha)}
                        </span>
                      </td>
                      <td className={CIFRA}>{fmtM3(p.corrida.producido)}</td>
                      <td className={`${CIFRA} font-bold`}>{fmtM3(p.corrida.disponible)}</td>
                      <td className={CELDA}>
                        <span
                          title={
                            p.destino === "usado" && p.corrida.usadoMotivo
                              ? `${AYUDA_DESTINO.usado} Motivo: ${p.corrida.usadoMotivo}`
                              : AYUDA_DESTINO[p.destino]
                          }
                          className={`inline-block whitespace-nowrap rounded-lg px-2 py-0.5 text-xs font-bold ${TONO_DESTINO[p.destino]}`}
                        >
                          {ETIQUETA_DESTINO[p.destino]}
                        </span>
                        {/* El motivo sólo cuando dice algo más que la pastilla:
                            el libro guarda «Usado» como motivo por defecto, y
                            escribirlo al lado de «Uso propio» era la misma
                            palabra dos veces. */}
                        {p.destino === "usado" && motivoQueAporta(p.corrida.usadoMotivo) && (
                          <span className="ml-1.5 text-xs text-[var(--text-tertiary)]">
                            {p.corrida.usadoMotivo}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>

    </div>
  );
}
