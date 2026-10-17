/**
 * planta-croquis-print — la hoja A4 APAISADA del croquis de la planta (ADR-465):
 * el plano de fondo, las zonas con su código y lo que tienen, las pilas
 * ubicadas, las máquinas, la leyenda de rutas y un pie con empresa, fecha y
 * versión. Se arma con el armazón de los documentos del libro (`documentoHtml`)
 * y se revisa en `CtpDocumentoVisor` antes de imprimir o bajar el PDF.
 *
 * El plano es un `<img>` con un `<svg>` encima en METROS (`viewBox` = terreno):
 * las zonas, las pilas y las rutas caen donde caen en pantalla sin proyectar
 * nada. Las pilas sin punto guardado se reparten con `marcasDeZona`, el mismo
 * reparto del mapa: el papel dice lo mismo que la pantalla.
 *
 * Colores en hex A PROPÓSITO: la hoja vive en un iframe aislado (es papel) y
 * los tokens del panel no resuelven ahí — el mismo criterio que `CSS_DOCUMENTO`.
 * La ubicación es informativa: nada de esta hoja es un dato del Libro.
 */

import { formatNumber } from "@/lib/format";
import { cabeceraDoc, documentoHtml, esc } from "./ctp-documento-print";
import { pointInPolygon } from "./loth-geo";
import {
  centroidePlano, codigoCorto, codigoTroza, parsearPoligono, posicionMaquina, puntaDeTramo, resumirZonaCroquis, rotuloDeTramo,
  rutasDelPlano, type ContenidoZona, type Punto, type ResumenZonaCroquis, type RutaFlujoId,
} from "./planta-croquis";
import { etiquetaCorta } from "./planta-iconos";
import { marcasDeZona } from "./planta-marcadores";
import { zonaTipoMeta, type PlantaCroquis, type PlantaZona, type ZonaTipo } from "./planta-zona-types";

export interface EmpresaCroquis {
  nombre: string;
  /** Hasta tres líneas chicas: razón social y RUC, código de CTP, ubicación. */
  meta: string[];
  logo?: string | null;
}

export interface CroquisParaImprimir {
  croquis: PlantaCroquis;
  /** Solo las zonas del croquis. */
  zonas: readonly PlantaZona[];
  contenido: Readonly<Record<string, ContenidoZona>>;
  /** El plano de fondo como data URL (así el PDF no se ensucia con otro origen); null = sin fondo. */
  imagen: string | null;
  empresa: EmpresaCroquis;
  fecha: Date;
}

/** Tinta por tipo de zona: los mismos tonos que el mapa, en hex de papel. */
const TINTA_TIPO: Record<ZonaTipo, string> = {
  entrada: "#0284c7", patio_trozas: "#e0533f", aserrado: "#00807f", secado: "#7c4ddb", patio_producto: "#00807f",
  reserva: "#3b6fd8", despacho: "#c62828", oficina: "#6e6e6e", otro: "#0369a1",
};
/** Tinta por ruta, como en la lámina: naranja, morado, verde y marrón. */
const TINTA_RUTA: Record<RutaFlujoId, string> = { principal: "#e8590c", cantear: "#7c4ddb", despuntar: "#2b8a3e", salida: "#7a4b1e" };

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const dos = (n: number) => String(n).padStart(2, "0");
/** «sábado 03/10/2026»: el papel se archiva, así que lleva el año. */
export const fechaImpresion = (d: Date): string => `${DIAS[d.getDay()]} ${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}`;

/** Lo que tiene una zona en una línea, en las unidades del aserradero (PT → m³ → piezas). */
export function textoContenido(r: ResumenZonaCroquis): string {
  const partes: string[] = [];
  if (r.pt > 0 && r.sinPt === 0) partes.push(`${formatNumber(r.pt, { max: 0 })} pt`);
  if (r.m3 > 0) partes.push(`${formatNumber(r.m3, { max: 2 })} m³`);
  if (r.piezas > 0) partes.push(`${formatNumber(r.piezas, { max: 0 })} pzas`);
  if (partes.length === 0 && r.pilas + r.sueltas > 0) partes.push(`${r.pilas + r.sueltas} pila${r.pilas + r.sueltas === 1 ? "" : "s"}`);
  return partes.join(" · ");
}

