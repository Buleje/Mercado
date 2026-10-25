"use client";

/**
 * Las diferencias de la conciliación (N08): pedidos sin comprobante,
 * comprobantes sin pedido, pedidos borrados o cancelados con comprobante
 * vigente e importes que no cuadran. Cada fila abre su expediente.
 */
import { CardTitle, DataTable } from "@buleje/design-system";
import { FolderOpen } from "@buleje/design-system/icons";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna, type AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { textoFecha } from "@/lib/comprobantes/periodo";
import { diaDeVigencia } from "@/lib/cotizaciones/vigencia";
import type { Conciliacion, Diferencia, TipoDiferencia } from "@/lib/comprobantes/conciliacion";
import { abrirExpediente } from "../expediente/expediente-url";
import { fmt } from "../tipos";

export const ROTULO_DIFERENCIA: Record<TipoDiferencia, string> = {
  "pedido-sin-comprobante": "Entregado sin comprobante",
  "comprobante-sin-operacion": "Comprobante sin pedido",
  "pedido-inexistente": "Su pedido ya no está",
  "cancelado-con-comprobante": "Cancelado con comprobante vigente",
  "importe-distinto": "Importe distinto",
};

const refDe = (d: Diferencia) => d.documento ?? (d.operacion ? `#${d.operacion.slice(-6)}` : null);

/** Filtros de columna sobre las diferencias que llegaron (el «qué pasa» ya se filtra con los chips de arriba). */
const COLUMNAS: readonly ColumnaFiltro<Diferencia>[] = [
  { id: "documento", label: "Documento", tipo: "texto", valor: (d) => refDe(d) },
  { id: "cliente", label: "Cliente", tipo: "texto", valor: (d) => d.cliente || null },
  { id: "comprobante", label: "Comprobante", tipo: "rango", numero: (d) => d.importeDocumento, unidad: "S/", paso: 0.01 },
  { id: "pedido", label: "Pedido", tipo: "rango", numero: (d) => d.importeOperacion, unidad: "S/", paso: 0.01 },
  { id: "fecha", label: "Fecha", tipo: "fecha", numero: (d) => diaDeVigencia(d.fecha) },
];

const ORDEN: Record<string, AccesorOrden<Diferencia>> = {
  tipo: { valor: (d) => ROTULO_DIFERENCIA[d.tipo], texto: true },
  documento: { valor: (d) => refDe(d), texto: true },
  cliente: { valor: (d) => d.cliente, texto: true },
  comprobante: { valor: (d) => d.importeDocumento },
  pedido: { valor: (d) => d.importeOperacion },
  fecha: { valor: (d) => diaDeVigencia(d.fecha) },
};

const CHIP_FILTRO = "inline-flex h-12 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors";

interface Props {
  c: Conciliacion;
  tipo: TipoDiferencia | null;
  onTipo: (t: TipoDiferencia | null) => void;
}

export function ConciliacionDiferencias({ c, tipo, onTipo }: Props) {
  const tipos = (Object.keys(c.porTipoDiferencia) as TipoDiferencia[]).filter((t) => (c.porTipoDiferencia[t] ?? 0) > 0);
  const porTipo = tipo ? c.diferencias.filter((d) => d.tipo === tipo) : c.diferencias;
  const f = useFiltrosTabla(porTipo, COLUMNAS);
  const ord = useOrdenColumna(ORDEN);
  const filas = ord.ordenar(f.filtradas);
  const recortado = c.totalDiferencias > c.diferencias.length;
  const claseChip = (activo: boolean) =>
    cn(CHIP_FILTRO, activo ? "border-primary bg-primary/10 text-[var(--text-primary)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]");

  return (
    <section aria-labelledby="conc-diferencias" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle id="conc-diferencias">Diferencias</CardTitle>
        <InfoTip
          what="Lo que no cuadra entre lo vendido y lo facturado en el período. Ábrelo para ver el expediente de la operación y qué falta para cerrarla."
          example="Pedido #a1b2c3 cancelado con su boleta B001-12 vigente → corresponde una nota de crédito."
        />
        <span className="text-sm tabular-nums text-[var(--text-secondary)]">
          {c.totalDiferencias === 0 ? "Ninguna" : `${c.totalDiferencias} en total${recortado ? ` · se muestran las ${c.diferencias.length} más recientes` : ""}`}
        </span>
      </div>

      {tipos.length > 0 && (
        <div role="group" aria-label="Filtrar diferencias" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={tipo === null} onClick={() => onTipo(null)} className={claseChip(tipo === null)}>
            Todas <span className="tabular-nums">{c.totalDiferencias}</span>
          </button>
          {tipos.map((t) => (
            <button key={t} type="button" aria-pressed={tipo === t} onClick={() => onTipo(tipo === t ? null : t)} className={claseChip(tipo === t)}>
              {ROTULO_DIFERENCIA[t]} <span className="tabular-nums">{c.porTipoDiferencia[t]}</span>
            </button>
          ))}
        </div>
      )}

      {porTipo.length > 0 && <BarraFiltrosTabla f={f} />}

      {porTipo.length > 0 && (
        <DataTable className="min-w-[720px]">
          <thead>
            <tr>
              <ThColumna label="Qué pasa" className="align-top" f={f} orden={ord} ordenId="tipo" />
              <ThColumna label="Documento" ids={["documento"]} f={f} orden={ord} ordenId="documento" />
              <ThColumna label="Cliente" ids={["cliente"]} f={f} orden={ord} ordenId="cliente" />
              <ThColumna label="Comprobante" ids={["comprobante"]} f={f} orden={ord} ordenId="comprobante" />
              <ThColumna label="Pedido" ids={["pedido"]} f={f} orden={ord} ordenId="pedido" />
              <ThColumna label="Fecha" ids={["fecha"]} f={f} orden={ord} ordenId="fecha" />
              <th>
                <span className="sr-only">Expediente</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <SinCoincidenciasFila colSpan={7} />}
            {filas.map((d) => {
              const ref = d.operacion ?? d.documento;
              return (
                <tr key={d.id} data-qa={`diferencia-${d.tipo}`}>
                  <td>
                    <span className="font-semibold text-[var(--text-primary)]">{ROTULO_DIFERENCIA[d.tipo]}</span>
                    <p className="text-sm text-[var(--text-secondary)]">{d.explicacion}</p>
                  </td>
                  <td className="font-mono">{d.documento ?? (d.operacion ? `#${d.operacion.slice(-6)}` : "—")}</td>
                  <td>{d.cliente || "—"}</td>
                  <td className="tabular-nums">{d.importeDocumento == null ? "—" : fmt(d.importeDocumento)}</td>
                  <td className="tabular-nums">{d.importeOperacion == null ? "—" : fmt(d.importeOperacion)}</td>
                  <td className="whitespace-nowrap text-[var(--text-secondary)]">{textoFecha(d.fecha)}</td>
                  <td>
                    {ref && (
                      <button
                        type="button"
                        onClick={() => abrirExpediente(ref.split(",")[0]?.trim() ?? ref)}
                        aria-label={`Expediente de ${d.documento ?? d.cliente}`}
                        title="Ver el expediente"
                        className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-primary hover:bg-[var(--surface-sunken)]"
                      >
                        <FolderOpen className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </section>
  );
}
