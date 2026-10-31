"use client";

import type { ReactNode } from "react";
import { DataTable } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import TableSkeleton from "@/components/admin/shared/TableSkeleton";
import { STATUS_COLORS, STATUS_LABELS } from "@/components/admin/ordenes-compra/oc-compartido";
import { ESTADO_LABEL as DEV_LABEL, ESTADO_STYLES as DEV_COLOR } from "@/components/admin/devoluciones-proveedor/tipos";
import { STATUS_MAP as RECEPCION } from "@/components/admin/ordenes-compra/recepciones/tipos";
import { claveDeDia, diaCorto } from "@/lib/compras/ciclo-oc";
import { formatCurrency } from "@/lib/format";
import type { PurchaseStatus } from "@/lib/jsondb";
import { cn } from "@/lib/utils";
import type { FichaConPermiso } from "./use-ficha-de-proveedor";

export type QueHistorial = "ordenes" | "recepciones" | "devoluciones" | "cuentas";

const CHIP = "inline-flex items-center whitespace-nowrap rounded-full border border-transparent px-2 py-0.5 text-sm font-semibold";
const NEUTRO = "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
const MARCO = "overflow-x-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]";

const dia = (iso: string | null) => {
  const k = claveDeDia(iso);
  return k ? diaCorto(k) : "—";
};

/** La fila de arriba de cada lista: cuántas hay y, si hace falta, su ⓘ. */
function Encabezado({ children, ayuda }: { children: ReactNode; ayuda?: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5 text-sm text-[var(--text-secondary)]">
      <span>{children}</span>
      {ayuda}
    </div>
  );
}

function ChipRecepcion({ estado }: { estado: string }) {
  const e = RECEPCION[estado as keyof typeof RECEPCION];
  return <span className={cn(CHIP, e ? `${e.bg} ${e.color}` : NEUTRO)}>{e?.label ?? estado}</span>;
}

