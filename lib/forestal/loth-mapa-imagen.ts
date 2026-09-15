"use client";

/**
 * loth-mapa-imagen — descarga la vista del mapa como PNG: la imagen satelital
 * del área con el polígono, el censo y las referencias dibujados encima.
 *
 * Sirve para pegar en un informe, mandar por WhatsApp al regente o adjuntar a un
 * correo, sin abrir el plano A3 completo.
 *
 * CÓMO, sin librerías: las teselas de Leaflet no se pueden volcar a un canvas
 * (vienen de dominios sin `crossOrigin` y lo dejarían "tainted", así que
 * `toDataURL` tiraría SecurityError). En cambio el **export estático de Esri**
 * responde con `Access-Control-Allow-Origin: *` (verificado 2026-07-22), así que
 * se pide la imagen del bbox visible, se carga con `crossOrigin="anonymous"` y
 * los vectores se pintan con la API 2D del canvas.
 */

import type { LatLng } from "./loth-geo";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const BASES = {
  topo: `${ESRI}/World_Topo_Map/MapServer/export`,
  sat: `${ESRI}/World_Imagery/MapServer/export`,
  street: `${ESRI}/World_Street_Map/MapServer/export`,
} as const;

export type ImagenBase = keyof typeof BASES;

export interface ImagenPunto {
  lat: number;
  lng: number;
  color: string;
  label?: string;
  /** "circulo" para operaciones/referencias, "triangulo" para el censo. */
  forma?: "circulo" | "triangulo";
}

export interface ImagenOptions {
  bounds: { latMin: number; latMax: number; lngMin: number; lngMax: number };
  ancho: number;
  alto: number;
  base: ImagenBase;
  parcela?: LatLng[];
  puntos?: ImagenPunto[];
  lineas?: { puntos: LatLng[]; color: string; dash?: boolean }[];
  /** Pie de imagen (título + fuente). */
  titulo?: string;
  fecha?: string;
}

/** Carga una imagen con CORS habilitado (si falla, rechaza y el caller avisa). */
function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo traer la imagen satelital del área."));
    img.src = src;
  });
}

/**
 * Compone el PNG y lo devuelve como blob. El bbox se pide TAL CUAL a Esri con
 * `imageSR=4326`, así que la proyección es lineal y los vectores se ubican con
 * una regla de tres — igual que en las láminas imprimibles.
 */
export async function componerImagenMapa(opts: ImagenOptions): Promise<Blob> {
  const { bounds, ancho, alto } = opts;
  const latRange = bounds.latMax - bounds.latMin || 1e-6;
  const lngRange = bounds.lngMax - bounds.lngMin || 1e-6;
  const PIE = opts.titulo ? 34 : 0;

  const bbox = `${bounds.lngMin},${bounds.latMin},${bounds.lngMax},${bounds.latMax}`;
  const url = `${BASES[opts.base]}?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=${Math.round(ancho)},${Math.round(alto)}&format=png&f=image`;
  const img = await cargarImagen(url);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(ancho);
  canvas.height = Math.round(alto) + PIE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no pudo preparar el lienzo.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, ancho, alto);

  const px = (lng: number) => ((lng - bounds.lngMin) / lngRange) * ancho;
  const py = (lat: number) => ((bounds.latMax - lat) / latRange) * alto;

  // Líneas (vías, cauces): casing blanco + trazo, para que se lean sobre el verde.
  for (const l of opts.lineas ?? []) {
    if (l.puntos.length < 2) continue;
    const trazar = () => {
      ctx.beginPath();
      l.puntos.forEach(([la, ln], i) => (i === 0 ? ctx.moveTo(px(ln), py(la)) : ctx.lineTo(px(ln), py(la))));
    };
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,255,255,.65)";
    ctx.lineWidth = 6;
    trazar();
    ctx.stroke();
    ctx.setLineDash(l.dash ? [10, 6] : []);
    ctx.strokeStyle = l.color;
    ctx.lineWidth = 3;
    trazar();
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Polígono del área de aprovechamiento.
  if (opts.parcela && opts.parcela.length >= 3) {
    ctx.beginPath();
    opts.parcela.forEach(([la, ln], i) => (i === 0 ? ctx.moveTo(px(ln), py(la)) : ctx.lineTo(px(ln), py(la))));
    ctx.closePath();
    ctx.fillStyle = "rgba(13,148,136,.18)";
    ctx.fill();
    ctx.strokeStyle = "#0d9488";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Puntos (censo, operaciones, referencias).
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  for (const p of opts.puntos ?? []) {
    const x = px(p.lng);
    const y = py(p.lat);
    ctx.beginPath();
    if (p.forma === "triangulo") {
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 5.5, y + 4);
      ctx.lineTo(x - 5.5, y + 4);
      ctx.closePath();
    } else {
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    }
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    if (p.label) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,.9)";
      ctx.strokeText(p.label, x, y - 10);
      ctx.fillStyle = "#0f172a";
      ctx.fillText(p.label, x, y - 10);
    }
  }

  // Pie: título + fuente, para que la imagen se explique sola fuera del sistema.
  if (opts.titulo) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#0f172a";
    ctx.font = "700 14px system-ui, sans-serif";
    ctx.fillText(opts.titulo, 10, alto + 16);
    ctx.font = "400 11px system-ui, sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.fillText(
      `${opts.fecha ? `${opts.fecha} · ` : ""}Imagen © Esri · geometría declarada en el Libro de Operaciones`,
      10,
      alto + 30,
    );
  }

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo generar el PNG."))), "image/png"),
  );
}

/** Compone y dispara la descarga. */
export async function descargarImagenMapa(opts: ImagenOptions, filename = "mapa-area-aprovechamiento.png"): Promise<void> {
  const blob = await componerImagenMapa(opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
