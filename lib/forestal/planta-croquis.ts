/**
 * planta-croquis — la lógica PURA de la capa «Croquis» del Mapa de Planta
 * (ADR-465, 2026-10-03). Client-safe: la usan los hooks del mapa y sus tests.
 *
 * El croquis es un plano en METROS (`L.CRS.Simple`): un punto es `[y, x]` con
 * el origen en la esquina inferior izquierda del terreno y la y hacia arriba.
 * Acá vive todo lo que se puede decidir sin Leaflet ni React:
 *   - geometría plana (área, perímetro, centroide) — en el croquis el área es
 *     la del dibujo, no la geodésica del satélite;
 *   - la UBICACIÓN EFECTIVA: la pila (guía) se ubica entera por defecto y una
 *     troza separada (`troza:<id>`) manda sobre su pila;
 *   - el resumen de una zona en PT, m³ y piezas (PT primero: el aserradero
 *     piensa en pie tablar) y sus desgloses;
 *   - filtros (especie, permiso, dueño, estado), máquinas y el flujo dibujado.
 *
 * La ubicación es INFORMATIVA: nada de acá toca stock, consumo ni GTF.
 */

import { formatNumber } from "@/lib/format";
import { normalizarUnidad } from "./planta-resumen";
import {
  claveTroza,
  type AsignacionPlanta,
  type EventoTroza,
  type Item,
  type ItemKind,
  type MaquinaPlanta,
  type PlantaCroquis,
  type TrozaUbicable,
  type UbicacionPlanta,
} from "./planta-zona-types";

/** Un punto del croquis: `[y, x]` en metros. */
export type Punto = [number, number];

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── Geometría plana ───────────────────────────────────────────────────────

