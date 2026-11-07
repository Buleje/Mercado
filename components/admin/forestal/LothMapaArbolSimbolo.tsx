/**
 * LothMapaArbolSimbolo — el mismo símbolo del marcador del mapa, en JSX: lo
 * usan la leyenda, la ficha del árbol, la lista de los más cercanos y el
 * filtro por etapa, para que lo que explica cada uno sea exactamente lo que se
 * ve sobre el mapa. La geometría vive en `loth-mapa-arbol-simbolo` (single source).
 */

import type { ClaseArbol } from "@/lib/forestal/loth-mapa-arboles";
import type { EtapaArbol } from "@/lib/forestal/loth-etapa-arbol";
import { AVISO_SIGNO, AVISO_TOKEN, AVISO_TRIANGULO, BADGE_MARCADO_PATH, estiloSimbolo, HALO_ARBOL, insigniaDeEtapa, PATH_TACHADO } from "./loth-mapa-arbol-simbolo";

interface Props {
  clase: ClaseArbol;
  estado: string;
  lado?: number;
  /** Marcado en «Elegir varios»: la MISMA insignia que el marcador del mapa. */
  marcado?: boolean;
  /** La etapa según el libro: la MISMA insignia de abajo a la derecha. */
  etapa?: EtapaArbol;
  /** El censo y el libro no coinciden: el MISMO triángulo con «!». */
  aviso?: boolean;
}

export default function LothMapaArbolSimbolo({ clase, estado, lado = 18, marcado = false, etapa, aviso = false }: Props) {
  const e = estiloSimbolo(clase, estado);
  const ins = insigniaDeEtapa(etapa);
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
      {ins && (
        <>
          <circle cx={ins.cx} cy={ins.cy} r={ins.r} style={{ fill: ins.fondo, stroke: ins.borde }} strokeWidth={1.5} />
          <path d={ins.dibujo} fill="none" style={{ stroke: ins.tinta }} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {aviso && (
        <>
          <path d={AVISO_TRIANGULO} style={{ fill: AVISO_TOKEN, stroke: HALO_ARBOL }} strokeWidth={1.2} strokeLinejoin="round" />
          <path d={AVISO_SIGNO} fill="none" style={{ stroke: HALO_ARBOL }} strokeWidth={1.5} strokeLinecap="round" />
        </>
      )}
      {marcado && (
        <>
          <circle cx={19} cy={6} r={5.5} style={{ fill: "var(--accent)", stroke: "var(--surface-raised)" }} strokeWidth={1.5} />
          <path d={BADGE_MARCADO_PATH} fill="none" style={{ stroke: "var(--surface-raised)" }} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
