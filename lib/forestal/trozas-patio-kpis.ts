/**
 * trozas-patio-kpis — los indicadores del patio que sirven para DECIDIR.
 *
 * `resumirPatio` y `cifrasExtraPatio` describen el patio (cuánto hay, de qué
 * tamaño). Esto contesta las cuatro preguntas que Brandon hace parado frente a
 * la cancha (05-10, «mejora y agrega más KPIs»):
 *
 *   · ¿qué aserro primero?         → `primeroALaSierra` (las libres más viejas)
 *                                     y `ptEstimados` (cuánto rinde lo libre);
 *   · ¿qué se me está echando a perder? → `riesgoDelPatio` (30 días o más);
 *   · ¿cuánto vale lo parado?      → `valorDelPatio` (a costo de su guía) y,
 *     para cargar lo que falta, `guiasSinCostoDelPatio` + `repartoDeGuia`;
 *   · ¿aguanta una fiscalización?  → `fiscalizacionDelPatio`;
 *   · y cómo se mueve: `flujoDelPatio` (entradas contra sierra, 30 días) y
 *     `clasesDiametricas` (de qué grosor es la pila).
 *
 * Reglas de honestidad (rule `verificacion-de-verdad`):
 *   · Sin factura no hay valor: `null`, nunca S/ 0 — un cero diría que esa
 *     madera no costó nada. La madera de servicio (ADR-437) no se compró: no
 *     cuenta como valor ni como «sin costo».
 *   · Los pies tablares de lo libre son una ESTIMACIÓN y se dice con qué: m³ de
 *     troza × el rendimiento REAL del libro × 424 pt/m³. Sin rendimiento del
 *     libro no hay estimación (nunca se supone el 56 %, que es un tope legal).
 *   · Un D1/D2 que falta no se reemplaza por el diámetro equivalente: esa es
 *     una pista para anotar, no una medida.
 *
 * PURO y client-safe.
 */

import { esSinCodigo } from "./consumo-trozas";
import { PT_POR_M3 } from "./cubicacion";
import { TRAMOS_DIAS_PATIO, diasEnPatio, diasParada } from "./patio-dias";
import { repartirPorVolumen, type LineaParaRepartir } from "./plata-de-guia";
import {
  TRAMOS_ANTIGUEDAD,
  estaEnPatio,
  estadoDeTroza,
  type GrupoTrozas,
  type TramoAntiguedad,
} from "./trozas-patio";
import { faltanMedidas, medidasDePieza, type PiezaDelPatio } from "./trozas-patio-medidas";

// ─── Lo que el GET del patio agrega para estos indicadores ────────────────

/** Todo opcional: un llamador viejo (o un endpoint sin el dato) no rompe nada. */
export interface DatosKpiPatio {
  /** S/ de la factura de la guía (`WoodEntry.costoTotal`). Sin factura = `null`. */
  guiaCostoTotal?: number | null;
  /** m³ que declara el asiento: el divisor del costo por m³. */
  guiaVolumenM3?: number | null;
  /** Madera de servicio (ADR-437): no se compró, no lleva costo. */
  guiaMaderaDeTercero?: boolean;
  /** Día de la corrida que la aserró (sólo si la corrida sigue viva). */
  consumidaFecha?: string | null;
  /** Día del despacho que se la llevó entera (sólo si sigue vivo). */
  despachadaFecha?: string | null;
  /**
   * Cancha del Mapa de Planta: la de la troza separada o, si no, la de su pila.
   * `null` = sin ubicar; `undefined` = el endpoint no lo informa (no se cuenta).
   */
  zonaId?: string | null;
}