/** Lo que va dentro del `<svg>` del plano, en metros (la y del svg crece hacia abajo). */
function dibujoSvg(d: CroquisParaImprimir): string {
  const { anchoM: W, altoM: H } = d.croquis;
  const pt = ([y, x]: Punto) => `${x.toFixed(2)},${(H - y).toFixed(2)}`;
  const capas = { zonas: "", rutas: "", marcas: "", etiquetas: "" };
  const texto = (p: Punto, s: string, tam: number, extra = "") =>
    `<text x="${p[1].toFixed(2)}" y="${(H - p[0]).toFixed(2)}" font-size="${tam}" ${extra}>${esc(s)}</text>`;

  for (const z of d.zonas) {
    const pts = parsearPoligono(z.poligono);
    if (!pts) continue;
    const tinta = TINTA_TIPO[z.tipo] ?? TINTA_TIPO.otro;
    capas.zonas += `<polygon points="${pts.map(pt).join(" ")}" fill="${tinta}" fill-opacity=".14" stroke="${tinta}" stroke-width=".16"/>`;
    const c = d.contenido[z.id];
    const centro = centroidePlano(pts);
    // Pilas: su punto si sigue adentro de la zona; las demás, repartidas como en el mapa.
    const lista = [
      ...(c?.pilas ?? []).filter((p) => !p.vacia).map((p) => ({ pos: p.pos, rotulo: etiquetaCorta(p.item.label), suelta: false })),
      ...(c?.sueltas ?? []).map((s) => ({ pos: s.pos, rotulo: codigoCorto(codigoTroza(s.troza)), suelta: true })),
    ];
    const fijas = lista.filter((x) => x.pos && pointInPolygon(x.pos, pts));
    const { marcas, sobran } = marcasDeZona(pts, centro, lista.filter((x) => !fijas.includes(x)));
    for (const { item, pos } of [...fijas.map((x) => ({ item: x, pos: x.pos as Punto })), ...marcas]) {
      capas.marcas += item.suelta
        ? `<rect x="${(pos[1] - 0.3).toFixed(2)}" y="${(H - pos[0] - 0.3).toFixed(2)}" width=".6" height=".6" fill="#fff" stroke="${tinta}" stroke-width=".14"/>`
        : `<circle cx="${pos[1].toFixed(2)}" cy="${(H - pos[0]).toFixed(2)}" r=".42" fill="${tinta}" stroke="#fff" stroke-width=".12"/>`;
      capas.marcas += texto([pos[0] - 0.16, pos[1] + 0.6], item.rotulo.slice(0, 12), 0.5, 'class="cq-halo" fill="#333"');
    }
    const dato = textoContenido(resumirZonaCroquis(c));
    capas.etiquetas += texto([centro[0] + (dato ? 0.2 : -0.25), centro[1]], z.codigo, 0.78, 'class="cq-halo" text-anchor="middle" font-weight="700" fill="#111"');
    if (dato) capas.etiquetas += texto([centro[0] - 0.62, centro[1]], dato, 0.58, 'class="cq-halo" text-anchor="middle" fill="#333"');
    if (sobran > 0) capas.etiquetas += texto([centro[0] - 1.3, centro[1]], `+${sobran} más`, 0.5, 'class="cq-halo" text-anchor="middle" fill="#333"');
  }

  for (const r of rutasDelPlano(d.croquis) ?? []) {
    const tinta = TINTA_RUTA[r.id];
    for (const t of r.tramos) {
      capas.rutas += `<polyline points="${t.puntos.map(pt).join(" ")}" fill="none" stroke="${tinta}" stroke-width=".3" stroke-linecap="round" stroke-linejoin="round"${r.punteada ? ' stroke-dasharray=".5 .6"' : ""}/>`;
      capas.rutas += `<polygon points="${puntaDeTramo(t, 1, 0.5).map(pt).join(" ")}" fill="${tinta}"/>`;
      const rot = rotuloDeTramo(t);
      if (!rot) continue;
      const ancho = 0.5 + t.n.length * 0.42;
      capas.rutas += `<rect x="${(rot[1] - ancho / 2).toFixed(2)}" y="${(H - rot[0] - 0.42).toFixed(2)}" width="${ancho.toFixed(2)}" height=".84" rx=".2" fill="#fff" stroke="${tinta}" stroke-width=".12"/>`;
      capas.rutas += texto([rot[0] - 0.21, rot[1]], t.n, 0.6, `text-anchor="middle" font-weight="700" fill="${tinta}"`);
    }
  }

  let maquinas = "";
  for (const m of d.croquis.maquinas.filter((x) => !x.fuera)) {
    const [y, x] = posicionMaquina(m, 0, d.croquis);
    maquinas += `<rect x="${(x - 1).toFixed(2)}" y="${(H - y - 0.65).toFixed(2)}" width="2" height="1.3" rx=".2" fill="#111" stroke="#e0533f" stroke-width=".14"/>`;
    maquinas += texto([y - 0.22, x], m.codigo, 0.62, 'text-anchor="middle" font-weight="700" fill="#fff"');
  }

  // Escala gráfica de 10 m abajo a la izquierda, para medir sobre el papel.
  const escala = W >= 14
    ? `<g><rect x="1" y="${(H - 1.6).toFixed(2)}" width="10" height=".35" fill="#111"/><rect x="1" y="${(H - 1.6).toFixed(2)}" width="5" height=".35" fill="#fff" stroke="#111" stroke-width=".06"/>${texto([1.9, 1], "0", 0.55, 'class="cq-halo" fill="#111"')}${texto([1.9, 11], "10 m", 0.55, 'class="cq-halo" text-anchor="middle" fill="#111"')}</g>`
    : "";
  return `${capas.zonas}${capas.rutas}${capas.marcas}${maquinas}${capas.etiquetas}${escala}`;
}

