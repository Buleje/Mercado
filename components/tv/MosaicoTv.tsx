"use client";

/**
 * Todas las cámaras permitidas a la vez: 1, 2×1, 2×2, 3×3 (hasta 4×4), sin
 * scroll. Las de Hik-Connect arrancan DE A UNA y en SD: cada una pide su video
 * cuando la anterior ya mostró algo (o falló) — un navegador de Tizen/webOS
 * con nueve EZUIKit abriendo a la vez se cuelga, y Hikvision corta a 5 pedidos/s.
 */

import { useEffect, useMemo, useState } from "react";
import CuadroTv from "./CuadroTv";
import { columnasMosaico, filasMosaico, TV_MAX_CUADROS, type CamaraTv } from "./tv-ui";

interface Props {
  camaras: readonly CamaraTv[];
  /** Las de Hik-Connect, pausadas tras un rato sin tocar el control. */
  pausadoNube: boolean;
  onAbrir: (id: string) => void;
  /** Al volver de una ampliada, el foco vuelve a esa. */
  focoId: string | null;
}

export default function MosaicoTv({ camaras, pausadoNube, onAbrir, focoId }: Props) {
  const visibles = camaras.slice(0, TV_MAX_CUADROS);
  const columnas = columnasMosaico(visibles.length);
  const filas = filasMosaico(visibles.length);
  /** Hasta qué número de cámara de Hik-Connect puede pedir video. */
  const [turno, setTurno] = useState(0);
  useEffect(() => {
    if (!pausadoNube) setTurno(0);
  }, [pausadoNube]);

  const ordenNube = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of visibles) if (c.tipo === "nube") m.set(c.id, m.size);
    return m;
  }, [visibles]);

  return (
    <ul
      className="grid h-full min-h-0 gap-3"
      style={{
        gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${filas}, minmax(0, 1fr))`,
      }}
      aria-label={`${visibles.length} cámaras`}
      data-tv-mosaico={`${columnas}x${filas}`}
    >
      {visibles.map((c, i) => {
        const k = ordenNube.get(c.id);
        return (
          <li key={c.id} className="min-h-0 min-w-0">
            <CuadroTv
              camara={c}
              activoNube={!pausadoNube && (k === undefined || k <= turno)}
              onArrancoNube={k === undefined ? undefined : () => setTurno((t) => Math.max(t, k + 1))}
              onAbrir={() => onAbrir(c.id)}
              inicial={focoId ? c.id === focoId : i === 0}
            />
          </li>
        );
      })}
    </ul>
  );
}
