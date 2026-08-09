"use client";

/**
 * CtpRadarLienzo — el papel sobre el que se dibuja la cadena.
 *
 * Se ocupa sólo de mirar: acercar con la rueda (Ctrl/⌘ + rueda, sobre el punto
 * que está bajo el cursor, no sobre la esquina), arrastrar para desplazarse con
 * el mouse como en un mapa, y contener el dibujo en su propia caja con scroll
 * para que la barra de controles no se vaya de pantalla cuando el grafo tiene
 * cuarenta líneas.
 *
 * El grafo, el balance y los filtros siguen viviendo en `CtpTrazaRadar`: acá no
 * se decide nada sobre los datos.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { grosorArista } from "@/lib/forestal/ctp-radar";
import type { RadarApariencia } from "./ctp-radar-apariencia";
import { ZOOM_MAX, ZOOM_MIN } from "./ctp-radar-tipos";
import { Edge, fmtNum, Node, type Placed } from "./ctp-radar-svg";

export interface AristaDibujada {
  from: string;
  to: string;
  valor: number;
}

export interface RadarLayout {
  cols: [Placed[], Placed[], Placed[]];
  pos: Map<string, Placed>;
  W: number;
  H: number;
}

export interface CtpRadarLienzoProps {
  layout: RadarLayout;
  aristas: { consumos: AristaDibujada[]; origenes: AristaDibujada[] };
  maxFlujo: { consumo: number; origen: number };
  /** Subconjunto iluminado (búsqueda / pin / hover / foco). `null` = todo encendido. */
  active: { nodes: ReadonlySet<string>; edges: ReadonlySet<string> } | null;
  apariencia: RadarApariencia;
  zoom: number;
  onZoom: (v: number) => void;
  pinned: string | null;
  matchVisibles: ReadonlySet<string> | null;
  /** Si el nodo dibujado (que puede ser un grupo) tiene un hueco. */
  edgeAmber: (id: string) => boolean;
  onHover: (id: string | null) => void;
  onPin: (id: string) => void;
  /** Click en el fondo, sin arrastre: suelta el nodo fijado. */
  onFondo: () => void;
  /** El contenedor con scroll — el padre lo necesita para «ajustar» e «ir al hueco». */
  lienzoRef: RefObject<HTMLDivElement | null>;
  pantallaCompleta: boolean;
}

const acotarZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(z.toFixed(3))));

