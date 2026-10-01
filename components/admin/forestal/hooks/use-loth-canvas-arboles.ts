"use client";

/**
 * useLothCanvasArboles — la capa del censo forestal: cada árbol con su símbolo
 * (la forma dice la condición, el relleno el estado), el anillo del elegido y
 * del más cercano, y la línea punteada desde tu GPS hasta él.
 *
 * Marcadores `divIcon`, no `circleMarker`: son elementos del DOM, así que se
 * llega a ellos con Tab (Leaflet les pone `role="button"`), llevan nombre
 * accesible y el área que se toca mide 26 px aunque el símbolo se vea de 13 —
 * con el dedo, en el monte, un punto de 9 px no se acierta.
 *
 * Elegir un árbol NO re-pinta el censo: sólo cambia el ícono de los dos o tres
 * árboles que ganan o pierden el anillo (`setIcon` reusa el mismo `<div>`, así
 * que el foco del teclado se queda donde estaba). Marcar en «Elegir varios»
 * es el mismo truco: sólo se toca el ícono de los árboles marcados/desmarcados.
 */

import { useEffect, useRef } from "react";
import { pointInPolygon } from "@/lib/forestal/loth-geo";
import { claseDelArbol, CLASE_ARBOL_LABEL, ESTADO_ARBOL_LABEL, type ClaseArbol } from "@/lib/forestal/loth-mapa-arboles";
import { simboloArbolHtml } from "../loth-mapa-arbol-simbolo";
import type { LeafletCtx, LothMapaCanvasProps } from "../loth-mapa-canvas-ctx";

/** Lado del marcador en px: el área que se toca. */
const LADO = 26;

interface Marca {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  marker: any;
  clase: ClaseArbol;
  estado: string;
  fuera: boolean;
  etiqueta: string;
}

/* Las refs de Leaflet van en las dependencias aunque no cambian nunca: llegan
   por parámetro y el linter no puede saber que son estables. */
