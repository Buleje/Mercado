/**
 * LothMapaArbolSimbolo — el mismo símbolo del marcador del mapa, en JSX: lo
 * usan la leyenda, la ficha del árbol y la lista de los más cercanos, para que
 * lo que explica cada uno sea exactamente lo que se ve sobre el mapa.
 * La geometría vive en `loth-mapa-arbol-simbolo` (single source).
 */

import type { ClaseArbol } from "@/lib/forestal/loth-mapa-arboles";
import { BADGE_MARCADO_PATH, estiloSimbolo, PATH_TACHADO } from "./loth-mapa-arbol-simbolo";

interface Props {
  clase: ClaseArbol;
  estado: string;
  lado?: number;
  /** Marcado en «Elegir varios»: la MISMA insignia que el marcador del mapa. */
  marcado?: boolean;
}

export default function LothMapaArbolSimbolo({ clase, estado, lado = 18, marcado = false }: Props) {
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
      {marcado && (
        <>
          <circle cx={19} cy={6} r={5.5} style={{ fill: "var(--accent)", stroke: "var(--surface-raised)" }} strokeWidth={1.5} />
          <path d={BADGE_MARCADO_PATH} fill="none" style={{ stroke: "var(--surface-raised)" }} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
