"use client";

/**
 * La hoja de recojo en papel: primero lo que hay que juntar sumado por
 * producto (en el orden del almacén), con su casilla para tachar; después,
 * pedido por pedido, para armar cada bolsa. Sin teléfono, dirección ni plata:
 * es la hoja que queda en el almacén.
 *
 * Se monta sólo al tocar «Imprimir»: abre el diálogo de impresión y se
 * desmonta al cerrarlo. Un solo portal de impresión por vez (la receta de
 * `imprimir-pedidos.ts` esconde todo lo demás del `<body>`).
 */

import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { DataTable } from "@buleje/design-system";
import { usePanelTokens } from "@/components/admin/shared/use-panel-tokens";
import { cssImpresion, horaDeCorte, imprimirEnClaro, nombreDelPdf } from "@/components/admin/OrdersTab/imprimir-pedidos";
import { diaRelativo, textoFranja } from "@/lib/pedidos/franja-entrega";
import { consolidarPorProducto, numeroPedido, preparadaDe, type PedidoPrep } from "@/lib/pedidos/preparacion";

const ID_HOJA = "pedidos-hoja-recojo";
const CSS = cssImpresion(ID_HOJA);
const CASILLA = "inline-block h-3.5 w-3.5 shrink-0 border border-[var(--rule-strong)] align-middle";

export function HojaPreparacion({ pedidos, onCerrar }: { pedidos: readonly PedidoPrep[]; onCerrar: () => void }) {
  const tokens = usePanelTokens(true);
  const corte = useMemo(() => new Date(), []);
  const productos = useMemo(() => consolidarPorProducto(pedidos), [pedidos]);
  /* StrictMode corre el efecto dos veces en desarrollo: un solo diálogo. */
  const impreso = useRef(false);
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;

  useEffect(() => {
    if (impreso.current) return;
    impreso.current = true;
    imprimirEnClaro(nombreDelPdf("recojo", corte), () => cerrar.current());
  }, [corte]);

  return createPortal(
    <div id={ID_HOJA} className="hidden text-xs text-[var(--text-primary)] print:block" style={tokens} aria-hidden>
      <style>{CSS}</style>
      <div className="mb-3 flex items-end justify-between gap-4 border-b border-[var(--rule-strong)] pb-2">
        <div className="text-base font-bold">Hoja de recojo · Pedidos por preparar</div>
        <div className="shrink-0 text-right">
          <div className="font-bold">Corte: {horaDeCorte(corte)}</div>
          <div>
            {pedidos.length} {pedidos.length === 1 ? "pedido" : "pedidos"} · {productos.length} {productos.length === 1 ? "producto" : "productos"}
          </div>
        </div>
      </div>

      <div className="mb-1 text-sm font-bold">Por producto</div>
      <DataTable className="mb-4 w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="w-6" />
            <th>Producto</th>
            <th className="text-right">Juntar</th>
            <th className="text-right">Ya juntado</th>
            <th>De qué pedidos</th>
          </tr>
        </thead>
        <tbody>
          {productos.map((f) => (
            <tr key={f.clave} className="break-inside-avoid">
              <td><span className={CASILLA} /></td>
              <td>
                <b>{f.nombre}</b>
                {f.categoria && <span className="block">{f.categoria}</span>}
              </td>
              <td className="text-right font-bold tabular-nums">{f.total} {f.unidad}</td>
              <td className="text-right tabular-nums">{f.juntado > 0 ? f.juntado : ""}</td>
              <td>{f.pedidos.map((x) => `${numeroPedido(x.id)} ×${x.cantidad}`).join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      <div className="mb-1 text-sm font-bold">Por pedido</div>
      <div className="grid grid-cols-2 gap-3">
        {pedidos.map((p) => (
          <div key={p.id} className="break-inside-avoid border border-[var(--rule-base)] p-2">
            <div className="mb-1 flex justify-between gap-2 border-b border-[var(--rule-soft)] pb-1">
              <b>
                <span className="font-mono">{numeroPedido(p.id)}</span> · {p.cliente}
              </b>
              <span className="shrink-0">Bultos: ____</span>
            </div>
            {p.entrega && (
              <div className="mb-1">
                Entrega: {diaRelativo(p.entrega.fecha, corte)} · {textoFranja(p.entrega.franja)}
              </div>
            )}
            {p.lineas.map((l) => (
              <div key={l.itemId} className="flex items-start gap-2 py-0.5">
                <span className={CASILLA} />
                <span>
                  <b className="tabular-nums">{l.cantidad} {l.unidad}</b> {l.nombre}
                  {l.detalle && ` (${l.detalle})`}
                  {preparadaDe(p, l) > 0 && preparadaDe(p, l) < l.cantidad && ` · ya ${preparadaDe(p, l)}`}
                </span>
              </div>
            ))}
            {p.notas && <div className="mt-1 italic">Nota: {p.notas}</div>}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
