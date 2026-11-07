"use client";

import { Tag } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmt } from "@/components/admin/pos/pago/pago-shared";
import type { PagoModal } from "@/components/admin/pos/pago/usePagoModal";

/**
 * Bajo el total del cobro: el precio de la clienta elegida (ADR-507 en la caja).
 * «Precio revendedora · nivel 20 %» con el catálogo tachado, o cuánto le falta
 * para el pedido mínimo. Es la vista previa del servidor; cobra `/api/sales`.
 */
export default function PagoPrecioCliente({ p }: { p: PagoModal }) {
  const { precioCliente: precio, cargandoPrecio } = p;
  if (cargandoPrecio) {
    return <p className="mt-1.5 text-sm text-[var(--text-tertiary)]">Revisando el precio de la clienta…</p>;
  }
  if (!precio || precio.motivo === "general" || precio.motivo === "inactivo" || precio.motivo === "sin-productos") return null;

  if (!precio.aplica) {
    return (
      <p data-pago-precio-cliente="bajo-minimo" className="mt-1.5 text-sm font-semibold text-[var(--data-warning-ink)]">
        Revendedora: le faltan <span className="tabular-nums">{fmt(precio.faltaMinimo)}</span> para el pedido mínimo
        ({fmt(precio.pedidoMinimo)}) · va a precio normal
      </p>
    );
  }

  return (
    <div data-pago-precio-cliente="aplica" className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 font-semibold text-[var(--accent-ink)]">
        <Tag className="h-3.5 w-3.5" aria-hidden />
        Precio revendedora · nivel {precio.nivel} %
      </span>
      <span className="tabular-nums text-[var(--text-tertiary)] line-through">{fmt(precio.catalogo)}</span>
      {(precio.avisos.length > 0 || precio.subeDeNivel) && (
        <InfoTip
          title="Precio de revendedora"
          what={
            <span>
              {precio.subeDeNivel ? `Con esta compra sube al nivel ${precio.nivel} %. ` : ""}
              {precio.avisos.join(" ")}
            </span>
          }
          affects="Lo calcula el sistema al cobrar con las reglas de Revendedoras: el precio y el descuento de cada artículo del carrito no cuentan."
          example="Shampoo de S/ 49,90 al 20 %: S/ 39,92. Un kit en oferta va a su precio."
        />
      )}
    </div>
  );
}
