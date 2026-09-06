"use client";

/**
 * planta-plano-print.ts — imprime el PLANO de la planta del aserradero para las
 * visitas de la ARFFS (SERFOR). Genera una ventana imprimible con:
 *  - imagen satelital (Esri World_Imagery, export estático del área de las zonas),
 *  - los polígonos de las zonas DIBUJADOS encima (proyección lineal, imageSR=4326),
 *  - tabla de zonas (código · tipo · área · inventario ubicado) + totales.
 *
 * No reemplaza registro oficial; es un documento de referencia para inspección.
 */

import { ZONA_TIPOS, zonaTipoMeta, type PlantaZona, type ZonaTipo } from "@/lib/forestal/planta-zona-types";
import { BRAND_GEO, GEO_PLACENAME } from "@/lib/geo";

export interface PlanoZonaInv { trozas: number; m3: number; productos: number; despachos: number }

// Hex por tipo (los tokens --data-* del DS no resuelven en la ventana de print).
const TIPO_HEX: Record<ZonaTipo, string> = {
  entrada: "#0ea5e9",
  patio_trozas: "#f59e0b",
  aserrado: "#00a0a0",
  secado: "#a855f7",
  patio_producto: "#10b981",
  reserva: "#0ea5e9",
  despacho: "#ef4444",
  oficina: "#6b7280",
  otro: "#1d4ed8",
};

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function parseCoords(json: string | null): [number, number][] | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    if (Array.isArray(v) && v.length >= 3 && v.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number"))) {
      return v as [number, number][];
    }
  } catch { /* json roto → sin polígono */ }
  return null;
}