export interface PiezaKpi extends PiezaDelPatio, DatosKpiPatio {
  woodEntryId?: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const vol = (t: { volumenM3: number | null }) =>
  typeof t.volumenM3 === "number" && Number.isFinite(t.volumenM3) && t.volumenM3 > 0 ? t.volumenM3 : 0;
const sumar = (g: GrupoTrozas, v: number): GrupoTrozas => ({ piezas: g.piezas + 1, m3: r3(g.m3 + v) });
const VACIO: GrupoTrozas = { piezas: 0, m3: 0 };
const enPatio = <T extends PiezaKpi>(trozas: readonly T[]) => trozas.filter((t) => estaEnPatio(estadoDeTroza(t)));

// ─── ¿Cuánto vale lo parado? ──────────────────────────────────────────────

/**
 * Soles por m³ de la guía: factura ÷ m³ del asiento. Mismo criterio que
 * `costoPorM3` y `valor-del-patio`: un costo ≤ 0 o un asiento sin volumen no
 * es un costo, es un campo vacío.
 */
export function costoM3DeGuia(t: DatosKpiPatio): number | null {
  const c = t.guiaCostoTotal;
  const v = t.guiaVolumenM3;
  if (c == null || !Number.isFinite(c) || c <= 0) return null;
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  return c / v;
}

export interface ValorPatio {
  /** S/ de lo costeado. `null` si ninguna pieza parada tiene costo. */
  soles: number | null;
  m3Total: number;
  m3Costeado: number;
  m3SinCosto: number;
  /** Madera de servicio: está parada, pero no es nuestra. */
  m3DeServicio: number;
  /** Guías (por N° de GTF, no por asiento) con algo parado y costeado. */
  guiasConCosto: number;
  /** Guías con piezas paradas que deberían tener factura y no la tienen. */
  guiasSinCosto: number;
  /** La guía con más plata parada en la cancha. */
  guiaMayor: { gtfNumber: string; proveedor: string | null; soles: number; m3: number } | null;
  /** La pieza COSTEADA que más días lleva parada y lo que vale (sin `hoy`, `null`). */
  masVieja: { id: string; codigo: string | null; gtfNumber: string | null; dias: number; soles: number } | null;
}

/**
 * Una guía es su N° de GTF, no su asiento: una guía de dos especies son dos
 * asientos (ADR-312) y la tarjeta decía «2 guías sin factura» por una sola.
 */
const claveGuia = (t: { gtfNumber?: string | null; woodEntryId?: string }) =>
  t.gtfNumber?.trim() || t.woodEntryId || "sin-guia";

/**
 * Valor de lo que sigue en el patio, pieza × costo por m³ de SU asiento.
 * Con `hoy`, además, la pieza costeada más vieja y lo que vale.
 */
export function valorDelPatio(trozas: readonly PiezaKpi[], hoy?: Date): ValorPatio {
  let soles = 0;
  let m3Total = 0;
  let m3Costeado = 0;
  let m3SinCosto = 0;
  let m3DeServicio = 0;
  const conCosto = new Map<string, { proveedor: string | null; soles: number; m3: number }>();
  const sinCosto = new Set<string>();
  let masVieja: ValorPatio["masVieja"] = null;
  for (const t of enPatio(trozas)) {
    const v = vol(t);
    const guia = claveGuia(t);
    m3Total += v;
    if (t.guiaMaderaDeTercero === true) {
      m3DeServicio += v;
      continue;
    }
    const porM3 = costoM3DeGuia(t);
    if (porM3 == null) {
      m3SinCosto += v;
      sinCosto.add(guia);
      continue;
    }
    const vale = v * porM3;
    soles += vale;
    m3Costeado += v;
    const g = conCosto.get(guia) ?? { proveedor: t.proveedor ?? null, soles: 0, m3: 0 };
    conCosto.set(guia, { ...g, soles: g.soles + vale, m3: g.m3 + v });
    const dias = hoy ? diasEnPatio(t, hoy) : null;
    if (dias != null && (masVieja == null || dias > masVieja.dias || (dias === masVieja.dias && vale > masVieja.soles))) {
      masVieja = { id: t.id, codigo: t.codificacion ?? null, gtfNumber: t.gtfNumber ?? null, dias, soles: r2(vale) };
    }
  }
  let guiaMayor: ValorPatio["guiaMayor"] = null;
  for (const [gtfNumber, g] of conCosto) {
    if (guiaMayor == null || g.soles > guiaMayor.soles) guiaMayor = { gtfNumber, ...g };
  }
  return {
    soles: conCosto.size > 0 ? r2(soles) : null,
    m3Total: r3(m3Total),
    m3Costeado: r3(m3Costeado),
    m3SinCosto: r3(m3SinCosto),
    m3DeServicio: r3(m3DeServicio),
    guiasConCosto: conCosto.size,
    guiasSinCosto: sinCosto.size,
    guiaMayor: guiaMayor ? { ...guiaMayor, soles: r2(guiaMayor.soles), m3: r3(guiaMayor.m3) } : null,
    masVieja,
  };
}

// ─── Cargar el costo desde el patio ───────────────────────────────────────

/** Una guía con piezas paradas que debería tener factura y no la tiene. */
export interface GuiaSinCosto {
  gtfNumber: string;
  proveedor: string | null;
  especies: string[];
  /** Piezas y m³ de esta guía que siguen en la cancha. */
  piezas: number;
  m3Patio: number;
  /** Días de su pieza parada más vieja (`null` = ninguna con fecha). */
  diasMax: number | null;
}

/**
 * Las guías que la tarjeta «Valor parado» cuenta como «sin factura», con lo
 * que hace falta para cargarles el costo: mismo criterio que `valorDelPatio`
 * (sólo lo parado, sin la madera de servicio). Primero la de más m³ parados:
 * es la que más mueve la cifra.
 */
export function guiasSinCostoDelPatio(trozas: readonly PiezaKpi[], hoy: Date): GuiaSinCosto[] {
  const porGuia = new Map<string, GuiaSinCosto & { _esp: Set<string> }>();
  for (const t of enPatio(trozas)) {
    if (t.guiaMaderaDeTercero === true || costoM3DeGuia(t) != null) continue;
    const clave = claveGuia(t);
    const g = porGuia.get(clave) ?? {
      gtfNumber: clave,
      proveedor: t.proveedor ?? null,
      especies: [],
      piezas: 0,
      m3Patio: 0,
      diasMax: null,
      _esp: new Set<string>(),
    };
    g.piezas += 1;
    g.m3Patio += vol(t);
    if (t.especieComun) g._esp.add(t.especieComun);
    const d = diasEnPatio(t, hoy);
    if (d != null && (g.diasMax == null || d > g.diasMax)) g.diasMax = d;
    porGuia.set(clave, g);
  }
  return [...porGuia.values()]
    .map(({ _esp, ...g }) => ({ ...g, m3Patio: r3(g.m3Patio), especies: [..._esp].sort((a, b) => a.localeCompare(b, "es")) }))
    .sort((a, b) => b.m3Patio - a.m3Patio || a.gtfNumber.localeCompare(b.gtfNumber, "es"));
}

export interface RepartoDeGuia {
  /** S/ de la guía entera (lo que va como «total de la factura»). */
  total: number;
  /** S/ por m³ de la guía: el mismo para todas sus especies. */
  porM3: number;
  m3Guia: number;
  /** Lo que le toca a cada asiento, proporcional a sus m³; suma exacta al céntimo. */
  lineas: Array<{ id: string; costoTotal: number }>;
}

/**
 * Un costo para la guía ENTERA, dicho como total o como S/ por m³, repartido
 * entre sus asientos (una especie cada uno) por los m³ que declara cada uno —
 * la misma regla que «Plata de la guía» en modo «total de la factura»
 * (`repartirPorVolumen`): todas las especies quedan al mismo S/ por m³. Si cada
 * especie tiene su precio, eso se carga en Ingresos → Plata de la guía.
 *
 * `null` si el monto no es un número > 0 o la guía no declara m³: un costo 0
 * diría «gratis», y sin m³ no hay contra qué repartir.
 */
export function repartoDeGuia(
  entrada: { de: "total" | "m3"; valor: number },
  asientos: readonly LineaParaRepartir[],
): RepartoDeGuia | null {
  const m3Guia = r3(asientos.reduce((a, l) => a + Math.max(0, Number(l.volumeM3) || 0), 0));
  if (!(entrada.valor > 0) || !Number.isFinite(entrada.valor) || !(m3Guia > 0)) return null;
  const total = r2(entrada.de === "total" ? entrada.valor : entrada.valor * m3Guia);
  if (!(total > 0)) return null;
  return { total, porM3: r2(total / m3Guia), m3Guia, lineas: repartirPorVolumen(total, asientos) };
}

/**
 * Las piezas con el costo recién guardado de su asiento (lo que contestó el
 * servidor), para que la tarjeta cambie sin esperar a releer el patio entero.
 */
export function conCostosCargados<T extends PiezaKpi>(trozas: readonly T[], costos: ReadonlyMap<string, number>): readonly T[] {
  if (costos.size === 0) return trozas;
  return trozas.map((t) =>
    t.woodEntryId && costos.has(t.woodEntryId) ? { ...t, guiaCostoTotal: costos.get(t.woodEntryId)! } : t,
  );
}

// ─── ¿Qué aserro primero? ─────────────────────────────────────────────────

export interface PrimeroALaSierra {
  /** Clave del tramo (la misma del filtro de la lista). */
  tramo: string;
  label: string;
  /** Desde cuántos días arranca el tramo: 0 = son todas frescas. */
  desde: number;
  piezas: number;
  m3: number;
  /** Días de la libre más vieja. */
  diasMax: number;
}

/**
 * Las libres del tramo más viejo que tenga alguna: primero entra lo que más
 * lleva parado (la troza se mancha y se raja, y la que se queda es la que se
 * pierde). `null` si no hay libres con fecha.
 */
export function primeroALaSierra(trozas: readonly PiezaKpi[], hoy: Date): PrimeroALaSierra | null {
  const porTramo = new Map<string, GrupoTrozas & { diasMax: number }>();
  for (const t of trozas) {
    if (estadoDeTroza(t) !== "libre") continue;
    const d = diasEnPatio(t, hoy);
    if (d == null) continue;
    const def = [...TRAMOS_ANTIGUEDAD].reverse().find((x) => d >= x.desde) ?? TRAMOS_ANTIGUEDAD[0];
    const g = porTramo.get(def.key) ?? { piezas: 0, m3: 0, diasMax: 0 };
    porTramo.set(def.key, { ...sumar(g, vol(t)), diasMax: Math.max(g.diasMax, d) });
  }
  for (const def of [...TRAMOS_ANTIGUEDAD].reverse()) {
    const g = porTramo.get(def.key);
    if (g) return { tramo: def.key, label: def.label, desde: def.desde, piezas: g.piezas, m3: g.m3, diasMax: g.diasMax };
  }
  return null;
}

/**
 * Pies tablares que daría lo libre si se aserrara hoy. ESTIMACIÓN:
 * m³ de troza × rendimiento del libro × 424 pt/m³. Sin rendimiento real → `null`.
 */
export function ptEstimados(m3Troza: number, rendimientoPct: number | null | undefined): number | null {
  /* Un rendimiento >100 % no existe en el aserrío: es un dato mal declarado, no se estima con él. */
  if (rendimientoPct == null || !Number.isFinite(rendimientoPct) || rendimientoPct <= 0 || rendimientoPct > 100) return null;
  if (!Number.isFinite(m3Troza) || m3Troza <= 0) return null;
  return Math.round(m3Troza * (rendimientoPct / 100) * PT_POR_M3);
}

// ─── ¿Qué se está echando a perder? ───────────────────────────────────────

/** Desde acá la troza parada ya se mancha: el segundo corte de la escala única. */
export const DIAS_RIESGO = TRAMOS_DIAS_PATIO[1];

export interface RiesgoPatio extends GrupoTrozas {
  /** Las claves de tramo que son riesgo: tocarlas filtra la lista. */
  claves: string[];
  /** Cuántos días faltan para que la más vieja entre a riesgo; `null` si ya entró o no hay fecha. */
  faltanDias: number | null;
}

export function riesgoDelPatio(tramos: readonly TramoAntiguedad[], masVieja: number | null): RiesgoPatio {
  const claves = TRAMOS_ANTIGUEDAD.filter((t) => t.desde >= DIAS_RIESGO).map((t) => t.key as string);
  let g = VACIO;
  for (const t of tramos) if (claves.includes(t.key)) g = { piezas: g.piezas + t.piezas, m3: r3(g.m3 + t.m3) };
  return { ...g, claves, faltanDias: masVieja != null && masVieja < DIAS_RIESGO ? DIAS_RIESGO - masVieja : null };
}

// ─── ¿Cómo se mueve? ──────────────────────────────────────────────────────

export interface FlujoPatio {
  dias: number;
  /** Piezas que bajaron del camión en la ventana (sin contar los pedazos de un retrozado). */
  entradas: GrupoTrozas;
  /** Piezas que entraron a una corrida en la ventana. */
  aSierra: GrupoTrozas;
  /** Piezas que salieron enteras con su guía en la ventana. */
  enteras: GrupoTrozas;
  /** Días promedio de la llegada a la sierra, sobre TODAS las aserradas con las dos fechas. */
  diasASierra: { promedio: number; piezas: number } | null;
}

const dia = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : null;
};
/** ¿Esa fecha cae en los últimos `dias` días (hoy incluido)? */
const enVentana = (fecha: string | null | undefined, hoy: Date, dias: number): boolean => {
  if (!fecha) return false;
  const d = diasParada({ fechaIngreso: fecha }, hoy);
  return d != null && d < dias;
};

