"use client";

/**
 * useZoomTalonario — la lupa del diseñador (Brandon 15-10: «tipo lupa para
 * ampliar y minimizar para ver completa la hoja»).
 *
 * 100 % = tamaño real. − / + y Ctrl + rueda van de a 25 % (25 %–400 %);
 * «Ajustar al ancho» y «Ver hoja completa» recalculan con la ventana. Al
 * acercar con la rueda, el punto bajo el mouse queda quieto; con los botones,
 * el campo elegido (o el centro de lo que se ve). Se recuerda en el navegador.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PX_POR_MM, ZOOM_MAX, ZOOM_MIN, zoomQueEntra, zoomSiguiente } from "@/lib/forestal/gtf-matricial-edicion";

/** Aire alrededor de la hoja dentro del lienzo, en px (el padding del contenedor). */
export const AIRE_LIENZO = 16;
const CLAVE = "gtf-matricial-zoom";
/** La rueda de un mouse da ~100 por muesca; un trackpad, de a poquito: se junta antes de saltar 25 %. */
const RUEDA_POR_PASO = 60;

type ModoZoom = "ancho" | "hoja" | "libre";
interface EstadoZoom {
  modo: ModoZoom;
  valor: number;
}

function leer(): EstadoZoom {
  try {
    const j = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as Partial<EstadoZoom> | null;
    const modo: ModoZoom = j?.modo === "hoja" || j?.modo === "libre" ? j.modo : "ancho";
    const valor = typeof j?.valor === "number" && j.valor >= ZOOM_MIN && j.valor <= ZOOM_MAX ? j.valor : 1;
    return { modo, valor };
  } catch {
    return { modo: "ancho", valor: 1 };
  }
}

export function useZoomTalonario(hoja: { anchoMm: number; altoMm: number } | null, centroElegido: () => { x: number; y: number } | null) {
  /* Nodo en estado (no ref): el lienzo se monta recién cuando llega la disposición. */
  const [nodo, setNodo] = useState<HTMLDivElement | null>(null);
  const [tam, setTam] = useState({ ancho: 0, alto: 0 });
  const [estado, setEstado] = useState<EstadoZoom>({ modo: "ancho", valor: 1 });
  /** El punto (en mm) que tiene que quedar en el mismo lugar de la pantalla después de cambiar el zoom. */
  const ancla = useRef<{ mmX: number; mmY: number; px: number; py: number } | null>(null);
  const rueda = useRef(0);

  useEffect(() => setEstado(leer()), []);
  useEffect(() => {
    if (!nodo) return;
    const ro = new ResizeObserver(([e]) => setTam({ ancho: e.contentRect.width, alto: e.contentRect.height }));
    ro.observe(nodo);
    return () => ro.disconnect();
  }, [nodo]);
  useEffect(() => {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(estado));
    } catch {
      /* sin almacenamiento: el zoom vale hasta cerrar */
    }
  }, [estado]);

  const zoom = !hoja ? 1 : estado.modo === "libre" ? estado.valor : zoomQueEntra((tam.ancho || 600) - 4, (tam.alto || 600) - 4, hoja, estado.modo);
  const escala = zoom * PX_POR_MM;
  const zoomRef = useRef({ zoom, escala });
  zoomRef.current = { zoom, escala };

  /** Fija el zoom dejando quieto `punto` (px dentro del lienzo); sin punto, el campo elegido o el centro. */
  const fijar = useCallback(
    (valor: number, punto?: { px: number; py: number }) => {
      const el = nodo;
      const hojaEl = el?.firstElementChild as HTMLElement | null | undefined;
      const { escala: actual, zoom: ahora } = zoomRef.current;
      const nuevo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, valor));
      /* En el tope no cambia la escala: un ancla puesta acá saltaría en el próximo «ajustar». */
      if (el && hojaEl && Math.abs(nuevo - ahora) > 1e-6) {
        /* `offsetLeft` y no el aire fijo: una hoja más angosta que el lienzo va centrada. */
        const c = punto ? null : centroElegido();
        const px = punto?.px ?? (c ? hojaEl.offsetLeft + c.x * actual - el.scrollLeft : el.clientWidth / 2);
        const py = punto?.py ?? (c ? hojaEl.offsetTop + c.y * actual - el.scrollTop : el.clientHeight / 2);
        ancla.current = { mmX: (el.scrollLeft + px - hojaEl.offsetLeft) / actual, mmY: (el.scrollTop + py - hojaEl.offsetTop) / actual, px, py };
      }
      setEstado({ modo: "libre", valor: nuevo });
    },
    [centroElegido, nodo],
  );

  useLayoutEffect(() => {
    const a = ancla.current;
    const el = nodo;
    const hojaEl = el?.firstElementChild as HTMLElement | null | undefined;
    if (!a || !el || !hojaEl) return;
    el.scrollLeft = hojaEl.offsetLeft + a.mmX * escala - a.px;
    el.scrollTop = hojaEl.offsetTop + a.mmY * escala - a.py;
    ancla.current = null;
  }, [escala, nodo]);

  /* Ctrl + rueda: la lupa sobre el punto del mouse (y no el zoom de toda la página). */
  useEffect(() => {
    const el = nodo;
    if (!el) return;
    const alRodar = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      rueda.current += e.deltaY;
      if (Math.abs(rueda.current) < RUEDA_POR_PASO) return;
      const dir = rueda.current < 0 ? 1 : -1;
      rueda.current = 0;
      const r = el.getBoundingClientRect();
      fijar(zoomSiguiente(zoomRef.current.zoom, dir), { px: e.clientX - r.left, py: e.clientY - r.top });
    };
    el.addEventListener("wheel", alRodar, { passive: false });
    return () => el.removeEventListener("wheel", alRodar);
  }, [fijar, nodo]);

  return {
    caja: setNodo,
    escala,
    pct: Math.round(zoom * 100),
    modo: estado.modo,
    acercar: () => fijar(zoomSiguiente(zoom, 1)),
    alejar: () => fijar(zoomSiguiente(zoom, -1)),
    tamanoReal: () => fijar(1),
    alAncho: () => setEstado((e) => ({ ...e, modo: "ancho" })),
    hojaCompleta: () => setEstado((e) => ({ ...e, modo: "hoja" })),
    puedeAcercar: zoom < ZOOM_MAX - 1e-6,
    puedeAlejar: zoom > ZOOM_MIN + 1e-6,
  };
}

export type ZoomTalonario = ReturnType<typeof useZoomTalonario>;
