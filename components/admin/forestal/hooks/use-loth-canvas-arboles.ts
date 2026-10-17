"use client";

/**
 * useLothCanvasArboles — la capa del censo forestal: cada árbol con su símbolo
 * (la forma dice la condición, el relleno si sigue en pie, la insignia qué
 * vino después de la tala), su etiqueta de texto («114 · Trozado ×3»), el
 * anillo del elegido y del más cercano, y la línea punteada desde tu GPS
 * hasta él.
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
 *
 * Las etiquetas van DENTRO del marcador (tocar la etiqueta abre la ficha) y se
 * re-ubican al terminar cada zoom o arrastre (`loth-mapa-etiquetas`): primero
 * se miden todas, después se decide el lado de cada una y recién ahí se
 * escribe en el DOM — medir y escribir intercalado recalcula la página por
 * cada árbol.
 */

import { useEffect, useRef } from "react";
import { pointInPolygon } from "@/lib/forestal/loth-geo";
import { claseDelArbol, CLASE_ARBOL_LABEL, type ClaseArbol } from "@/lib/forestal/loth-mapa-arboles";
import { ETAPA_LABEL, ETAPA_TOKEN, textoCortoEtapa, textoLargoEtapa, type EtapaArbol } from "@/lib/forestal/loth-etapa-arbol";
import { estiloChip, simboloArbolHtml, type ChipArbol } from "../loth-mapa-arbol-simbolo";
import { EVENTO_TAPAS_MAPA, prioridadDeArbol, ubicarEtiquetas, ZOOM_ETIQUETAS, type CajaEtiqueta, type LadoEtiqueta } from "../loth-mapa-etiquetas";
import type { LeafletCtx, LothMapaCanvasProps } from "../loth-mapa-canvas-ctx";
import type { CensoTree } from "../loth-mapa-shared";

/** Lado del marcador en px: el área que se toca. */
const LADO = 26;
/** Borde de la etiqueta con sólo el código: neutro, la etapa no se dice. */
const COLOR_SOLO_CODIGO = "var(--rule-strong)";

interface Marca {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  marker: any;
  lat: number;
  lng: number;
  clase: ClaseArbol;
  estado: string;
  etapa: EtapaArbol;
  conAviso: boolean;
  fuera: boolean;
  etiqueta: string;
  /** La etiqueta de texto (null: sin etiquetas). */
  chip: ChipArbol | null;
  /** Dónde está puesta ahora. */
  lado: LadoEtiqueta;
  /** Tamaño medido de la etiqueta (0 = todavía no se midió). */
  w: number;
  h: number;
}

function chipDe(t: CensoTree, etapa: EtapaArbol, modo: LothMapaCanvasProps["etiquetas"]): ChipArbol | null {
  if (modo === "ninguna") return null;
  const aviso = t.conAviso === true;
  if (modo === "codigo") return { codigo: t.code, texto: "", color: COLOR_SOLO_CODIGO, aviso, lado: "no" };
  return { codigo: t.code, texto: textoCortoEtapa(etapa, t.cadena), color: ETAPA_TOKEN[etapa], aviso, lado: "no" };
}

/* Las refs de Leaflet van en las dependencias aunque no cambian nunca: llegan
   por parámetro y el linter no puede saber que son estables. */