export function flujoDelPatio(trozas: readonly PiezaKpi[], hoy: Date, dias = 30): FlujoPatio {
  let entradas = VACIO;
  let aSierra = VACIO;
  let enteras = VACIO;
  let sumaDias = 0;
  let conDias = 0;
  for (const t of trozas) {
    const e = estadoDeTroza(t);
    const v = vol(t);
    /* Un pedazo de retrozado no ENTRÓ: es madera que ya estaba (su madre). */
    const llego = !t.trozaOrigenId && !t.noRecepcionada && t.guiaRecepcionada !== false;
    const ingreso = t.fechaRecepcion ?? t.fechaIngreso;
    if (llego && enVentana(ingreso, hoy, dias)) entradas = sumar(entradas, v);
    if (e === "consumida") {
      if (enVentana(t.consumidaFecha, hoy, dias)) aSierra = sumar(aSierra, v);
      const a = llego ? dia(ingreso) : null; /* un pedazo de retrozado o una guía sin recibir no «llegó»: su fecha no mide la espera */
      const b = dia(t.consumidaFecha);
      if (a != null && b != null) {
        sumaDias += Math.max(0, Math.round((b - a) / 86_400_000));
        conDias += 1;
      }
    }
    if (e === "despachada" && enVentana(t.despachadaFecha, hoy, dias)) enteras = sumar(enteras, v);
  }
  return {
    dias,
    entradas,
    aSierra,
    enteras,
    diasASierra: conDias > 0 ? { promedio: Math.round((sumaDias / conDias) * 10) / 10, piezas: conDias } : null,
  };
}