export default function CtpRadarLienzo({
  layout, aristas, maxFlujo, active, apariencia, zoom, onZoom,
  pinned, matchVisibles, edgeAmber, onHover, onPin, onFondo, lienzoRef, pantallaCompleta,
}: CtpRadarLienzoProps) {
  const [arrastrando, setArrastrando] = useState(false);
  /** Punto del dibujo que hay que dejar quieto tras el próximo cambio de zoom. */
  const anclaRef = useRef<{ cx: number; cy: number; offX: number; offY: number } | null>(null);
  /** Cuánto se movió el puntero: un arrastre no debe soltar el nodo fijado. */
  const movidoRef = useRef(0);
  const panRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  /**
   * Zoom vigente incluyendo los pasos ya pedidos y todavía no repintados. Un
   * giro rápido de rueda (o un trackpad) dispara varios `wheel` dentro del
   * mismo frame: leyendo la prop, todos calculan contra el MISMO valor viejo y
   * el zoom avanza un solo paso en vez de seis. Medido: seis ruedas seguidas
   * movían el dibujo de 1081 px a 1211 px, lo que da un paso, no seis.
   */
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  /**
   * Ctrl/⌘ + rueda acerca sobre el cursor. Va por listener nativo porque React
   * registra `wheel` como pasivo y ahí `preventDefault()` no hace nada: la
   * página entera haría zoom del navegador en vez del dibujo.
   */
  useEffect(() => {
    const cont = lienzoRef.current;
    if (!cont) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // rueda pelada = scroll normal
      e.preventDefault();
      const actual = zoomRef.current;
      const z = acotarZoom(actual * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
      if (z === actual) return;
      // El ancla la fija el PRIMER evento de la ráfaga: los siguientes verían un
      // scroll todavía sin repintar y calcularían un punto que no es el del cursor.
      if (!anclaRef.current) {
        const r = cont.getBoundingClientRect();
        const offX = e.clientX - r.left, offY = e.clientY - r.top;
        anclaRef.current = { cx: (cont.scrollLeft + offX) / actual, cy: (cont.scrollTop + offY) / actual, offX, offY };
      }
      zoomRef.current = z;
      onZoom(z);
    };
    cont.addEventListener("wheel", onWheel, { passive: false });
    return () => cont.removeEventListener("wheel", onWheel);
  }, [onZoom, lienzoRef]);

  // Después de repintar con el zoom nuevo, devolver el punto anclado bajo el cursor.
  useLayoutEffect(() => {
    const cont = lienzoRef.current;
    const a = anclaRef.current;
    if (!cont || !a) return;
    anclaRef.current = null;
    cont.scrollLeft = a.cx * zoom - a.offX;
    cont.scrollTop = a.cy * zoom - a.offY;
  }, [zoom, lienzoRef]);

  /** Arrastrar el lienzo como un mapa. Sólo con mouse: en táctil ya se desliza. */
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const cont = lienzoRef.current;
    if (!cont || e.pointerType !== "mouse" || e.button !== 0) return;
    // Si el arrastre nace sobre un bloque, gana el bloque (fijar / abrir grupo).
    if ((e.target as Element).closest?.("g[role='button']")) return;
    panRef.current = { x: e.clientX, y: e.clientY, sl: cont.scrollLeft, st: cont.scrollTop };
    movidoRef.current = 0;
    setArrastrando(true);
  }, [lienzoRef]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const cont = lienzoRef.current;
    const p = panRef.current;
    if (!cont || !p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    movidoRef.current = Math.max(movidoRef.current, Math.abs(dx) + Math.abs(dy));
    cont.scrollLeft = p.sl - dx;
    cont.scrollTop = p.st - dy;
  }, [lienzoRef]);

  const terminarPan = useCallback(() => {
    panRef.current = null;
    setArrastrando(false);
  }, []);

  const dims = apariencia.dims;

  return (
    <div className="relative">
      <div
        ref={lienzoRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={terminarPan}
        onPointerLeave={terminarPan}
        className={`overflow-auto rounded-2xl border-2 border-[var(--rule-base)] bg-linear-to-br from-[var(--surface-raised)] to-[var(--surface-sunken)] p-3 shadow-[var(--shadow-sm)] ${
          pantallaCompleta ? "max-h-[calc(100vh-13rem)]" : "max-h-[min(78vh,60rem)]"
        } ${arrastrando ? "cursor-grabbing select-none" : "cursor-grab"}`}
      >
        {/* Click en el fondo = soltar el pin; pero no si veníamos arrastrando. */}
        <svg
          viewBox={`0 0 ${layout.W} ${layout.H}`} width={layout.W * zoom} className="max-w-none" style={{ minWidth: zoom >= 1 ? "100%" : undefined }}
          role="img" aria-label="Grafo de cadena de custodia"
          onClick={() => { if (movidoRef.current < 4) onFondo(); }}
        >
          <defs>
            {/* Sombra suave editorial para los nodos. */}
            <filter id="ctp-node-shadow" x="-20%" y="-20%" width="140%" height="150%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.10" />
            </filter>
          </defs>
          {aristas.consumos.map((e) => {
            const k = `c:${e.from}->${e.to}`;
            const onE = !active || active.edges.has(k);
            const amberE = edgeAmber(e.to);
            return <Edge key={k} a={layout.pos.get(e.from)} b={layout.pos.get(e.to)} on={onE} dim={!!active && !active.edges.has(k)} amber={amberE} label={apariencia.etiquetasArista ? `${fmtNum(e.valor)} m³` : undefined} flow={!!active && active.edges.has(k) && !amberE} width={grosorArista(e.valor, maxFlujo.consumo)} dims={dims} />;
          })}
          {aristas.origenes.map((e) => {
            const k = `o:${e.from}->${e.to}`;
            const onE = !active || active.edges.has(k);
            const amberE = edgeAmber(e.from) || edgeAmber(e.to);
            return <Edge key={k} a={layout.pos.get(e.from)} b={layout.pos.get(e.to)} on={onE} dim={!!active && !active.edges.has(k)} amber={amberE} label={apariencia.etiquetasArista ? fmtNum(e.valor) : undefined} flow={!!active && active.edges.has(k) && !amberE} width={grosorArista(e.valor, maxFlujo.origen)} dims={dims} />;
          })}
          {layout.cols.flat().map((n) => (
            <Node
              key={n.id} n={n}
              dim={!!active && !active.nodes.has(n.id)}
              pinned={pinned === n.id}
              match={!!matchVisibles?.has(n.id)}
              onHover={onHover}
              onPin={onPin}
              dims={dims}
              apariencia={apariencia}
            />
          ))}
        </svg>
      </div>
      {/* Fade en el borde derecho (mobile) — señala que hay más cadena al deslizar. */}
      <div aria-hidden className="pointer-events-none absolute right-0.5 top-0.5 bottom-0.5 w-12 rounded-r-2xl bg-linear-to-l from-[var(--surface-sunken)] to-transparent sm:hidden" />
    </div>
  );
}