export function useLothCanvasArboles(ctx: LeafletCtx, p: LothMapaCanvasProps): void {
  const { ready, mapRef, LRef, arbolesRef } = ctx;
  const { censo, parcela, declarada, arbolElegido, arbolCercano, onArbolElegido, posicion, drawMode, markMode, viaDraft, medicion, marcados } = p;
  // Con una herramienta que usa el clic del mapa prendida (dibujar, marcar,
  // trazar, medir), los árboles no se quedan con ese clic: si no, poner un
  // vértice encima de un árbol abría su ficha en vez de marcar el punto.
  const capturando = drawMode || markMode || viaDraft !== null || medicion !== null;

  const marcas = useRef(new Map<string, Marca>());
  /** Quiénes llevan el anillo AHORA: el efecto que construye los lee sin depender de ellos. */
  const resaltes = useRef({ elegido: arbolElegido, cercano: arbolCercano });
  /** Quiénes están marcados AHORA (mismo truco: sin ir en las dependencias). */
  const marcadosRef = useRef(marcados);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const iconoDe = (L: any, m: Marca, id: string) => {
    const elegido = id === resaltes.current.elegido;
    const cercano = id === resaltes.current.cercano;
    return L.divIcon({
      className: "loth-arbol",
      html: simboloArbolHtml({
        clase: m.clase,
        estado: m.estado,
        fuera: m.fuera,
        resaltado: elegido || cercano,
        latido: cercano && !elegido,
        marcado: marcadosRef.current.has(id),
        etiqueta: m.etiqueta,
        lado: LADO,
      }),
      iconSize: [LADO, LADO],
      iconAnchor: [LADO / 2, LADO / 2],
    });
  };
  const zDe = (id: string, estado: string) =>
    id === resaltes.current.elegido ? 1000 : id === resaltes.current.cercano ? 900 : estado === "en_pie" ? 100 : 0;

  // ── Construir la capa (cambió el censo, el filtro, el polígono o el modo) ──
  useEffect(() => {
    const L = LRef.current;
    const group = arbolesRef.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    marcas.current.clear();
    for (const t of censo) {
      const clase = claseDelArbol(t);
      const nativo = t.speciesNative ? ` (${t.speciesNative})` : "";
      const estado = (ESTADO_ARBOL_LABEL[t.estado] ?? t.estado).toLowerCase();
      const m: Marca = {
        marker: null,
        clase,
        estado: t.estado,
        fuera: declarada && !pointInPolygon([t.lat, t.lng], parcela),
        etiqueta: `Árbol ${t.code}, ${t.species}${nativo}, ${CLASE_ARBOL_LABEL[clase].toLowerCase()}, ${estado}`,
      };
      m.marker = L.marker([t.lat, t.lng], {
        icon: iconoDe(L, m, t.id),
        keyboard: !capturando,
        interactive: !capturando,
        // El elegido y el más cercano, encima de los vecinos que los taparían.
        zIndexOffset: zDe(t.id, t.estado),
      });
      if (!capturando) {
        m.marker.on("click", () => onArbolElegido(t.id));
        // Leaflet hace tabulable el marcador pero no lo «presiona» con Enter.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        m.marker.on("keydown", (e: any) => {
          const k = e.originalEvent?.key;
          if (k !== "Enter" && k !== " ") return;
          e.originalEvent.preventDefault();
          onArbolElegido(t.id);
        });
        m.marker.bindTooltip(`${t.code} · ${t.species}${nativo}`, { direction: "top", offset: [0, -LADO / 2] });
      }
      m.marker.addTo(group);
      marcas.current.set(t.id, m);
    }
    // iconoDe/zDe leen refs: no van en las dependencias.
  }, [ready, censo, parcela, declarada, onArbolElegido, capturando, LRef, arbolesRef]);

  // ── Mover el anillo: sólo los árboles que lo ganan o lo pierden ────────────
  useEffect(() => {
    const L = LRef.current;
    const antes = resaltes.current;
    resaltes.current = { elegido: arbolElegido, cercano: arbolCercano };
    if (!ready || !L) return;
    const tocados = new Set([antes.elegido, antes.cercano, arbolElegido, arbolCercano].filter((id): id is string => !!id));
    for (const id of tocados) {
      const m = marcas.current.get(id);
      if (!m) continue;
      m.marker.setIcon(iconoDe(L, m, id));
      m.marker.setZIndexOffset(zDe(id, m.estado));
    }
  }, [ready, arbolElegido, arbolCercano, LRef]);

  // ── Marcar o desmarcar: sólo los árboles que lo ganan o lo pierden ─────────
  useEffect(() => {
    const L = LRef.current;
    const antes = marcadosRef.current;
    marcadosRef.current = marcados;
    if (!ready || !L) return;
    const tocados = new Set([...antes, ...marcados].filter((id) => antes.has(id) !== marcados.has(id)));
    for (const id of tocados) {
      const m = marcas.current.get(id);
      if (m) m.marker.setIcon(iconoDe(L, m, id));
    }
  }, [ready, marcados, LRef]);

  // Tocar el mapa vacío cierra la ficha (un marcador no burbujea su clic).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || capturando || !arbolElegido) return;
    const cerrar = () => onArbolElegido(null);
    map.on("click", cerrar);
    return () => {
      map.off("click", cerrar);
    };
  }, [ready, capturando, arbolElegido, onArbolElegido, mapRef]);

  // La línea que te lleva: de tu posición al árbol en pie más cercano.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map || !posicion || !arbolCercano) return;
    const arbol = censo.find((t) => t.id === arbolCercano);
    if (!arbol) return;
    const linea = L.polyline(
      [
        [posicion.lat, posicion.lng],
        [arbol.lat, arbol.lng],
      ],
      { className: "stroke-[var(--data-info-500)]", weight: 3, opacity: 0.9, dashArray: "6 6", interactive: false },
    ).addTo(map);
    return () => {
      map.removeLayer(linea);
    };
  }, [ready, posicion, arbolCercano, censo, LRef, mapRef]);
}
