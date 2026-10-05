"use client";

/**
 * Los filtros de las columnas nuevas en el teléfono, donde no hay cabeceras
 * (la tabla es de tarjetas): el MISMO estado que la cabecera del escritorio.
 * Estado, Especie, Guía y Título ya están en la fila de `CtpTrozasBarra`.
 */

import { FiltroColumnaTexto } from "@/components/admin/shared/filtros-columna";
import type { FiltrosTrozas } from "./ctp-trozas-filtros-hook";
import { FiltroMultiTroza, FiltroRangoTroza } from "./ctp-trozas-filtros-th";

export default function CtpTrozasFiltrosMovil({ f }: { f: FiltrosTrozas }) {
  return (
    <div className="flex flex-wrap items-start gap-x-2 gap-y-1 border-b border-[var(--rule-soft)] px-3 pb-2 md:hidden" aria-label="Filtros por columna">
      <FiltroColumnaTexto label="Código" value={f.codigo} onChange={f.setCodigo} placeholder="Código…" />
      <FiltroMultiTroza id="proveedor" label="Proveedor" f={f} placeholder="Proveedor" />
      <FiltroRangoTroza id="parada" label="Parada" unidad="d" paso={1} f={f} />
      <FiltroRangoTroza id="d1" label="D1" unidad="cm" paso={1} f={f} />
      <FiltroRangoTroza id="d2" label="D2" unidad="cm" paso={1} f={f} />
      <FiltroRangoTroza id="largo" label="Largo" unidad="m" paso={0.1} f={f} />
      <FiltroRangoTroza id="volumen" label="Volumen" unidad="m³" paso={0.01} f={f} />
    </div>
  );
}
