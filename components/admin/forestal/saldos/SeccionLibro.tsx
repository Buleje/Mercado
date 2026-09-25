"use client";

/**
 * «Lo que firma el libro»: la conciliación apertura + movimientos = final
 * (ADR-139) y el stock de productos listo para despachar.
 */

import type { Concil, SaldosData } from "@/hooks/use-ctp-saldos";
import TablaConciliacion from "./TablaConciliacion";
import TablaProductos from "./TablaProductos";

export default function SeccionLibro({
  data,
  concil,
  onKardex,
  onDespachar,
}: {
  data: SaldosData;
  concil: Concil | null;
  onKardex: (especie: string) => void;
  /** Del stock a la guía: abre Despacho con producto y especie elegidos. */
  onDespachar?: (producto: string, especie: string | null) => void;
}) {
  return (
    <>
      {concil && <TablaConciliacion concil={concil} onKardex={onKardex} />}
      <TablaProductos productos={data.productos} onDespachar={onDespachar} />
    </>
  );
}