// ─── ¿De qué grosor es la pila? ───────────────────────────────────────────

export interface ClaseDiametrica {
  /** cm, borde incluido. */
  desde: number;
  /** cm, borde excluido. */
  hasta: number;
  piezas: number;
  m3: number;
}

/**
 * Lo parado por clase de diámetro medio ((D1+D2)/2), de 10 en 10 cm — 20 si
 * la pila es tan dispareja que pasaría de 8 barras. Las clases intermedias
 * vacías se dibujan: un hueco en el histograma también es un dato.
 */
export function clasesDiametricas(trozas: readonly PiezaKpi[]): {
  clases: ClaseDiametrica[];
  conMedidas: number;
  sinMedidas: number;
} {
  const ds: { d: number; v: number }[] = [];
  let sinMedidas = 0;
  for (const t of enPatio(trozas)) {
    const m = medidasDePieza(t);
    if (m.d1 == null || m.d2 == null) {
      sinMedidas += 1;
      continue;
    }
    ds.push({ d: (m.d1 + m.d2) / 2, v: vol(t) });
  }
  if (ds.length === 0) return { clases: [], conMedidas: 0, sinMedidas };
  const min = Math.min(...ds.map((x) => x.d));
  const max = Math.max(...ds.map((x) => x.d));
  let ancho = 10;
  if (Math.floor(max / ancho) - Math.floor(min / ancho) + 1 > 8) ancho = 20;
  const primera = Math.floor(min / ancho) * ancho;
  const n = Math.floor(max / ancho) - Math.floor(min / ancho) + 1;
  const clases: ClaseDiametrica[] = Array.from({ length: n }, (_, i) => ({
    desde: primera + i * ancho,
    hasta: primera + (i + 1) * ancho,
    piezas: 0,
    m3: 0,
  }));
  for (const { d, v } of ds) {
    const c = clases[Math.floor(d / ancho) - Math.floor(min / ancho)];
    c.piezas += 1;
    c.m3 = r3(c.m3 + v);
  }
  return { clases, conMedidas: ds.length, sinMedidas };
}