/** Área del polígono en m² (fórmula del cordón). Con menos de 3 puntos, 0. */
export function areaPlanaM2(pts: readonly Punto[]): number {
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [y1, x1] = pts[i];
    const [y2, x2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export const distanciaPlana = (a: Punto, b: Punto): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Perímetro en metros. `cerrado` suma el lado que vuelve al primer punto. */
export function perimetroPlanoM(pts: readonly Punto[], cerrado = true): number {
  let p = 0;
  for (let i = 1; i < pts.length; i++) p += distanciaPlana(pts[i - 1], pts[i]);
  if (cerrado && pts.length >= 3) p += distanciaPlana(pts[pts.length - 1], pts[0]);
  return p;
}

/**
 * Centroide del ÁREA (no el promedio de vértices): en un patio en «L» el
 * promedio cae afuera del dibujo y la etiqueta quedaría en la zona de al lado.
 */
export function centroidePlano(pts: readonly Punto[]): Punto {
  if (pts.length === 0) return [0, 0];
  const prom: Punto = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
  if (pts.length < 3) return prom;
  let a2 = 0, cy = 0, cx = 0;
  for (let i = 0; i < pts.length; i++) {
    const [y1, x1] = pts[i];
    const [y2, x2] = pts[(i + 1) % pts.length];
    const f = x1 * y2 - x2 * y1;
    a2 += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  if (Math.abs(a2) < 1e-9) return prom;
  return [cy / (3 * a2), cx / (3 * a2)];
}

/** Lleva un punto adentro del terreno y lo redondea a 10 cm (nadie mide una pila al milímetro). */
export function ajustarAlTerreno(p: Punto, c: Pick<PlantaCroquis, "anchoM" | "altoM">): Punto {
  const lim = (v: number, max: number) => Math.round(Math.min(Math.max(v, 0), max) * 10) / 10;
  return [lim(p[0], c.altoM), lim(p[1], c.anchoM)];
}

export function dentroDelTerreno(p: Punto, c: Pick<PlantaCroquis, "anchoM" | "altoM">): boolean {
  return p[0] >= 0 && p[0] <= c.altoM && p[1] >= 0 && p[1] <= c.anchoM;
}

/** El polígono guardado de una zona (`[[y,x]]` JSON) o null si no se entiende. */
export function parsearPoligono(json: string | null | undefined): Punto[] | null {
  if (!json) return null;
  try {
    const a: unknown = JSON.parse(json);
    if (Array.isArray(a) && a.length >= 3 && a.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && Number.isFinite(n)))) {
      return a as Punto[];
    }
  } catch { /* JSON roto: la zona queda sin polígono, no tira el mapa */ }
  return null;
}

// ─── Medidas: PT, m³ y piezas ──────────────────────────────────────────────

export interface Medida {
  pt: number | null;
  m3: number | null;
  piezas: number | null;
}

const UNIDADES_PIEZA = new Set(["u", "und", "unid", "pza", "pzas", "pieza", "piezas"]);

/** Lo que mide una línea del libro, sin restarle nada. */
export function medidaDeItem(it: Item): Medida {
  const u = normalizarUnidad(it.unidad);
  return {
    pt: it.pt ?? (u === "pt" ? it.cantidad : null),
    m3: u === "m³" ? it.cantidad : null,
    piezas: it.piezas ?? (UNIDADES_PIEZA.has(u) ? it.cantidad : it.trozas?.length ? it.trozas.length : null),
  };
}

export const medidaDeTroza = (t: TrozaUbicable): Medida => ({ pt: t.pt, m3: t.m3, piezas: 1 });

/** Lo que se lee primero de una pila: PT si se sabe, si no m³, si no piezas. */
export function fmtMedidaCorta(m: Medida): string | null {
  if (m.pt != null && m.pt > 0) return `${formatNumber(m.pt, { max: 0 })} pt`;
  if (m.m3 != null && m.m3 > 0) return `${formatNumber(m.m3, { max: 2 })} m³`;
  if (m.piezas != null && m.piezas > 0) return `${m.piezas} ${m.piezas === 1 ? "pza" : "pzas"}`;
  return null;
}

/** Para una pastilla de 7 letras: el FINAL del código, que es lo que distingue una troza de su vecina. */
export const codigoCorto = (codigo: string): string => (codigo.length > 7 ? `…${codigo.slice(-6).replace(/^[-_/\s]+/, "")}` : codigo);

/** Código pintado en la madera; sin código, el final del id (para poder decirlo en voz alta). */
export const codigoTroza = (t: Pick<TrozaUbicable, "id" | "codigo">): string => t.codigo?.trim() || `#${t.id.slice(-6)}`;

// ─── Ubicación efectiva: pila por defecto, pieza cuando se separa ─────────

export interface PilaEnZona {
  item: Item;
  /** Las trozas que SIGUEN en la pila (las separadas ya no cuentan acá). */
  trozas: TrozaUbicable[];
  separadas: number;
  /** Lo que queda en la pila después de restar las separadas. */
  medida: Medida;
  /** Todas sus trozas se separaron: no queda nada parado en este lugar. */
  vacia: boolean;
  pos: Punto | null;
}

export interface TrozaSuelta {
  troza: TrozaUbicable;
  /** La pila (guía) de la que salió: de ahí hereda especie, dueño y permiso. */
  pila: Item;
  medida: Medida;
  pos: Punto | null;
}

export interface ContenidoZona {
  pilas: PilaEnZona[];
  sueltas: TrozaSuelta[];
}

const posDe = (u: UbicacionPlanta | undefined): Punto | null =>
  u && typeof u.lat === "number" && typeof u.lng === "number" ? [u.lat, u.lng] : null;

const restar = (a: number | null, b: number): number | null => (a == null ? null : Math.max(0, a - b));

/** La troza tiene ubicación propia (separada de su pila), en cualquier plano. */
export const estaSeparada = (ubic: Readonly<Record<string, UbicacionPlanta>>, trozaId: string): boolean =>
  !!ubic[claveTroza(trozaId)]?.zonaId;

/**
 * Qué hay parado en cada zona. La pila (guía) se ubica por su id; una troza con
 * ubicación propia (`troza:<id>`) sale de la pila y aparece donde la pusieron,
 * aunque la pila no esté ubicada. Solo cuentan las zonas de `zonaIds` (las del
 * plano que se está mirando).
 */
export function contenidoPorZona(
  items: readonly Item[],
  ubic: Readonly<Record<string, UbicacionPlanta>>,
  zonaIds: ReadonlySet<string>,
): Record<string, ContenidoZona> {
  const out: Record<string, ContenidoZona> = {};
  const de = (zid: string) => (out[zid] ??= { pilas: [], sueltas: [] });
  for (const it of items) {
    const trozas = it.trozas ?? [];
    const quedan: TrozaUbicable[] = [];
    let sepM3 = 0, sepPt = 0, sep = 0;
    for (const t of trozas) {
      const ut = ubic[claveTroza(t.id)];
      if (!ut?.zonaId) { quedan.push(t); continue; }
      sep += 1; sepM3 += t.m3 ?? 0; sepPt += t.pt ?? 0;
      if (zonaIds.has(ut.zonaId)) de(ut.zonaId).sueltas.push({ troza: t, pila: it, medida: medidaDeTroza(t), pos: posDe(ut) });
    }
    const u = ubic[it.id];
    if (!u?.zonaId || !zonaIds.has(u.zonaId)) continue;
    const base = medidaDeItem(it);
    const medida: Medida = sep === 0 ? base : {
      pt: base.pt == null ? null : r2(restar(base.pt, sepPt) ?? 0),
      m3: base.m3 == null ? null : r3(restar(base.m3, sepM3) ?? 0),
      piezas: restar(base.piezas, sep),
    };
    de(u.zonaId).pilas.push({ item: it, trozas: quedan, separadas: sep, medida, vacia: trozas.length > 0 && quedan.length === 0, pos: posDe(u) });
  }
  return out;
}

// ─── Resumen de una zona ───────────────────────────────────────────────────

export interface GrupoMedida {
  clave: string;
  pt: number;
  m3: number;
  piezas: number;
  lineas: number;
}

export interface ResumenZonaCroquis {
  pt: number;
  m3: number;
  piezas: number;
  /** Líneas sin PT conocido: el PT de la zona es parcial si hay alguna. */
  sinPt: number;
  pilas: number;
  sueltas: number;
  porEspecie: GrupoMedida[];
  porPermiso: GrupoMedida[];
  porDueno: GrupoMedida[];
}

export const SIN_ESPECIE = "Sin especie";
export const SIN_PERMISO = "Sin permiso";
export const SIN_DUENO = "Dueño sin cargar";

/** La especie con la que se agrupa: en la aserrada `sub` es el producto, no la especie. */
export const especieDe = (it: Item): string | null => it.especie?.trim() || (it.kind === "troza" ? it.sub?.trim() || null : null);

function sumarGrupo(m: Map<string, GrupoMedida>, clave: string, med: Medida): void {
  const g = m.get(clave) ?? { clave, pt: 0, m3: 0, piezas: 0, lineas: 0 };
  g.pt = r2(g.pt + (med.pt ?? 0));
  g.m3 = r3(g.m3 + (med.m3 ?? 0));
  g.piezas += med.piezas ?? 0;
  g.lineas += 1;
  m.set(clave, g);
}

const ordenarGrupos = (m: Map<string, GrupoMedida>, ultimo: string): GrupoMedida[] =>
  [...m.values()].sort((a, b) => {
    if (a.clave === ultimo) return 1;
    if (b.clave === ultimo) return -1;
    return b.pt - a.pt || b.m3 - a.m3 || a.clave.localeCompare(b.clave);
  });

export function resumirZonaCroquis(c: ContenidoZona | undefined): ResumenZonaCroquis {
  const porEsp = new Map<string, GrupoMedida>();
  const porPer = new Map<string, GrupoMedida>();
  const porDue = new Map<string, GrupoMedida>();
  let pt = 0, m3 = 0, piezas = 0, sinPt = 0;
  const lineas: { it: Item; med: Medida }[] = [
    ...(c?.pilas ?? []).filter((p) => !p.vacia).map((p) => ({ it: p.item, med: p.medida })),
    ...(c?.sueltas ?? []).map((s) => ({ it: s.pila, med: s.medida })),
  ];
  for (const { it, med } of lineas) {
    pt += med.pt ?? 0; m3 += med.m3 ?? 0; piezas += med.piezas ?? 0;
    if (med.pt == null) sinPt += 1;
    sumarGrupo(porEsp, especieDe(it) ?? SIN_ESPECIE, med);
    sumarGrupo(porPer, it.permiso?.trim() || SIN_PERMISO, med);
    sumarGrupo(porDue, it.dueno?.trim() || SIN_DUENO, med);
  }
  return {
    pt: r2(pt), m3: r3(m3), piezas, sinPt,
    pilas: (c?.pilas ?? []).filter((p) => !p.vacia).length,
    sueltas: c?.sueltas.length ?? 0,
    porEspecie: ordenarGrupos(porEsp, SIN_ESPECIE),
    porPermiso: ordenarGrupos(porPer, SIN_PERMISO),
    porDueno: ordenarGrupos(porDue, SIN_DUENO),
  };
}

// ─── Filtros ───────────────────────────────────────────────────────────────

export type EstadoFiltro = "todo" | "rolliza" | "aserrada" | "despacho";

export interface FiltrosCroquis {
  especie: string | null;
  permiso: string | null;
  dueno: string | null;
  estado: EstadoFiltro;
}

export const FILTROS_VACIOS: FiltrosCroquis = { especie: null, permiso: null, dueno: null, estado: "todo" };

const ESTADO_DE: Record<ItemKind, EstadoFiltro> = { troza: "rolliza", producto: "aserrada", despacho: "despacho" };

export const hayFiltro = (f: FiltrosCroquis): boolean => !!(f.especie || f.permiso || f.dueno || f.estado !== "todo");

/** ¿La línea entra en el filtro? Una troza suelta se filtra con los datos de su pila. */
export function coincide(it: Item, f: FiltrosCroquis): boolean {
  if (f.estado !== "todo" && ESTADO_DE[it.kind] !== f.estado) return false;
  if (f.especie && (especieDe(it) ?? SIN_ESPECIE) !== f.especie) return false;
  if (f.permiso && (it.permiso?.trim() || SIN_PERMISO) !== f.permiso) return false;
  if (f.dueno && (it.dueno?.trim() || SIN_DUENO) !== f.dueno) return false;
  return true;
}

/** Una zona «coincide» si algo de lo que tiene adentro coincide. Sin filtro, todas. */
export function zonaCoincide(c: ContenidoZona | undefined, f: FiltrosCroquis): boolean {
  if (!hayFiltro(f)) return true;
  if (!c) return false;
  return c.pilas.some((p) => !p.vacia && coincide(p.item, f)) || c.sueltas.some((s) => coincide(s.pila, f));
}

/** Los valores que existen de verdad (para no ofrecer un filtro que da vacío). */
export function opcionesDeFiltro(items: readonly Item[]): { especies: string[]; permisos: string[]; duenos: string[] } {
  const e = new Set<string>(), p = new Set<string>(), d = new Set<string>();
  for (const it of items) {
    e.add(especieDe(it) ?? SIN_ESPECIE);
    p.add(it.permiso?.trim() || SIN_PERMISO);
    d.add(it.dueno?.trim() || SIN_DUENO);
  }
  const orden = (s: Set<string>, ultimo: string) => [...s].sort((a, b) => (a === ultimo ? 1 : b === ultimo ? -1 : a.localeCompare(b)));
  return { especies: orden(e, SIN_ESPECIE), permisos: orden(p, SIN_PERMISO), duenos: orden(d, SIN_DUENO) };
}

// ─── Escritura optimista ───────────────────────────────────────────────────

/** Aplica un lote de asignaciones al mapa de ubicaciones (lo mismo que hará el PUT). */
export function aplicarAsignaciones(
  ubic: Readonly<Record<string, UbicacionPlanta>>,
  asigs: readonly AsignacionPlanta[],
): Record<string, UbicacionPlanta> {
  const next = { ...ubic };
  for (const a of asigs) {
    if (!a.zonaId) { delete next[a.clave]; continue; }
    const conPunto = typeof a.lat === "number" && typeof a.lng === "number";
    next[a.clave] = conPunto ? { zonaId: a.zonaId, lat: a.lat, lng: a.lng } : { zonaId: a.zonaId };
  }
  return next;
}

// ─── Máquinas ──────────────────────────────────────────────────────────────

/** Ancho de la franja «fuera de la planta» a la derecha del terreno. */
export const FRANJA_FUERA_M = 6;

/**
 * Dónde se dibuja una máquina. Las que están «fuera» (en otro almacén) van en
 * una franja a la derecha del terreno, una debajo de otra: dibujarlas en su
 * último punto diría que siguen en el patio.
 */
export function posicionMaquina(m: MaquinaPlanta, idxFuera: number, c: Pick<PlantaCroquis, "anchoM" | "altoM">): Punto {
  if (!m.fuera) return [m.y, m.x];
  return [Math.max(1, c.altoM - 4 - idxFuera * 4), c.anchoM + FRANJA_FUERA_M / 2];
}

/** Soltarla dentro del terreno la pone en la planta; afuera, la marca «fuera» y guarda su último punto. */
export function soltarMaquina(m: MaquinaPlanta, p: Punto, c: Pick<PlantaCroquis, "anchoM" | "altoM">): MaquinaPlanta {
  if (!dentroDelTerreno(p, c)) return { ...m, fuera: true };
  const [y, x] = ajustarAlTerreno(p, c);
  return { ...m, x, y, fuera: false };
}

// ─── Flujo de producción (DIBUJO fijo del plano, no datos) ─────────────────

/** Un tramo de una ruta: «A2 Coche de aserrío (26) → mesa 2 (17)». */
export interface TramoFlujo {
  /** El número pintado en el plano: «1», «A2», «B», «5». */
  n: string;
  texto: string;
  /** La línea en metros `[y, x]`; la flecha apunta al último punto. */
  puntos: readonly Punto[];
  /** Dónde va el número (el mismo lugar que en la lámina); `null` = sin número. */
  rotulo?: Punto | null;
}

export type RutaFlujoId = "principal" | "cantear" | "despuntar" | "salida";

/** Una ruta del plano con su nombre, su número y su color (token del DS). */
export interface RutaFlujo {
  id: RutaFlujoId;
  numero: string;
  nombre: string;
  color: string;
  /** La salida va punteada, como en la lámina. */
  punteada: boolean;
  tramos: readonly TramoFlujo[];
}

/**
 * Las rutas numeradas de la «Lámina única · Planta v9» de Blas (54 × 48 m,
 * origen en la esquina de la oficina), medidas sobre los ejes del plano. Es el
 * dibujo del plano: el sistema no registra coche, mesas, cinta ni despuntadora,
 * así que esto no se mueve con el Libro.
 */
export const RUTAS_PLANO_V9: readonly RutaFlujo[] = [
  {
    id: "principal", numero: "1–4", nombre: "Ruta principal", color: "var(--data-warning-500)", punteada: false,
    tramos: [
      { n: "1", texto: "Patio de trozas (8) → acopio (14), con cargador", puntos: [[31.05, 9.3], [31.05, 37.5], [27, 39.9], [17.3, 38.2]], rotulo: [31.05, 23.55] },
      { n: "2", texto: "Acopio (14) → coche (22)", puntos: [[13.1, 36], [5.9, 36]], rotulo: [10.64, 36] },
      { n: "3", texto: "Coche (22) → corte en cinta (15)", puntos: [[4.4, 37.9], [4.4, 29.65]], rotulo: [4.4, 34.73] },
      { n: "4", texto: "Cinta (15) → rodillos (16)", puntos: [[7.95, 29.1], [7.95, 22.8]], rotulo: [7.95, 28.08] },
    ],
  },
  {
    id: "cantear", numero: "A", nombre: "Comercial para cantear", color: "var(--data-8)", punteada: false,
    tramos: [
      { n: "A1", texto: "Rodillos (16) → mesa 1 (17)", puntos: [[9.4, 20.5], [15.9, 20.5]], rotulo: [12.47, 20.5] },
      { n: "A2", texto: "Coche de aserrío (26) → mesa 2 (17)", puntos: [[15.27, 19.8], [15.27, 14.56]], rotulo: [15.27, 17.11] },
      { n: "A3", texto: "Mesa 2 (17) → despuntadora (23)", puntos: [[14.5, 13.5], [6.8, 13.5]], rotulo: [11.69, 13.5] },
    ],
  },
  {
    id: "despuntar", numero: "B", nombre: "Comercial solo despuntar", color: "var(--data-success-500)", punteada: false,
    tramos: [
      { n: "B", texto: "Rodillos (16) → directo a la despuntadora (23), sin pasar por las mesas", puntos: [[7.95, 19.45], [7.95, 16.3], [6.8, 14.9]], rotulo: [7.95, 17.99] },
    ],
  },
  {
    id: "salida", numero: "5", nombre: "Salida", color: "var(--data-2)", punteada: true,
    tramos: [
      { n: "5", texto: "Apilado bajo la ramada (5)", puntos: [[5.6, 11.85], [18.15, 8.95]], rotulo: null },
      { n: "5", texto: "Apilado en el punto 2 (5)", puntos: [[5.25, 11.8], [10.65, 6.88]], rotulo: null },
      { n: "5", texto: "Zona 19: apilado y cubicación", puntos: [[4.43, 11.7], [8.9, 2.94]], rotulo: [4.66, 9.95] },
      { n: "5", texto: "Madera corta → patio 18", puntos: [[3.8, 14.9], [2.25, 18.05]], rotulo: null },
    ],
  },
];

/** La versión del plano para la que se midieron las rutas. */
export const VERSION_RUTAS = 9;

/**
 * Las rutas que calzan sobre ESTE croquis, o `null`: el dibujo solo vale sobre
 * el plano para el que se trazó (v9, 54 × 48 m ± 1 m). Sobre otra versión las
 * flechas caerían encima de otras cosas.
 */
export function rutasDelPlano(c: { anchoM: number; altoM: number; version?: number } | null): readonly RutaFlujo[] | null {
  if (!c || c.version !== VERSION_RUTAS) return null;
  return Math.abs(c.anchoM - 54) <= 1 && Math.abs(c.altoM - 48) <= 1 ? RUTAS_PLANO_V9 : null;
}

export const flujoAplica = (c: { anchoM: number; altoM: number; version?: number } | null): boolean => rutasDelPlano(c) !== null;

/** Dónde va el número de un tramo: el de la lámina o, si no tiene, la mitad del tramo más largo. */
export function rotuloDeTramo(t: TramoFlujo): Punto | null {
  if (t.rotulo !== undefined) return t.rotulo;
  let mejor: Punto = t.puntos[0], largo = -1;
  for (let i = 1; i < t.puntos.length; i++) {
    const a = t.puntos[i - 1], b = t.puntos[i], d = distanciaPlana(a, b);
    if (d > largo) { largo = d; mejor = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
  }
  return mejor;
}

/** Los tres puntos de la punta de una flecha que va de `de` hacia `a`. */
export function puntaDeFlecha(de: Punto, a: Punto, largo = 1.2, abre = 0.6): [Punto, Punto, Punto] {
  const d = distanciaPlana(de, a) || 1;
  const uy = (a[0] - de[0]) / d, ux = (a[1] - de[1]) / d;
  const by = a[0] - uy * largo, bx = a[1] - ux * largo;
  return [a, [by + ux * abre, bx - uy * abre], [by - ux * abre, bx + uy * abre]];
}

/** La punta de un tramo: sobre su ÚLTIMO segmento. */
export function puntaDeTramo(t: TramoFlujo, largo?: number, abre?: number): [Punto, Punto, Punto] {
  const n = t.puntos.length;
  return puntaDeFlecha(t.puntos[n - 2], t.puntos[n - 1], largo, abre);
}

// ─── Historia de una troza ─────────────────────────────────────────────────

export const EVENTO_LABEL: Record<EventoTroza["tipo"], string> = {
  recepcion: "Llegó con su guía",
  apartado: "Apartada",
  lote: "Entró a un lote",
  lote_mixto: "Entró a un lote mixto",
  consumo: "Se aserró",
  retrozado: "Se retrozó",
  descarte: "Se descartó",
  despacho: "Salió despachada",
};

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/**
 * «jueves 10/09» (+ «/2025» si no es del año en curso). En UTC: las fechas del
 * libro son date-only y en Lima un `new Date("2026-09-10")` cae el día anterior.
 */
export function fmtFechaEvento(iso: string, anioActual: number = new Date().getUTCFullYear()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const y = d.getUTCFullYear();
  return `${DIAS[d.getUTCDay()]} ${dd}/${mm}${y !== anioActual ? `/${y}` : ""}`;
}

/** De la más vieja a la más nueva; a igual fecha, el orden del flujo. */
export function ordenarEventos(evs: readonly EventoTroza[]): EventoTroza[] {
  const orden = Object.keys(EVENTO_LABEL);
  return [...evs].sort((a, b) => a.fecha.localeCompare(b.fecha) || orden.indexOf(a.tipo) - orden.indexOf(b.tipo));
}
