"use client";

import { Fragment } from "react";
import { DataTable } from "@buleje/design-system";
import { ChevronDown } from "@buleje/design-system/icons";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import { diaCorto } from "@/lib/compras/ciclo-oc";
import type { EstadoConciliacion, FilaConciliacion } from "@/lib/compras/conciliacion";
import { cn, formatCurrency } from "@/lib/utils";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna, type AccesorOrden } from "@/components/admin/cuentas-por-pagar/use-orden-columna";
import DetalleConciliacion from "./DetalleConciliacion";

export const CHIP_ESTADO: Record<EstadoConciliacion, { texto: string; clase: string }> = {
  revisar: { texto: "Por revisar", clase: "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]" },
  "sin-comparar": { texto: "Sin comparar", clase: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
  "en-curso": { texto: "En curso", clase: "bg-[var(--data-info-50)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]" },
  cuadra: { texto: "Cuadra", clase: "bg-primary/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" },
};

const TIPO_SUELTO: Record<FilaConciliacion["tipo"], string | null> = { orden: null, cuenta: "Cuenta sin orden", recepcion: "Llegó sin orden" };

/** Filtros de columna: las filas llegan todas del servidor (un período), no se paginan. */
const COLUMNAS: readonly ColumnaFiltro<FilaConciliacion>[] = [
  { id: "orden", label: "Orden o documento", tipo: "texto", valor: (f) => [f.codigo, f.documento ?? ""] },
  { id: "proveedor", label: "Proveedor", tipo: "multi", valor: (f) => f.proveedor || "Sin proveedor" },
  { id: "pedido", label: "Pedido", tipo: "rango", numero: (f) => f.pedido?.monto ?? null, unidad: "S/", paso: 0.01 },
  { id: "llego", label: "Llegó y se aceptó", tipo: "rango", numero: (f) => f.llego?.valor ?? null, unidad: "S/", paso: 0.01 },
  { id: "factura", label: "Factura y cuenta", tipo: "texto", valor: (f) => [f.documento ?? "", f.cuenta?.texto ?? ""] },
  { id: "estado", label: "Estado", tipo: "multi", valor: (f) => CHIP_ESTADO[f.estado].texto },
];

const ORDEN: Record<string, AccesorOrden<FilaConciliacion>> = {
  orden: { valor: (f) => f.codigo, texto: true },
  pedido: { valor: (f) => f.pedido?.monto ?? null },
  llego: { valor: (f) => f.llego?.valor ?? null },
  factura: { valor: (f) => f.documento, texto: true },
  estado: { valor: (f) => CHIP_ESTADO[f.estado].texto, texto: true },
};

/** La diferencia que se ve en la fila: la primera que pide acción; si no hay, la primera nota. */
function principal(f: FilaConciliacion) {
  return f.diferencias.find((d) => d.tono === "alerta") ?? f.diferencias.find((d) => d.tono === "aviso") ?? f.diferencias[0] ?? null;
}

/**
 * Una fila por orden (o por papel suelto): lo pedido, lo que llegó y se
 * aceptó, la factura y la cuenta, y qué no cuadra. «Ver» abre debajo el
 * detalle con el origen de cada diferencia. Las cifras vienen del servidor.
 * A 400 px la tabla pasa a tarjetas sola (`useMobileTableCards` del panel).
 */
export default function TablaConciliacion({ filas, abierta, setAbierta, onVerCuenta, onVincular }: {
  filas: FilaConciliacion[];
  abierta: string | null;
  setAbierta: (id: string | null) => void;
  onVerCuenta: (cuentaId: string) => void;
  onVincular: (cuentaId: string) => void;
}) {
  const fil = useFiltrosTabla(filas, COLUMNAS);
  const ord = useOrdenColumna(ORDEN);
  const vistas = ord.ordenar(fil.filtradas);
  return (
    <>
    <BarraFiltrosTabla f={fil} />
    <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <DataTable wrapperClassName="overflow-visible rounded-none border-0" className="w-full">
        <thead>
          <tr>
            <ThColumna label="Orden o documento" ids={["orden", "proveedor"]} f={fil} orden={ord} ordenId="orden" />
            <ThColumna label="Pedido" ids={["pedido"]} f={fil} derecha orden={ord} ordenId="pedido" />
            <ThColumna label="Llegó y se aceptó" ids={["llego"]} f={fil} derecha orden={ord} ordenId="llego" />
            <ThColumna label="Factura y cuenta" ids={["factura"]} f={fil} orden={ord} ordenId="factura" />
            <ThColumna label="Qué no cuadra" ids={["estado"]} f={fil} orden={ord} ordenId="estado" />
            <th className="text-right" data-label="Detalle"><span className="sr-only">Detalle</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--rule-soft)]">
          {vistas.length === 0 && <SinCoincidenciasFila colSpan={6} />}
          {vistas.map((f) => {
            const chip = CHIP_ESTADO[f.estado];
            const dif = principal(f);
            const otras = f.diferencias.filter((d) => d !== dif && d.tono !== "info").length;
            const suelto = TIPO_SUELTO[f.tipo];
            const abiertaEsta = abierta === f.id;
            const idDetalle = `conciliacion-${f.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
            return (
              <Fragment key={f.id}>
                <tr data-conciliacion={f.id}>
                  <td className="align-top">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--text-primary)]">
                        {f.codigo}
                        {suelto && <span className="ml-2 inline-flex rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-sm font-semibold text-[var(--text-secondary)]">{suelto}</span>}
                      </p>
                      <p className="text-sm text-[var(--text-secondary)]">
                        <EnlacePanel cosa="proveedor" id={f.proveedorId} apariencia="heredada">{f.proveedor || "Sin proveedor"}</EnlacePanel>
                        {f.fecha && <> · {diaCorto(f.fecha)}</>}
                      </p>
                    </div>
                  </td>
                  <td className="text-right align-top tabular-nums">
                    {f.pedido ? (
                      <div className="min-w-0">
                        <p className="whitespace-nowrap font-semibold text-[var(--text-primary)]">{formatCurrency(f.pedido.monto)}</p>
                        <p className="text-sm text-[var(--text-secondary)]">{f.pedido.unidades} unid.</p>
                      </div>
                    ) : <span className="text-[var(--text-secondary)]">—</span>}
                  </td>
                  <td className="text-right align-top tabular-nums">
                    {f.llego && (f.llego.recepciones > 0 || f.llego.unidades > 0) ? (
                      <div className="min-w-0">
                        <p className="whitespace-nowrap font-semibold text-[var(--text-primary)]">{f.llego.valor != null ? formatCurrency(f.llego.valor) : `${f.llego.unidades} unid.`}</p>
                        <p className="text-sm text-[var(--text-secondary)]">
                          {f.pedido ? `${f.llego.aceptadas} de ${f.pedido.unidades} unid.` : `en ${f.llego.recepciones} recepción`}
                        </p>
                      </div>
                    ) : <span className="text-sm text-[var(--text-secondary)]">{f.tipo === "cuenta" ? "—" : "Sin recepción"}</span>}
                  </td>
                  <td className="align-top">
                    <div className="min-w-0">
                      <p className={cn("text-sm", f.documento ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]")}>
                        {f.documento ?? (f.sinComprobante ? "Sin comprobante" : "Sin factura")}
                      </p>
                      <p className="text-sm tabular-nums text-[var(--text-secondary)]">
                        {f.cuenta ? <>Cuenta {formatCurrency(f.cuenta.monto)} · pagaste {formatCurrency(f.cuenta.pagado)}</> : "Sin cuenta por pagar"}
                      </p>
                    </div>
                  </td>
                  <td className="align-top">
                    <div className="min-w-0 max-w-sm">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-sm font-semibold", chip.clase)}>{chip.texto}</span>
                      {dif && <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">{dif.texto}</p>}
                      {otras > 0 && <p className="text-sm font-semibold text-[var(--text-secondary)]">y {otras} más</p>}
                    </div>
                  </td>
                  <td className="text-right align-top">
                    <button
                      type="button"
                      onClick={() => setAbierta(abiertaEsta ? null : f.id)}
                      aria-expanded={abiertaEsta}
                      aria-controls={idDetalle}
                      className="inline-flex h-12 items-center gap-1 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
                    >
                      Ver <ChevronDown className={cn("h-4 w-4 transition-transform", abiertaEsta && "rotate-180")} aria-hidden />
                    </button>
                  </td>
                </tr>
                {abiertaEsta && (
                  <tr id={idDetalle}>
                    <td colSpan={6} data-label="">
                      <DetalleConciliacion fila={f} onVerCuenta={onVerCuenta} onVincular={onVincular} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </DataTable>
    </div>
    </>
  );
}
