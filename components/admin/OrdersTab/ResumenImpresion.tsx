"use client";

/**
 * Lo que sale en papel al imprimir la lista de Pedidos: los pedidos en marcha
 * que pasan los filtros, en el orden de la Lista. En pantalla no se ve.
 *
 * 17-10 (P12, «lo impreso corresponde al filtro visible y no expone teléfono
 * o dirección en copias que no los necesitan»):
 *  - encabezado con la hora de corte (Lima), la vista y los filtros puestos
 *    en palabras, y cuántos pedidos;
 *  - dos versiones: «Para preparar» (sin teléfono ni dirección: la hoja que
 *    queda en el almacén) y «Para repartir» (con teléfono, dirección, quién
 *    lo lleva y qué cobrar);
 *  - portal hijo de `<body>` (`imprimir-pedidos.ts`): antes iba dentro del
 *    panel con `print-orders-summary` y se encimaba con `#print-content`.
 *    Quien lo monta lo desmonta mientras están abiertos los tickets.
 * Se fue la suma de totales de la hoja: era un total calculado en el cliente.
 */
import { useEffect, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { DataTable } from "@buleje/design-system";
import { usePanelTokens } from "@/components/admin/shared/use-panel-tokens";
import { formatCurrency } from "@/lib/format";
import type { DbOrder } from "@/lib/jsondb";
import { cssImpresion, horaDeCorte } from "./imprimir-pedidos";
import { cobroDe, responsableDe } from "./siguiente-paso";
import { STATUS_LABELS } from "./types";

export type VarianteImpresion = "preparar" | "repartir";

export const NOMBRE_VARIANTE: Record<VarianteImpresion, string> = {
  preparar: "Para preparar",
  repartir: "Para repartir",
};

export const ID_HOJA_PEDIDOS = "pedidos-hoja-lista";
const CSS = cssImpresion(ID_HOJA_PEDIDOS, "size: A4 landscape; margin: 10mm");
const TH = "border-b border-[var(--rule-strong)] py-1 pr-2 text-left align-bottom";
const TD = "py-1.5 pr-2 align-top";

interface Props {
  /** Ya filtrados y en el orden de la Lista. */
  pedidos: readonly DbOrder[];
  variante: VarianteImpresion;
  /** Los filtros puestos, en palabras (`filtrosEnTexto`). Vacío = todos. */
  filtros: readonly string[];
  vista: string | null;
  negocio: string;
}

export function ResumenImpresion({ pedidos, variante, filtros, vista, negocio }: Props) {
  const tokens = usePanelTokens(true);
  const [corte, setCorte] = useState(() => new Date());
  /* Sólo en el navegador (el portal no se hidrata). */
  const [montado, setMontado] = useState(false);
  /* La hora de corte es la de imprimir, también con Ctrl+P. */
  useEffect(() => {
    setMontado(true);
    const antes = () => flushSync(() => setCorte(new Date()));
    window.addEventListener("beforeprint", antes);
    return () => window.removeEventListener("beforeprint", antes);
  }, []);

  if (!montado) return null;
  const repartir = variante === "repartir";

  return createPortal(
    <div
      id={ID_HOJA_PEDIDOS}
      className="hidden text-xs text-[var(--text-primary)] print:block"
      style={tokens}
      aria-hidden
    >
      <style>{CSS}</style>
      <div className="mb-3 flex items-end justify-between gap-4 border-b border-[var(--rule-strong)] pb-2">
        <div>
          <div className="text-base font-bold">
            {negocio} · Pedidos en marcha · {NOMBRE_VARIANTE[variante]}
          </div>
          <div>
            {vista ? `Vista: ${vista} · ` : ""}
            {filtros.length > 0 ? `Filtros: ${filtros.join(" · ")}` : "Sin filtros: todos los pedidos en marcha"}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-bold">Corte: {horaDeCorte(corte)}</div>
          <div>
            {pedidos.length} {pedidos.length === 1 ? "pedido" : "pedidos"}
          </div>
        </div>
      </div>
      <DataTable className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className={TH}>Pedido</th>
            <th className={TH}>Cliente</th>
            {repartir && <th className={TH}>Teléfono</th>}
            {repartir && <th className={TH}>Dirección</th>}
            <th className={TH}>Estado</th>
            <th className={TH}>Productos</th>
            {repartir && <th className={TH}>Lo lleva</th>}
            {repartir && <th className={TH}>Plata</th>}
            {repartir && <th className={`${TH} text-right`}>Total</th>}
          </tr>
        </thead>
        <tbody>
          {pedidos.map((o) => (
            <tr key={o.id} className="border-b border-[var(--rule-base)] break-inside-avoid">
              <td className={`${TD} font-mono font-bold`}>#{o.id.slice(-6)}</td>
              <td className={TD}>{o.customer.name}</td>
              {repartir && <td className={`${TD} font-mono`}>{o.customer.phone || "—"}</td>}
              {repartir && (
                <td className={TD}>
                  {o.customer.location || "—"}
                  {o.customer.reference && <span className="block">Ref.: {o.customer.reference}</span>}
                </td>
              )}
              <td className={TD}>{STATUS_LABELS[o.status]}</td>
              <td className={TD}>
                {o.items.map((i, n) => (
                  <span key={`${i.name}-${n}`} className="block">
                    <b>{i.quantity}×</b> {i.name}
                  </span>
                ))}
                {o.notes && <span className="block italic">Nota: {o.notes}</span>}
              </td>
              {repartir && <td className={TD}>{responsableDe(o) || "—"}</td>}
              {repartir && <td className={TD}>{cobroDe(o).texto}</td>}
              {repartir && (
                <td className={`${TD} text-right font-semibold tabular-nums`}>
                  {formatCurrency(Number(o.total))}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>,
    document.body,
  );
}
