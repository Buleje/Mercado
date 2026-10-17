"use client";

import { useCallback } from "react";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { formatCurrency } from "@/lib/format";
import { vistaPreviaCredito, type ItemRecepcion, type LineaOc } from "@/lib/compras/credito-recepcion";

/** La orden elegida en Recepción, tal como la trae `/api/purchases`. */
export type OcDeLaRecepcion = {
  total?: number;
  items?: Array<{ productId?: number; name?: string; quantity?: number; unitCost?: number }>;
};

const MOTIVO = { "dañado": "dañado", vencido: "vencido", faltante: "faltante (no llegará)" } as const;

/** El texto del aviso: qué se descuenta, por qué y qué no tiene vuelta. */
export function textoConfirmarCredito(oc: OcDeLaRecepcion, proveedor: string, items: ItemRecepcion[]) {
  const ocItems: LineaOc[] = (oc.items ?? []).flatMap((i) =>
    typeof i.productId === "number"
      ? [{ productId: i.productId, name: i.name ?? "", quantity: Number(i.quantity ?? 0), unitCost: i.unitCost }]
      : [],
  );
  const previa = vistaPreviaCredito(ocItems, oc.total, items);
  if (previa.total <= 0) return null;
  const lineas = previa.lineas.map((l) => `· ${l.unidades} ${l.nombre} ${MOTIVO[l.motivo]}: ${formatCurrency(l.monto)}`);
  const hayFaltante = previa.lineas.some((l) => l.motivo === "faltante");
  return {
    title: `¿Le descuentas hasta ${formatCurrency(previa.total)} a ${proveedor || "el proveedor"}?`,
    description: [
      ...lineas,
      "",
      "Se baja de lo que le debes por esta orden; si ya le pagaste, queda como reclamo (te deben).",
      ...(hayFaltante
        ? ["Lo faltante cierra esa línea de la orden: ya no lo vas a esperar. Si llega en otro viaje, márcalo «OK» con lo que llegó."]
        : []),
      "No se puede deshacer.",
    ].join("\n"),
  };
}

/**
 * Antes de guardar una recepción con algo dañado, vencido o faltante. Esas
 * unidades se BAJAN de la cuenta por pagar (y lo faltante cierra la línea de la
 * orden), sin forma de deshacerlo: se dice el monto y se pide el sí.
 * Sin orden elegida no hay monto que mostrar y no se pregunta.
 */
export function useConfirmarCreditoRecepcion() {
  const { confirm } = useConfirm();
  return useCallback(
    async (oc: OcDeLaRecepcion | undefined, proveedor: string, items: ItemRecepcion[]): Promise<boolean> => {
      if (!oc || !items.some((i) => i.condition !== "ok")) return true;
      const texto = textoConfirmarCredito(oc, proveedor, items);
      if (!texto) return true;
      return confirm({ ...texto, intent: "warning", confirmLabel: "Guardar y descontar", cancelLabel: "Revisar" });
    },
    [confirm],
  );
}
