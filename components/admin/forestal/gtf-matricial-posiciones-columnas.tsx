"use client";

/**
 * La tabla de trozas (o el cuadro (34) de la guía) dentro de «Posición de
 * cada campo»: la Y de la primera fila y el alto de cada fila (todas las filas
 * bajan de a ese alto), y cada columna con su X y su ancho. Las columnas no
 * tienen Y propia: van en la fila.
 */

import { CardTitle } from "@buleje/design-system";
import { ALTO_FILA_MAX_MM, ALTO_FILA_MIN_MM, CATALOGO } from "@/lib/forestal/gtf-matricial-disposicion";
import { fijarTabla } from "@/lib/forestal/gtf-matricial-posiciones";
import { NumeroMm } from "./gtf-matricial-controles";
import TablaPosiciones, { type RenglonPosicion } from "./gtf-matricial-posiciones-tabla";
import type { EstadoGtfMatricial } from "./hooks/use-gtf-matricial";
import type { SeleccionTalonario } from "./hooks/use-gtf-matricial-seleccion";

export default function ColumnasPosiciones({
  t,
  s,
  renglones,
  noEntran,
}: {
  t: EstadoGtfMatricial;
  s: SeleccionTalonario;
  renglones: RenglonPosicion[];
  noEntran: ReadonlySet<string>;
}) {
  const hoja = t.hoja;
  if (!hoja) return null;
  const cat = CATALOGO[t.formato];
  return (
    <section aria-labelledby="pos-tabla-titulo" className="flex flex-col gap-2">
      <CardTitle id="pos-tabla-titulo">{cat.tablaLabel}</CardTitle>
      <div className="grid grid-cols-2 gap-2 sm:max-w-md">
        <NumeroMm
          label="Y de la 1.ª fila"
          vivo
          value={hoja.tabla.y}
          onChange={(v) => t.editar((h) => fijarTabla(h, { y: v }), "posiciones:tabla:y")}
          qa="pos-tabla-y"
        />
        <NumeroMm
          label="Alto de cada fila"
          vivo
          paso={0.1}
          value={hoja.tabla.altoFilaMm}
          min={ALTO_FILA_MIN_MM}
          max={ALTO_FILA_MAX_MM}
          onChange={(v) => t.editar((h) => fijarTabla(h, { altoFilaMm: v }), "posiciones:tabla:alto")}
          qa="pos-tabla-alto"
        />
      </div>
      {renglones.length > 0 && <TablaPosiciones t={t} s={s} renglones={renglones} noEntran={noEntran} titulo={`Columnas de ${cat.tablaLabel}`} />}
    </section>
  );
}
