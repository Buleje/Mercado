/**
 * LothMapaArbolSimbolo — el mismo símbolo del marcador del mapa, en JSX: lo
 * usan la leyenda, la ficha del árbol y la lista de los más cercanos, para que
 * lo que explica cada uno sea exactamente lo que se ve sobre el mapa.
 * La geometría vive en `loth-mapa-arbol-simbolo` (single source).
 */

import type { ClaseArbol } from "@/lib/forestal/loth-mapa-arboles";
import { estiloSimbolo, PATH_TACHADO } from "./loth-mapa-arbol-simbolo";

export default function LothMapaArbolSimbolo({ clase, estado, lado = 18 }: { clase: ClaseArbol; estado: string; lado?: number }) {
  const e = estiloSimbolo(clase, estado);
  return (
    <svg aria-hidden="true" width={lado} height={lado} viewBox="0 0 24 24" className="flex-none overflow-visible">
      <path
        d={e.d}
        style={{ fill: e.fill, stroke: e.stroke }}
        strokeWidth={e.strokeWidth}
        strokeLinejoin="round"
        strokeDasharray={e.dash ?? undefined}
        opacity={e.opacidad}
      />
      {e.tachado && <path d={PATH_TACHADO} style={{ stroke: e.stroke }} strokeWidth={2.25} strokeLinecap="round" />}
    </svg>
  );
}
