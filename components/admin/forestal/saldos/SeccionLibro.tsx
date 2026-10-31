"use client";

/**
 * «Lo que firma el libro»: los tres Cuadros Resumen del formato oficial
 * (RDE D000025-2023) y el stock de productos listo para despachar.
 *
 * Compactación del libro (17-10): antes había acá una «Conciliación del
 * período» que repetía el Cuadro Resumen 1 con otras columnas, y los cuadros
 * vivían en su propia vista del riel. Queda UNA tabla, la oficial, con lo que
 * la de Saldos tenía de más (totales, Kardex, fila negativa, cruce con el
 * saldo del servidor y de dónde sale la apertura): `CtpCuadroResumen1`.
 */

import type { Concil, SaldosData } from "@/hooks/use-ctp-saldos";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import CtpResumenesSerfor from "../CtpResumenesSerfor";
import TablaProductos from "./TablaProductos";

export default function SeccionLibro({
  data,
  concil,
  period,
  especie,
  version,
  onKardex,
  onDespachar,
}: {
  data: SaldosData;
  concil: Concil | null;
  period: CtpPeriod;
  /** La especie de los indicadores (ADR-400): acota los cuadros como acota la conciliación. */
  especie: string;
  /** Sube con el «Recargar» de Saldos: los cuadros se recalculan. */
  version: number;
  onKardex: (especie: string) => void;
  /** Del stock a la guía: abre Despacho con producto y especie elegidos. */
  onDespachar?: (producto: string, especie: string | null) => void;
}) {
  return (
    <CtpResumenesSerfor
      embebido
      period={period}
      especie={especie || undefined}
      version={version}
      concil={concil}
      onKardex={onKardex}
      despues={<TablaProductos productos={data.productos} onDespachar={onDespachar} />}
    />
  );
}