// ─── ¿Aguanta una fiscalización? ──────────────────────────────────────────

export type ChequeoFiscal = "codigo" | "medidas" | "titulo" | "etiqueta" | "ubicacion";

export interface FilaFiscal {
  clave: ChequeoFiscal;
  label: string;
  /** Lo que se le explica a quien no sabe por qué importa. */
  hint: string;
  con: number;
  total: number;
  /** Las piezas paradas a las que les falta: para imprimir, anotar o filtrar. */
  faltan: string[];
  /** Lo pide el papel (código, puntas, título) o sólo ayuda a encontrarla. */
  legal: boolean;
}

export interface FiscalizacionPatio {
  /** Piezas paradas. */
  total: number;
  /** Las que tienen TODO lo que pide el papel (código + D1/D2 + título). */
  listas: number;
  filas: FilaFiscal[];
}

const CHEQUEOS: { clave: ChequeoFiscal; label: string; hint: string; legal: boolean; ok: (t: PiezaKpi) => boolean }[] = [
  { clave: "codigo", label: "Código", hint: "Codificación de la guía: se la pide por ese código", legal: true, ok: (t) => !esSinCodigo(t) },
  { clave: "medidas", label: "D1 y D2", hint: "Las dos puntas medidas: con eso se recalcula el volumen", legal: true, ok: (t) => !faltanMedidas(t) },
  { clave: "titulo", label: "Título", hint: "Título habilitante declarado: el origen legal de la madera", legal: true, ok: (t) => Boolean((t.permiso ?? "").trim()) },
  { clave: "etiqueta", label: "Etiqueta QR", hint: "Chapa impresa: se encuentra y se lee en la cancha", legal: false, ok: (t) => Boolean(t.etiquetadaEn) },
  { clave: "ubicacion", label: "Ubicada", hint: "Su carga está en una cancha del Mapa de Planta", legal: false, ok: (t) => Boolean(t.zonaId) },
];

/**
 * Qué tan fiscalizable está lo que sigue parado. «Ubicada» sólo se cuenta si el
 * endpoint informa la cancha de alguna pieza (`zonaId` definido): sin el dato,
 * decir «0 ubicadas» sería mentir.
 */
export function fiscalizacionDelPatio(trozas: readonly PiezaKpi[]): FiscalizacionPatio {
  const parados = enPatio(trozas);
  const conUbicacion = parados.some((t) => t.zonaId !== undefined);
  const chequeos = CHEQUEOS.filter((c) => c.clave !== "ubicacion" || conUbicacion);
  const filas: FilaFiscal[] = chequeos.map((c) => ({
    clave: c.clave,
    label: c.label,
    hint: c.hint,
    legal: c.legal,
    total: parados.length,
    con: 0,
    faltan: [],
  }));
  let listas = 0;
  for (const t of parados) {
    let todoLegal = true;
    chequeos.forEach((c, i) => {
      if (c.ok(t)) filas[i].con += 1;
      else {
        filas[i].faltan.push(t.id);
        if (c.legal) todoLegal = false;
      }
    });
    if (todoLegal) listas += 1;
  }
  return { total: parados.length, listas, filas };
}
