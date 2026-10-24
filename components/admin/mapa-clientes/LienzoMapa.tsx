"use client";

import { useEffect, useRef, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { CENTRO_PUCALLPA, COLOR_NIVEL, ETIQUETA_NIVEL, escaparHtml, iniciales, nivelDe, type ClienteConUbicacion, type ModoMapa } from "./shared";

/* Leaflet se carga a pedido (no existe en el servidor) y se guarda tal cual: tipos propios mínimos. */
type Leaflet = typeof import("leaflet");
type MapaLeaflet = import("leaflet").Map;
type CapaLeaflet = import("leaflet").Layer;

interface Props {
  clientes: ClienteConUbicacion[];
  modo: ModoMapa;
  /** Cliente a enfocar desde la lista lateral. */
  enfocar?: string | null;
}

/** Un color de la hoja de estilos como `rgb(...)`: el canvas del mapa de calor no entiende `var(--x)`. */
function resolverColor(variable: string): string {
  const el = document.createElement("span");
  el.style.color = variable;
  document.body.appendChild(el);
  const color = getComputedStyle(el).color;
  el.remove();
  return color;
}

/** El mapa ocupa el alto que le da su contenedor (el padre decide: pantalla útil). */
export function LienzoMapa({ clientes, modo, enfocar }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLeaflet | null>(null);
  const libreria = useRef<Leaflet | null>(null);
  const capa = useRef<CapaLeaflet | null>(null);
  const marcadoresPorClave = useRef<Map<string, import("leaflet").Marker>>(new Map());
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let vivo = true;
    let observador: ResizeObserver | null = null;
    void (async () => {
      if (!contenedor.current) return;
      await import("leaflet/dist/leaflet.css");
      const L = await import("leaflet");
      if (!vivo || !contenedor.current) return;
      libreria.current = L;
      const m = L.map(contenedor.current).setView(CENTRO_PUCALLPA, 14);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(m);
      mapa.current = m;
      setTimeout(() => m.invalidateSize(), 250);
      if (typeof ResizeObserver !== "undefined") {
        observador = new ResizeObserver(() => m.invalidateSize());
        observador.observe(contenedor.current);
      }
      setListo(true);
    })();
    return () => {
      vivo = false;
      observador?.disconnect();
      mapa.current?.remove();
      mapa.current = null;
      capa.current = null;
      setListo(false);
    };
  }, []);

  useEffect(() => {
    let vivo = true;
    const dibujar = async () => {
      const m = mapa.current;
      const L = libreria.current;
      if (!m || !L) return;
      if (capa.current) m.removeLayer(capa.current);
      capa.current = null;
      marcadoresPorClave.current.clear();
      if (clientes.length === 0) return;

      if (modo === "marcadores") {
        const grupo = L.layerGroup();
        for (const c of clientes) {
          const nivel = nivelDe(c.totalSpent);
          const color = COLOR_NIVEL[nivel];
          const icono = L.divIcon({
            className: "customer-geo-marker",
            html: `<div style="background:${color};color:var(--surface-raised);width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;border:2px solid var(--surface-raised);box-shadow:var(--shadow-sm)">${escaparHtml(iniciales(c.name))}</div>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            popupAnchor: [0, -20],
          });
          const marcador = L.marker([c.lat, c.lng], { icon: icono });
          marcador.bindPopup(
            `<div style="min-width:160px"><p style="font-weight:700;margin:0 0 4px">${escaparHtml(c.name)}</p><p style="margin:0 0 2px;font-size:14px">${escaparHtml(c.location || "Sin dirección escrita")}</p><p style="margin:0;font-size:14px;font-weight:600">${formatCurrency(c.totalSpent)} · ${escaparHtml(ETIQUETA_NIVEL[nivel].split(" (")[0])}</p></div>`,
          );
          grupo.addLayer(marcador);
          marcadoresPorClave.current.set(c.phone || c.name, marcador);
        }
        grupo.addTo(m);
        capa.current = grupo;
      } else {
        try {
          // @ts-expect-error -- leaflet.heat extiende L globalmente y no trae tipos
          await import("leaflet.heat");
        } catch {
          return;
        }
        if (!vivo) return;
        const maximo = Math.max(...clientes.map((c) => c.totalSpent), 1);
        /* leaflet.heat cuelga `heatLayer` del `L` global, no del módulo importado (antes: «L.heatLayer is not a function»). */
        const Lglobal = (window as unknown as { L?: object }).L ?? L;
        const calor = (Lglobal as unknown as { heatLayer: (d: Array<[number, number, number]>, o: object) => CapaLeaflet }).heatLayer(
          clientes.map((c) => [c.lat, c.lng, c.totalSpent / maximo]),
          {
            radius: 30, blur: 20, maxZoom: 17, max: 1, minOpacity: 0.4,
            gradient: { 0.2: resolverColor("var(--accent)"), 0.6: resolverColor("var(--data-warning-500)"), 1.0: resolverColor("var(--data-error-500)") },
          },
        ).addTo(m);
        capa.current = calor;
      }
      m.fitBounds(L.latLngBounds(clientes.map((c) => [c.lat, c.lng] as [number, number])).pad(0.1), { maxZoom: 16 });
    };
    if (listo) void dibujar();
    return () => { vivo = false; };
  }, [clientes, modo, listo]);

  useEffect(() => {
    if (!enfocar) return;
    const marcador = marcadoresPorClave.current.get(enfocar);
    if (marcador && mapa.current) {
      mapa.current.setView(marcador.getLatLng(), Math.max(mapa.current.getZoom(), 16));
      marcador.openPopup();
    }
  }, [enfocar]);

  return <div ref={contenedor} role="application" aria-label="Mapa de clientes" className="h-full w-full rounded-xl border border-[var(--rule-base)]" />;
}