/** La columna derecha: rutas, zonas con lo que tienen, máquinas y la nota. */
function columnaLateral(d: CroquisParaImprimir): string {
  const rutas = rutasDelPlano(d.croquis) ?? [];
  const bloqueRutas = rutas.length
    ? `<h2>Rutas de producción</h2>${rutas.map((r) => `<div class="cq-ruta"><i class="cq-traza${r.punteada ? " punteada" : ""}" style="border-color:${TINTA_RUTA[r.id]}"></i><div><b>${esc(r.numero)} · ${esc(r.nombre)}</b>${r.tramos.map((t) => `<span><em>${esc(t.n)}</em> ${esc(t.texto)}</span>`).join("")}</div></div>`).join("")}`
    : "";
  // Por código y no por fecha de alta: en la visita se busca «PT-14», no la última que se dibujó.
  const orden = [...d.zonas].sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  const filas = orden.map((z) => {
    const r = resumirZonaCroquis(d.contenido[z.id]);
    const meta = zonaTipoMeta(z.tipo);
    return `<tr><td><i class="cq-chip" style="background:${TINTA_TIPO[z.tipo] ?? TINTA_TIPO.otro}"></i><b>${esc(z.codigo)}</b> ${esc(z.nombre || meta.label)}</td>`
      + `<td class="num">${r.m3 > 0 ? esc(formatNumber(r.m3, { max: 2 })) : "—"}</td><td class="num">${r.piezas > 0 ? esc(formatNumber(r.piezas, { max: 0 })) : "—"}</td><td class="num">${r.pilas + r.sueltas || "—"}</td></tr>`;
  }).join("");
  const maquinas = d.croquis.maquinas.map((m) => `<b>${esc(m.codigo)}</b> ${esc(m.nombre)}${m.fuera ? " (fuera de la planta)" : ""}`).join(" · ");
  return `<aside class="cq-lado">${bloqueRutas}
    <h2>Zonas y lo que tienen</h2>
    <table class="cq-zonas"><thead><tr><th>Zona</th><th class="num">m³</th><th class="num">Pzas</th><th class="num">Pilas</th></tr></thead><tbody>${filas || '<tr><td colspan="4">Todavía no hay zonas dibujadas en el croquis.</td></tr>'}</tbody></table>
    ${maquinas ? `<h2>Máquinas</h2><p class="cq-maq">${maquinas}</p>` : ""}
    <p class="doc-nota">La ubicación es <b>informativa</b>: no mueve stock ni reemplaza el Libro de Operaciones. Las rutas son el dibujo del plano.</p>
  </aside>`;
}

