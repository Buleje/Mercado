"use client";

import { Wrench } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { listarCorto } from "@/lib/compras/ciclo-oc";
import type { Excluidos } from "./tipos";

/**
 * Lo que el motor apartó a propósito (C25): los servicios y alquileres con
 * mínimo y los productos sin control de stock. En Blas el aserrado y el
 * cargador frontal salían a reponer como si fueran tablas; ahora se dice que
 * no entran y por qué, en una línea con ⓘ.
 */
export default function SugerenciasExcluidos({ excluidos }: { excluidos: Excluidos | null }) {
  if (!excluidos) return null;
  const { servicios, sinControlDeStock } = excluidos;
  if (servicios.length === 0 && sinControlDeStock === 0) return null;
  const alquileres = servicios.filter((s) => s.naturaleza === "alquiler").length;
  const sueltos = servicios.length - alquileres;
  const cuantos = [
    sueltos > 0 ? `${sueltos} ${sueltos === 1 ? "servicio" : "servicios"}` : null,
    alquileres > 0 ? `${alquileres} ${alquileres === 1 ? "alquiler" : "alquileres"}` : null,
  ].filter(Boolean).join(" y ");
  const partes = [
    servicios.length > 0 ? `${cuantos} (${listarCorto(servicios.map((s) => s.name))})` : null,
    sinControlDeStock > 0 ? `${sinControlDeStock} sin control de stock` : null,
  ].filter(Boolean);
  return (
    <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-1 text-sm text-[var(--text-secondary)] sm:px-4">
      <Wrench className="h-4 w-4 shrink-0" aria-hidden />
      <p className="min-w-0">No se reponen por stock: {partes.join("; ")}.</p>
      <InfoTip
        title="Fuera de la lista de compra"
        what="Un servicio o un alquiler se contrata cuando hace falta: lo que su ficha dice de «stock» no es mercadería en el almacén, así que no se repone por saldo. Un producto sin control de stock tampoco tiene saldo que mirar."
        affects="Tampoco salen «a reponer» en Comprar. Siguen pudiéndose pedir en una orden."
        example="«Aserrado de madera» con stock 0 y mínimo 10 ya no aparece como agotado con «Pedir 30»."
      />
    </div>
  );
}