function Vacio({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-[var(--rule-base)] py-8 text-center text-sm text-[var(--text-secondary)]">{children}</p>;
}

/**
 * El historial del proveedor (C33/C39) en la sección que se elija: órdenes con
 * su comprobante, recepciones, devoluciones y lo que le debes. Cada orden abre
 * su ficha en Compras › Órdenes; nada se edita desde acá.
 */
export default function FichaHistorial({ que, ficha }: { que: QueHistorial; ficha: FichaConPermiso | null }) {
  if (!ficha) return <TableSkeleton rows={4} cols={4} className={MARCO} />;

  if (que === "ordenes") {
    const conComprobante = ficha.ordenes.filter((o) => o.comprobante).length;
    return (
      <div>
        <Encabezado
          ayuda={
            <InfoTip
              title="Cómo cuentan estas compras en tu ganancia"
              what="Lo que vendes de un producto se carga al proveedor de su última compra que llegó (orden recibida o a medias), con el costo que guardó cada venta."
              affects="Si una venta no guardó su costo se usa el costo de hoy y la cifra sale con «≈». Lo vendido sin ninguna compra recibida no se le atribuye a nadie: no hay cómo saber de quién era."
              example="Compras › Proveedores › Comparar › «Cuánto ganas con cada proveedor» muestra el período y qué parte de lo vendido tiene proveedor."
            />
          }
        >
          {ficha.ordenes.length} {ficha.ordenes.length === 1 ? "orden" : "órdenes"} · {conComprobante} con comprobante anotado
        </Encabezado>
        {ficha.ordenes.length === 0 ? (
          <Vacio>Todavía no le hiciste ninguna orden.</Vacio>
        ) : (
          <div className={MARCO}>
            <DataTable wrapperClassName="overflow-visible rounded-none border-0">
              <thead>
                <tr><th>Pedida</th><th>Estado</th><th>Llega o llegó</th><th>Comprobante</th><th className="text-right">Total</th></tr>
              </thead>
              <tbody>
                {ficha.ordenes.map((o) => (
                  <tr key={o.id}>
                    <td><EnlacePanel cosa="oc" id={o.id} title="Abrir la orden">{dia(o.creada)}</EnlacePanel></td>
                    <td><span className={cn(CHIP, STATUS_COLORS[o.estado as PurchaseStatus] ?? NEUTRO)}>{STATUS_LABELS[o.estado as PurchaseStatus] ?? o.estado}</span></td>
                    <td>{o.recibida ? dia(o.recibida) : o.prometida ? `Prometida ${dia(o.prometida)}` : <span className="text-[var(--text-tertiary)]">Sin fecha</span>}</td>
                    <td>{o.comprobante ?? <span className="text-[var(--text-tertiary)]">Sin anotar</span>}</td>
                    <td className="text-right tabular-nums">{formatCurrency(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
      </div>
    );
  }

  if (que === "recepciones") {
    return (
      <div>
        <Encabezado>{ficha.recepciones.length} {ficha.recepciones.length === 1 ? "recepción" : "recepciones"} de mercadería</Encabezado>
        {ficha.recepciones.length === 0 ? (
          <Vacio>Todavía no recibiste nada de este proveedor.</Vacio>
        ) : (
          <div className={MARCO}>
            <DataTable wrapperClassName="overflow-visible rounded-none border-0">
              <thead>
                <tr><th>Fecha</th><th>Guía o referencia</th><th>Estado</th><th>Orden</th></tr>
              </thead>
              <tbody>
                {ficha.recepciones.map((r) => (
                  <tr key={r.id}>
                    <td>{dia(r.fecha)}</td>
                    <td>{r.ref || <span className="text-[var(--text-tertiary)]">Sin referencia</span>}</td>
                    <td><ChipRecepcion estado={r.estado} /></td>
                    <td>{r.ordenId ? <EnlacePanel cosa="oc" id={r.ordenId}>Ver la orden</EnlacePanel> : <span className="text-[var(--text-tertiary)]">Sin orden</span>}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
      </div>
    );
  }

  if (que === "devoluciones") {
    const abiertas = ficha.resumen.devolucionesAbiertas;
    return (
      <div>
        <Encabezado>
          {ficha.devoluciones.length} {ficha.devoluciones.length === 1 ? "devolución" : "devoluciones"}
          {abiertas > 0 ? ` · ${abiertas} sin resolver` : ""}
        </Encabezado>
        {ficha.devoluciones.length === 0 ? (
          <Vacio>No le devolviste nada a este proveedor.</Vacio>
        ) : (
          <div className={MARCO}>
            <DataTable wrapperClassName="overflow-visible rounded-none border-0">
              <thead>
                <tr><th>Fecha</th><th>Motivo</th><th>Estado</th><th className="text-right">Productos</th><th className="text-right">Reclamas</th></tr>
              </thead>
              <tbody>
                {ficha.devoluciones.map((d) => (
                  <tr key={d.id}>
                    <td>{dia(d.creada)}</td>
                    <td className="max-w-[16rem] truncate" title={d.motivo}>{d.motivo}</td>
                    <td><span className={cn(CHIP, DEV_COLOR[d.estado as keyof typeof DEV_COLOR] ?? NEUTRO)}>{DEV_LABEL[d.estado as keyof typeof DEV_LABEL] ?? d.estado}</span></td>
                    <td className="text-right tabular-nums">{d.items}</td>
                    <td className="text-right tabular-nums">{d.monto !== null ? formatCurrency(d.monto) : <span className="text-[var(--text-tertiary)]">Sin costo</span>}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
      </div>
    );
  }

  const r = ficha.resumen;
  return (
    <div>
      <Encabezado>
        {r.cuentasAbiertas > 0
          ? `${r.cuentasAbiertas} cuenta${r.cuentasAbiertas === 1 ? "" : "s"} por pagar · saldo ${formatCurrency(r.saldo)}${r.vencido > 0 ? ` · ${formatCurrency(r.vencido)} vencido` : ""}`
          : "No le debes nada."}
      </Encabezado>
      {ficha.cuentas.length === 0 ? (
        <Vacio>No hay cuentas con este proveedor.</Vacio>
      ) : (
        <div className={MARCO}>
          <DataTable wrapperClassName="overflow-visible rounded-none border-0">
            <thead>
              <tr><th>Concepto</th><th>Vence</th><th className="text-right">Monto</th><th className="text-right">Pagaste</th><th className="text-right">Saldo</th></tr>
            </thead>
            <tbody>
              {ficha.cuentas.map((c) => (
                <tr key={c.id}>
                  <td className="max-w-[16rem] truncate" title={c.descripcion}>{c.ordenId ? <EnlacePanel cosa="oc" id={c.ordenId}>{c.descripcion || "Orden de compra"}</EnlacePanel> : c.descripcion || "Cuenta"}</td>
                  <td>{dia(c.vence)}</td>
                  <td className="text-right tabular-nums">{formatCurrency(c.monto)}</td>
                  <td className="text-right tabular-nums">{formatCurrency(c.pagado)}</td>
                  <td className={cn("text-right font-semibold tabular-nums", c.saldo > 0.005 ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]")}>{c.saldo > 0.005 ? formatCurrency(c.saldo) : "Pagada"}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      )}
    </div>
  );
}
