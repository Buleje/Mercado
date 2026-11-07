"use client";

import { Fragment } from "react";
import { DataTable } from "@buleje/design-system";
import { Package } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import VenceLoteCampo from "@/components/admin/compras/VenceLoteCampo";
import type { ControlDeLinea } from "@/lib/compras/conformidad-recepcion";
import ConformidadDeLinea from "@/components/admin/ordenes-compra/recepciones/ConformidadDeLinea";
import AceptacionDeLinea from "@/components/admin/ordenes-compra/recepciones/AceptacionDeLinea";
import { listarCorto } from "@/lib/compras/ciclo-oc";
import { CONDICIONES, type CondicionItem, type ReceivedItem } from "./oc-recepcion-tipos";
import { Casilla } from "@/components/ui-system/Casilla";

/** Paso 1 de «Recibir la orden»: contar lo que llegó, cómo llegó, vence y conformidad. */
export default function OCRecepcionPaso1({ completos, receivedItems, controles, faltaC22, error, setError, updateItem }: {
  /** Lo que ya llegó entero en recepciones anteriores: no se vuelve a contar. */
  completos: Array<{ nombre: string }>;
  receivedItems: ReceivedItem[];
  controles: ControlDeLinea[];
  faltaC22: string | null;
  error: string | null;
  setError: (e: string | null) => void;
  updateItem: (idx: number, patch: Partial<ReceivedItem>) => void;
}) {
  return (
    <>
      <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-2">
        <Package className="h-4 w-4 text-primary" />
        Cuenta lo que llegó
      </p>
      {completos.length > 0 && (
        <p className="text-sm text-[var(--text-secondary)]" data-qa="recepcion-completos">
          Ya llegó todo de {listarCorto(completos.map((l) => l.nombre))}: no se vuelve a contar.
        </p>
      )}
      {receivedItems.length === 0 && (
        <p className="text-sm font-semibold text-[var(--data-success-ink)]">
          Ya llegó todo lo pedido. Si la orden sigue abierta, ciérrala desde «⋯» › Estado.
        </p>
      )}
      <div className="overflow-x-auto">
        <DataTable className="w-full">
          <thead>
            <tr>
              <th>Producto</th>
              <th className="text-center">{completos.length > 0 || receivedItems.some((i) => i.yaLlego > 0) ? "Falta" : "Pedido"}</th>
              <th className="text-center">Recibido</th>
              <th className="text-center">Dif.</th>
              <th className="text-center">Cómo llegó</th>
              <th className="text-center">No llegó</th>
            </tr>
          </thead>
          <tbody>
            {receivedItems.map((item, idx) => {
              const diff = item.receivedQty - item.orderedQty;
              return (
                <Fragment key={item.productId}>
                <tr className={cn(!item.noLlego && item.condition === "ok" && item.receivedQty > 0 ? "" : "border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]/50")}>
                  <td className="font-semibold">
                    {item.name}
                  </td>
                  <td className="text-center text-[var(--text-secondary)] dark:text-muted">
                    {item.orderedQty} {item.unit}
                    {item.yaLlego > 0 && (
                      <span className="block text-xs">ya llegó {item.yaLlego} de {item.pedidoTotal}</span>
                    )}
                  </td>
                  <td className="text-center">
                    <input
                      type="number"
                      min={0}
                      max={item.orderedQty}
                      value={item.receivedQty}
                      onChange={(e) => {
                        const val = Math.max(0, parseInt(e.target.value) || 0);
                        if (val > item.orderedQty) {
                          setError(
                            `«${item.name}»: ${item.yaLlego > 0 ? `ya llegaron ${item.yaLlego} de ${item.pedidoTotal}, faltan` : "pediste"} ${item.orderedQty}. ` +
                            "Si el proveedor mandó de más, anótalo en la nota del paso 3: lo de más no entra por esta orden.",
                          );
                          return;
                        }
                        setError(null);
                        updateItem(idx, { receivedQty: val, noLlego: false });
                      }}
                      aria-label={`Cantidad recibida de ${item.name}`}
                      className="w-16 text-center border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl px-2 py-1 text-sm font-bold bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
                      disabled={item.noLlego}
                    />
                  </td>
                  <td className="text-center">
                    {diff !== 0 && (
                      <span className={cn("text-sm font-bold", diff < 0 ? "text-[var(--data-error-ink)]" : "text-[var(--data-success-ink)]")}>
                        {diff < 0 ? `Faltaron ${Math.abs(diff)}` : `+${diff}`}
                      </span>
                    )}
                  </td>
                  {/* Lo dañado o vencido llegó, pero no se puede
                      vender: el backend lo registra como merma en vez
                      de sumarlo al stock. */}
                  <td className="text-center">
                    <label className="sr-only" htmlFor={`cond-${item.productId}`}>
                      Cómo llegó {item.name}
                    </label>
                    <select
                      id={`cond-${item.productId}`}
                      value={item.condition}
                      disabled={item.noLlego}
                      onChange={(e) => updateItem(idx, { condition: e.target.value as CondicionItem })}
                      className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 py-1 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-primary disabled:opacity-50"
                    >
                      {CONDICIONES.map((c) => (
                        <option key={c.v} value={c.v}>{c.l}</option>
                      ))}
                    </select>
                  </td>
                  <td className="text-center">
                    <Casilla
                      checked={item.noLlego}
                      onChange={(e) => updateItem(idx, { noLlego: e.target.checked })}
                     
                      aria-label={`${item.name} no llegó`} />
                  </td>
                </tr>
                {!item.noLlego && item.condition === "ok" && item.receivedQty > 0 && (
                  <tr>
                    <td colSpan={6} className="pb-2">
                      <ConformidadDeLinea
                        id={`oc-conf-${item.productId}`}
                        control={controles[idx]}
                        fila={item}
                        onChange={(patch) => updateItem(idx, patch)}
                      />
                      {controles[idx] !== "servicio" && (
                        <AceptacionDeLinea id={`oc-acep-${item.productId}`} fila={{ ...item, product: item.name }} onChange={(patch) => updateItem(idx, patch)} />
                      )}
                      {controles[idx] !== "servicio" && <VenceLoteCampo
                        id={`oc-vence-${item.productId}`}
                        producto={item.name}
                        valor={item}
                        ayuda={idx === 0}
                        onChange={(patch) => updateItem(idx, patch)}
                      />}
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </DataTable>
      </div>
      {faltaC22 && <p className="text-sm font-semibold text-[var(--data-warning-ink)]">{faltaC22}</p>}
      {error && <p role="alert" className="text-sm font-semibold text-[var(--data-error-ink)]">{error}</p>}
    </>
  );
}