/** Caja del plano en mm dentro de la hoja apaisada (277 × 190 útiles, menos cabecera y pie). */
function cajaPlanoMm(c: PlantaCroquis): { w: number; h: number } {
  const maxW = 186, maxH = 158;
  const h = Math.min(maxH, (maxW * c.altoM) / c.anchoM);
  return { w: Math.round(((h * c.anchoM) / c.altoM) * 10) / 10, h: Math.round(h * 10) / 10 };
}

/** El documento completo, listo para el visor: nombre, archivo y HTML. */
export function croquisDocumento(d: CroquisParaImprimir): { nombre: string; archivo: string; etiqueta: string; html: string } {
  const { croquis: c } = d;
  const { w, h } = cajaPlanoMm(c);
  const fecha = fechaImpresion(d.fecha);
  const fondo = d.imagen ? `<img src="${esc(d.imagen)}" alt="" />` : "";
  const cuerpo = `${cabeceraDoc({ emisor: d.empresa.nombre, meta: d.empresa.meta, logo: d.empresa.logo, tipo: "Croquis de distribución", numero: `Versión ${c.version}`, numeroNota: `Terreno de ${formatNumber(c.anchoM)} × ${formatNumber(c.altoM)} m` })}
    <div class="cq-cuerpo">
      <figure class="cq-plano" style="width:${w}mm;height:${h}mm">${fondo}<svg viewBox="0 0 ${c.anchoM} ${c.altoM}" preserveAspectRatio="none" aria-hidden="true">${dibujoSvg(d)}</svg></figure>
      ${columnaLateral(d)}
    </div>
    <div class="doc-pie"><span>${esc(d.empresa.nombre)} · Croquis de la planta · versión ${c.version}</span><span>Impreso el ${esc(fecha)}</span></div>`;
  return {
    nombre: `Croquis de la planta v${c.version}`,
    archivo: `Croquis planta v${c.version} ${fecha.replace(/\//g, "-")}`,
    etiqueta: `${d.zonas.length} zonas · A4 apaisado`,
    html: documentoHtml({ titulo: `Croquis de la planta v${c.version}`, cuerpo, css: CSS_CROQUIS, orientacion: "apaisada" }),
  };
}

const CSS_CROQUIS = `
  .cq-cuerpo { display:flex; gap:4mm; align-items:flex-start; margin-top:2.5mm; }
  .cq-plano { position:relative; flex:none; margin:0; border:.5pt solid var(--linea-suave); background:#fafafa; overflow:hidden; }
  .cq-plano img, .cq-plano svg { position:absolute; inset:0; width:100%; height:100%; }
  .cq-plano svg text { font-family:Arial,Helvetica,sans-serif; }
  .cq-halo { paint-order:stroke; stroke:#fff; stroke-width:.2px; stroke-linejoin:round; }
  .cq-lado { flex:1 1 0; min-width:0; }
  .cq-lado h2 { margin:0 0 1mm; padding-bottom:.6mm; border-bottom:.5pt solid var(--linea-suave);
                font-size:6.8pt; letter-spacing:.5pt; text-transform:uppercase; color:var(--gris); }
  .cq-lado h2 ~ h2 { margin-top:2.4mm; }
  .cq-ruta { display:flex; gap:1.8mm; align-items:flex-start; margin-bottom:1.3mm; }
  .cq-traza { flex:none; width:7mm; margin-top:1.5mm; border-top:1mm solid; }
  .cq-traza.punteada { border-top-style:dotted; }
  .cq-ruta b { display:block; font-size:7.2pt; }
  .cq-ruta span { display:block; font-size:6.3pt; line-height:1.3; color:var(--tinta-clara); }
  .cq-ruta em { font-style:normal; font-weight:700; color:var(--tinta); }
  table.cq-zonas { width:100%; border-collapse:collapse; font-size:6.6pt; }
  .cq-zonas th { text-align:left; font-weight:700; color:var(--gris); border-bottom:.6pt solid var(--linea); padding:.5mm .8mm; }
  .cq-zonas td { border-bottom:.3pt solid var(--linea-suave); padding:.55mm .8mm; vertical-align:top; }
  .cq-zonas .num { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
  .cq-chip { display:inline-block; width:2.2mm; height:2.2mm; border-radius:.6mm; margin-right:1mm; vertical-align:-.25mm; }
  .cq-maq { margin:0; font-size:6.4pt; line-height:1.4; color:var(--tinta-clara); }
  .doc-pie { margin-top:2mm; }
`;