export function useLothCanvasArboles(ctx: LeafletCtx, p: LothMapaCanvasProps): void {
  const { ready, mapRef, LRef, arbolesRef } = ctx;
  const { censo, parcela, declarada, arbolElegido, arbolCercano, onArbolElegido, posicion, drawMode, markMode, viaDraft, medicion, marcados, etiquetas } =
    p;
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
        etapa: m.etapa,
        aviso: m.conAviso,
        chip: m.chip ? { ...m.chip, lado: m.lado } : null,
        etiqueta: m.etiqueta,
        lado: LADO,
      }),
      iconSize: [LADO, LADO],
      iconAnchor: [LADO / 2, LADO / 2],
    });
  };
  const zDe = (id: string, estado: string) =>
    id === resaltes.current.elegido ? 1000 : id === resaltes.current.cercano ? 900 : estado === "en_pie" ? 100 : 0;

  /**
   * Re-ubica las etiquetas del mapa como está AHORA (zoom, encuadre, elegido).
   * Vive en una ref para que los oyentes de Leaflet llamen siempre a la última.
   */
  const ubicarRef = useRef<() => void>(() => undefined);
  ubicarRef.current = () => {
    const map = mapRef.current;
    if (!ready || !map || marcas.current.size === 0) return;
    const conChip = [...marcas.current.entries()].filter(([, m]) => m.chip !== null);
    if (conChip.length === 0) return;
    // 1) Medir (sólo lecturas del DOM).
    const chipDom = (m: Marca): HTMLElement | null => m.marker.getElement?.()?.querySelector?.("[data-etq]") ?? null;
    for (const [, m] of conChip) {
      if (m.w > 0) continue;
      const el = chipDom(m);
      if (el) {
        m.w = el.offsetWidth;
        m.h = el.offsetHeight;
      }
    }
    // 2) Decidir: los visibles son obstáculo; con zoom lejano sólo se ponen el elegido y el más cercano.
    const size = map.getSize();
    const vista = map.getBounds().pad(0.05);
    const cerca = map.getZoom() >= ZOOM_ETIQUETAS;
    const cajas: CajaEtiqueta[] = [];
    for (const [id, m] of marcas.current) {
      if (!vista.contains([m.lat, m.lng])) continue;
      const pt = map.latLngToContainerPoint([m.lat, m.lng]);
      const elegido = id === resaltes.current.elegido;
      const cercano = id === resaltes.current.cercano;
      const ponerla = m.chip !== null && (cerca || elegido || cercano);
      cajas.push({
        id,
        x: pt.x,
        y: pt.y,
        w: ponerla ? m.w : 0,
        h: ponerla ? m.h : 0,
        prioridad: prioridadDeArbol({ elegido, cercano, conAviso: m.conAviso, etapa: m.etapa }),
        fija: ponerla && (elegido || cercano),
      });
    }
    // Lo que va encima del mapa (controles de Leaflet, leyenda, escala, la ficha): marcado con `data-tapa-mapa`.
    const cont: HTMLElement = map.getContainer();
    const base = cont.getBoundingClientRect();
    const tapas = [...cont.querySelectorAll(".leaflet-control"), ...(cont.parentElement?.querySelectorAll("[data-tapa-mapa]") ?? [])]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height }));
    const lados = ubicarEtiquetas(cajas, { ancho: size.x, alto: size.y }, { tapas });
    // 3) Escribir sólo lo que cambió.
    for (const [id, m] of conChip) {
      const lado = lados.get(id) ?? "no";
      if (lado === m.lado || !m.chip) continue;
      m.lado = lado;
      const el = chipDom(m);
      if (!el) continue;
      el.setAttribute("style", estiloChip(m.chip, lado, LADO));
      el.dataset.etq = lado;
    }
  };

  // ── Construir la capa (cambió el censo, el filtro, el polígono, el modo o las etiquetas) ──
  useEffect(() => {
    const L = LRef.current;
    const group = arbolesRef.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    marcas.current.clear();
    for (const t of censo) {
      const clase = claseDelArbol(t);
      const etapa: EtapaArbol = t.etapa ?? (t.estado === "talado" ? "talado" : t.estado === "descartado" ? "descartado" : "en_pie");
      const nativo = t.speciesNative ? ` (${t.speciesNative})` : "";
      const aviso = t.cadena?.avisos[0]?.texto;
      const m: Marca = {
        marker: null,
        lat: t.lat,
        lng: t.lng,
        clase,
        estado: t.estado,
        etapa,
        conAviso: t.conAviso === true,
        fuera: declarada && !pointInPolygon([t.lat, t.lng], parcela),
        etiqueta: `Árbol ${t.code}, ${t.species}${nativo}, ${CLASE_ARBOL_LABEL[clase].toLowerCase()}, ${textoLargoEtapa(etapa, t.cadena)}${
          aviso ? `. Aviso: ${aviso}` : ""
        }`,
        chip: chipDe(t, etapa, etiquetas),
        lado: "no",
        w: 0,
        h: 0,
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
        m.marker.bindTooltip(`${t.code} · ${t.species}${nativo} · ${ETAPA_LABEL[etapa]}`, { direction: "top", offset: [0, -LADO / 2] });
      }
      m.marker.addTo(group);
      marcas.current.set(t.id, m);
    }
    ubicarRef.current();
    // iconoDe/zDe/ubicarRef leen refs: no van en las dependencias.
  }, [ready, censo, parcela, declarada, onArbolElegido, capturando, etiquetas, LRef, arbolesRef]);

  // ── Re-ubicar las etiquetas al terminar un zoom, un arrastre o un cambio de tamaño ──
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const ubicar = () => ubicarRef.current();
    map.on("zoomend moveend resize", ubicar);
    // Plegar la leyenda o abrir un panel cambia lo que tapa el mapa sin moverlo.
    window.addEventListener(EVENTO_TAPAS_MAPA, ubicar);
    return () => {
      map.off("zoomend moveend resize", ubicar);
      window.removeEventListener(EVENTO_TAPAS_MAPA, ubicar);
    };
  }, [ready, mapRef]);

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
    // El elegido y el más cercano llevan su etiqueta siempre: las demás se acomodan.
    if (tocados.size > 0) ubicarRef.current();
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