function fmtArea(m2: number | null): string {
  if (m2 == null || m2 <= 0) return "—";
  return m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${Math.round(m2).toLocaleString("es-PE")} m²`;
}

function invText(inv?: PlanoZonaInv): string {
  if (!inv) return "—";
  const p: string[] = [];
  if (inv.trozas) p.push(`${inv.trozas} troza(s) · ${inv.m3.toFixed(2)} m³`);
  if (inv.productos) p.push(`${inv.productos} producto(s)`);
  if (inv.despachos) p.push(`${inv.despachos} despacho(s)`);
  return p.length ? p.join(" · ") : "—";
}

export function printPlantaPlano(opts: {
  zonas: PlantaZona[];
  invByZona: Record<string, PlanoZonaInv>;
  areaTotalM2: number;
  periodLabel: string;
  ctpName?: string | null;
}): void {
  const { zonas, invByZona, areaTotalM2, periodLabel } = opts;

  // ── 1. Bounds del área (vértices de polígonos + centroides) ────────────────
  const pts: [number, number][] = [];
  const polys: { z: PlantaZona; coords: [number, number][] }[] = [];
  for (const z of zonas) {
    const coords = parseCoords(z.poligono);
    if (coords) { polys.push({ z, coords }); pts.push(...coords); }
    else if (z.lat != null && z.lng != null) pts.push([z.lat, z.lng]);
  }
  if (pts.length === 0) pts.push([BRAND_GEO.lat, BRAND_GEO.lng]);

  let latMin = Math.min(...pts.map((p) => p[0]));
  let latMax = Math.max(...pts.map((p) => p[0]));
  let lngMin = Math.min(...pts.map((p) => p[1]));
  let lngMax = Math.max(...pts.map((p) => p[1]));
  // Padding 15%.
  const latPad = Math.max((latMax - latMin) * 0.15, 0.0008);
  const lngPad = Math.max((lngMax - lngMin) * 0.15, 0.0008);
  latMin -= latPad; latMax += latPad; lngMin -= lngPad; lngMax += lngPad;
  // Rango MÍNIMO ~1.3km: el World_Imagery cacheado NO exporta más allá de ~z17.
  // Una planta mide ~300m → un bbox tan chico pediría un scale fuera del cache
  // (HTTP 500). Ampliamos a un mínimo que queda dentro del cache; las zonas se
  // dibujan como polígonos nítidos encima, así que igual se ven bien.
  const MIN_RANGE = 0.012;
  const expand = (min: number, max: number) => {
    const d = MIN_RANGE - (max - min);
    return d > 0 ? [min - d / 2, max + d / 2] as const : [min, max] as const;
  };
  [latMin, latMax] = expand(latMin, latMax);
  [lngMin, lngMax] = expand(lngMin, lngMax);
  const latRange = latMax - latMin;
  const lngRange = lngMax - lngMin;

  // ── 2. Imagen satelital estática (imageSR=4326 → proyección lineal exacta) ──
  const H = 700;
  const W = Math.max(320, Math.min(1100, Math.round((H * lngRange) / latRange)));
  const bbox = `${lngMin},${latMin},${lngMax},${latMax}`;
  // format=png (NO png32: el World_Imagery cacheado no lo soporta → 400).
  // imageSR=4326 → la imagen cubre exactamente el bbox pedido = proyección lineal.
  const imgUrl =
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export` +
    `?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=${W},${H}&format=png&f=image`;

  // Proyección lineal del bbox 4326 → pixeles de la imagen.
  const px = (lng: number) => ((lng - lngMin) / lngRange) * W;
  const py = (lat: number) => ((latMax - lat) / latRange) * H;

  // ── 3. SVG overlay: polígonos + código en el centroide ─────────────────────
  const svgShapes = polys.map(({ z, coords }) => {
    const pointsAttr = coords.map(([la, ln]) => `${px(ln).toFixed(1)},${py(la).toFixed(1)}`).join(" ");
    const hex = TIPO_HEX[z.tipo] ?? "#1d4ed8";
    const cLat = z.lat ?? coords.reduce((a, c) => a + c[0], 0) / coords.length;
    const cLng = z.lng ?? coords.reduce((a, c) => a + c[1], 0) / coords.length;
    return `<polygon points="${pointsAttr}" fill="${hex}33" stroke="${hex}" stroke-width="2.5" />` +
      `<text x="${px(cLng).toFixed(1)}" y="${py(cLat).toFixed(1)}" font-size="13" font-weight="700" fill="#fff" stroke="#000" stroke-width="0.5" text-anchor="middle" paint-order="stroke">${esc(z.codigo)}</text>`;
  }).join("");

  // ── 4. Tabla de zonas ──────────────────────────────────────────────────────
  const rows = zonas.map((z) => {
    const hex = TIPO_HEX[z.tipo] ?? "#1d4ed8";
    return `<tr>
      <td><b>${esc(z.codigo)}</b></td>
      <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${hex};margin-right:6px"></span>${esc(zonaTipoMeta(z.tipo).label)}</td>
      <td>${esc(z.nombre ?? "—")}</td>
      <td style="text-align:right">${esc(fmtArea(z.areaM2))}</td>
      <td>${esc(invText(invByZona[z.id]))}</td>
    </tr>`;
  }).join("");

  // Resumen por tipo (para el pie).
  const porTipo = ZONA_TIPOS
    .map((t) => ({ t, list: zonas.filter((z) => z.tipo === t.tipo) }))
    .filter((g) => g.list.length > 0)
    .map((g) => `${esc(g.t.label)}: ${g.list.length}`)
    .join(" · ");

  const fecha = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Plano de planta CTP</title>
<style>
  *{box-sizing:border-box} body{font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#1a1a1a;max-width:960px;margin:0 auto;padding:32px;font-size:13px}
  h1{font-size:20px;margin:0 0 2px;color:#0f5132} .sub{color:#666;font-size:12px;margin:0 0 16px}
  .map{position:relative;width:${W}px;max-width:100%;margin:0 auto 16px;border:2px solid #ddd;border-radius:8px;overflow:hidden}
  .map img{display:block;width:100%;height:auto} .map svg{position:absolute;inset:0;width:100%;height:100%}
  table{width:100%;border-collapse:collapse;margin-top:8px} th,td{padding:7px 9px;border:1px solid #e0e0e0;text-align:left;vertical-align:top}
  th{background:#f6f8f7;font-size:11px;text-transform:uppercase;letter-spacing:.3px;color:#444}
  .tot{margin-top:12px;padding:10px 14px;background:#f6f8f7;border:1px solid #e0e0e0;border-radius:8px;font-size:12px}
  .firma{display:flex;justify-content:space-between;margin-top:40px;font-size:12px} .firma div{border-top:1px solid #999;padding-top:6px;width:44%;text-align:center;color:#555}
  .foot{margin-top:24px;color:#999;font-size:10.5px;border-top:1px solid #eee;padding-top:10px}
  @media print{body{padding:12px}}
</style></head><body>
  <h1>Plano de planta — Centro de Transformación Primaria</h1>
  <p class="sub">${esc(GEO_PLACENAME)} · Período: ${esc(periodLabel)} · Generado: ${esc(fecha)}</p>
  <div class="map"><img src="${imgUrl}" alt="Satélite de la planta" /><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${svgShapes}</svg></div>
  ${zonas.length === 0 ? '<p style="text-align:center;color:#999">Todavía no hay zonas dibujadas en el mapa.</p>' : `
  <table>
    <thead><tr><th>Código</th><th>Tipo de zona</th><th>Nombre</th><th style="text-align:right">Área</th><th>Inventario ubicado</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="tot"><b>${zonas.length}</b> zona(s) · Área total mapeada: <b>${esc(fmtArea(areaTotalM2))}</b>${porTipo ? ` · ${porTipo}` : ""}</div>`}
  <div class="firma"><div>Responsable del CTP</div><div>Sello y recepción ARFFS</div></div>
  <p class="foot">Plano de referencia generado desde el mapa de planta del Libro de Operaciones del CTP. Las zonas son un gemelo espacial declarado por el titular; el inventario ubicado coincide con el panel de Planta. No reemplaza el registro oficial en el MC-SNIFFS de SERFOR.</p>
  <script>setTimeout(function(){ window.print(); }, 900);</script>
</body></html>`;

  const w = window.open("", "_blank", "width=1000,height=760");
  if (!w) throw new Error("El navegador bloqueó la ventana. Permití pop-ups para imprimir el plano.");
  w.document.write(html);
  w.document.close();
  w.focus();
}
