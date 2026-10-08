/**
 * tramites-relacion-guias — el anexo del trámite "Relación de guías emitidas"
 * (ADR-364): una fila por GTF que se declara a SERFOR, con su lista de trozas.
 *
 * Vive aparte de `tramites-catalogo` porque tiene forma propia (una tabla, no
 * campos sueltos) y de `guias-emitidas` porque ésa deriva del despacho — acá se
 * declara lo que el titular decide presentar, que puede incluir guías que el
 * libro no vio (monte→SERFOR, talonario anulado antes de registrar). Cuando la
 * fila SÍ viene del libro (`origen: "libro"`) se marca para que el operador sepa
 * qué está verificado y qué tipeó a mano.
 *
 * PURO: sin React, sin fetch, sin DOM. Se serializa como el valor de UN campo
 * del trámite (`datos.guiasJson`), mismo mecanismo que el resto del formulario.
 */

import { codigoImpreso } from "./loth-guia-despacho";
import { leerGtfDatos } from "./ctp-gtf-datos";
import type { GuiaEmitida } from "./guias-emitidas";
import type { TramiteRegistro } from "./tramites-registro";

export interface FilaGuiaInforme {
  /** Clave estable de la fila en la UI — no viaja a ningún otro sistema. */
  uid: string;
  numero: string;
  /** `YYYY-MM-DD`. */
  fecha: string;
  destinatario: string;
  especie: string;
  producto: string;
  /** Texto, no número: conserva la unidad tal cual la declaró el libro o el operador. */
  cantidad: string;
  unidad: string;
  /** Detalle de trozas — código y medida, una por línea. Vacío se declara vacío, nunca se inventa. */
  trozas: string;
  anulada: boolean;
  /** Sólo tiene sentido si `anulada`. */
  motivo: string;
  /** Permiso / título habilitante de la guía (vacío en filas viejas o manuales). */
  permiso?: string;
  /**
   * N° de la «Lista de trozas» que acompaña a la guía (`gtfDatos.guia.
   * listaTrozasNro`). Vacío = la guía no lo trae: el papel pone el N° de la
   * GTF y la pantalla lo marca para revisar (`listaDeTrozas`).
   */
  listaTrozasNro?: string;
  /** Desglose por especie, sólo si la guía lleva más de una (de sus ítems): con una, la fila ya lo dice. */
  porEspecie?: EspecieDeGuia[];
  /**
   * De dónde salió la fila — para que el operador sepa qué está verificado
   * contra un libro y qué tipeó a mano:
   * `"ctp"` = despacho del Libro CTP (`guias-emitidas.ts`, ADR-321).
   * `"loth"` = GTF de trozas del Libro de Títulos Habilitantes (`ForestGtf`).
   * `"manual"` = la tipeó el operador.
   */
  origen: "ctp" | "loth" | "manual";
}

/** Trozas y m³ de una especie dentro de una guía (o del total de la relación). */
export interface EspecieDeGuia {
  especie: string;
  trozas: number;
  /** `null` = no declarado en m³ (pt, unidades). */
  m3: number | null;
}

export const nuevaFilaGuia = (
  uid: string,
  over: Partial<Omit<FilaGuiaInforme, "uid">> = {},
): FilaGuiaInforme => ({
  uid,
  numero: "",
  fecha: "",
  destinatario: "",
  especie: "",
  producto: "",
  cantidad: "",
  unidad: "",
  trozas: "",
  anulada: false,
  motivo: "",
  origen: "manual",
  ...over,
});

/** Lo que la relación lee de una guía del CTP (también lo arma `tramites-desde-guias` con las elegidas). */
export type GuiaEmitidaParaRelacion = Pick<
  GuiaEmitida,
  "gtfNumber" | "fecha" | "destinatario" | "destino" | "especie" | "producto" | "cantidad" | "unidad" | "estado"
>;

/** Una guía ya derivada del despacho (`guias-emitidas.ts`), lista para la relación. */
export function filaDesdeGuiaEmitida(uid: string, g: GuiaEmitidaParaRelacion): FilaGuiaInforme {
  return nuevaFilaGuia(uid, {
    numero: g.gtfNumber,
    fecha: g.fecha.slice(0, 10),
    destinatario: g.destinatario ?? g.destino ?? "",
    especie: g.especie ?? "",
    producto: g.producto ?? "",
    cantidad: g.cantidad != null ? String(g.cantidad) : "",
    unidad: g.unidad ?? "",
    // Sin lista de trozas: `guias-emitidas` no la trae (es un agregado del
    // despacho). Queda en blanco a propósito — un valor inventado acá es peor
    // que uno ausente.
    trozas: "",
    anulada: g.estado === "anulada",
    origen: "ctp",
  });
}

/** Un ítem (troza) de una `ForestGtf` del Libro de Títulos Habilitantes. */
export interface ItemGtfLoth {
  /** Código ÚNICO de la troza en el libro (`trozaCode`). */
  code?: string | null;
  /**
   * El código tal como viene impreso en la guía, sólo si difiere del único
   * (ADR-474: «12A» que ya salió con otra guía del mismo permiso → `code`
   * «12A (0000002)», `codigoGuia` «12A»). La hoja SERFOR y la relación
   * imprimen éste (`codigoImpreso`).
   */
  codigoGuia?: string | null;
  treeCode?: string | null;
  species?: string | null;
  diamMayorM?: number | null;
  diamMenorM?: number | null;
  lengthM?: number | null;
  volumeM3?: number | null;
  productType?: string | null;
}

/** Subconjunto de `ForestGtf` (Prisma) que necesita el adaptador — sin importar el modelo. */
export interface GtfLothLike {
  gtfNumber: string;
  gtfDate: string | Date | null;
  destino?: string | null;
  tipo?: string | null;
  volumenTotalM3?: number | null;
  status: string;
  annulledReason?: string | null;
  /** El permiso / título habilitante que cita la guía. */
  tituloHabilitante?: string | null;
  /** N° de la lista de trozas, ya leído; si no viene, se lee de `gtfDatos` (la fila cruda de `/gtf`). */
  listaTrozasNro?: string | null;
  gtfDatos?: unknown;
  items: ItemGtfLoth[];
}

/** Trozas y m³ por especie de los ítems, sólo si hay más de una especie. */
function porEspecieDe(items: readonly ItemGtfLoth[]): EspecieDeGuia[] | undefined {
  const mapa = new Map<string, EspecieDeGuia>();
  for (const it of items) {
    const especie = (it.species ?? "").trim();
    if (!especie) continue;
    const ya = mapa.get(especie.toUpperCase()) ?? { especie, trozas: 0, m3: null };
    ya.trozas += 1;
    if (it.volumeM3 != null) ya.m3 = Math.round(((ya.m3 ?? 0) + it.volumeM3) * 1000) / 1000;
    mapa.set(especie.toUpperCase(), ya);
  }
  return mapa.size > 1 ? [...mapa.values()] : undefined;
}

/**
 * Una línea legible por troza: código y medidas, tal como se escribiría a
 * mano. Una medida ausente se OMITE, nunca se marca con un "?" — un casillero
 * que no se sabe se declara vacío, no con un signo que parece un dato real.
 */
function lineaDeItem(it: ItemGtfLoth): string {
  /* El código como lo imprime la guía (ADR-474): lo que va a SERFOR tiene que
     coincidir con SNIFFS, no con el código único del libro («12A (0000002)»). */
  const codigo = codigoImpreso(it) || null;
  const diam =
    it.diamMayorM != null || it.diamMenorM != null
      ? `Ø${it.diamMayorM ?? "—"}/${it.diamMenorM ?? "—"}m`
      : null;
  const largo = it.lengthM != null ? `L${it.lengthM}m` : null;
  return [codigo, it.species, diam, largo, it.volumeM3 != null ? `${it.volumeM3} m³` : null]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Una GTF de trozas del Libro TH, lista para la relación. A diferencia de la
 * del CTP, ACÁ SÍ hay lista de trozas real (`ForestGtf.items` guarda código y
 * medida por pieza) — se arma sola, no queda para completar a mano.
 */
export function filaDesdeGtfLoth(uid: string, g: GtfLothLike): FilaGuiaInforme {
  const items = g.items ?? [];
  const especies = [...new Set(items.map((i) => i.species).filter((s): s is string => Boolean(s)))];
  const fecha = g.gtfDate ? new Date(g.gtfDate).toISOString().slice(0, 10) : "";
  const lista = g.listaTrozasNro ?? (g.gtfDatos != null ? leerGtfDatos(g.gtfDatos).guia.listaTrozasNro : "");
  const porEspecie = porEspecieDe(items);
  return nuevaFilaGuia(uid, {
    numero: g.gtfNumber,
    fecha,
    destinatario: g.destino ?? "",
    especie: especies.length > 1 ? `${especies.length} especies` : (especies[0] ?? ""),
    producto: g.tipo === "trozas" ? "Trozas" : (items[0]?.productType ?? ""),
    cantidad: g.volumenTotalM3 != null ? String(g.volumenTotalM3) : "",
    unidad: "m3",
    trozas: items.map(lineaDeItem).join("\n"),
    anulada: g.status === "anulada",
    motivo: g.annulledReason ?? "",
    permiso: g.tituloHabilitante?.trim() ?? "",
    listaTrozasNro: (lista ?? "").trim(),
    ...(porEspecie ? { porEspecie } : {}),
    origen: "loth",
  });
}

export interface ResumenGuiasInforme {
  emitidas: number;
  anuladas: number;
  /** Vigentes sin lista de trozas cargada — lo que falta antes de presentar. */
  sinTrozas: number;
}

export function resumenGuiasInforme(filas: FilaGuiaInforme[]): ResumenGuiasInforme {
  let emitidas = 0;
  let anuladas = 0;
  let sinTrozas = 0;
  for (const f of filas) {
    if (f.anulada) anuladas += 1;
    else {
      emitidas += 1;
      if (!f.trozas.trim()) sinTrozas += 1;
    }
  }
  return { emitidas, anuladas, sinTrozas };
}

/** N° repetidos entre las vigentes — mismo criterio que `guias-emitidas.numerosRepetidos`. */
export function numerosGuiaRepetidos(filas: FilaGuiaInforme[]): string[] {
  const cuenta = new Map<string, number>();
  for (const f of filas) {
    const n = f.numero.trim();
    if (!n || f.anulada) continue;
    cuenta.set(n, (cuenta.get(n) ?? 0) + 1);
  }
  return [...cuenta.entries()].filter(([, n]) => n > 1).map(([n]) => n);
}

export function serializeGuiasInforme(filas: FilaGuiaInforme[]): string {
  return filas.length === 0 ? "" : JSON.stringify(filas);
}

const s = (v: unknown): string => (typeof v === "string" ? v : "");

function porEspecieGuardado(v: unknown): EspecieDeGuia[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((x) => (x ?? {}) as Record<string, unknown>)
    .map((x) => ({
      especie: s(x.especie),
      trozas: typeof x.trozas === "number" && Number.isFinite(x.trozas) ? x.trozas : 0,
      m3: typeof x.m3 === "number" && Number.isFinite(x.m3) ? x.m3 : null,
    }))
    .filter((x) => x.especie.trim());
  return out.length ? out : undefined;
}

/** Tolerante a basura: un JSON roto o viejo vuelve `[]`, nunca tira. */
export function parseGuiasInforme(json: string | undefined | null): FilaGuiaInforme[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const porEspecie = porEspecieGuardado(o.porEspecie);
    return {
      uid: s(o.uid) || `fila-${i}`,
      numero: s(o.numero),
      fecha: s(o.fecha),
      destinatario: s(o.destinatario),
      especie: s(o.especie),
      producto: s(o.producto),
      cantidad: s(o.cantidad),
      unidad: s(o.unidad),
      trozas: s(o.trozas),
      anulada: Boolean(o.anulada),
      motivo: s(o.motivo),
      permiso: s(o.permiso),
      listaTrozasNro: s(o.listaTrozasNro),
      ...(porEspecie ? { porEspecie } : {}),
      origen: o.origen === "ctp" || o.origen === "loth" ? o.origen : "manual",
    } satisfies FilaGuiaInforme;
  });
}

// ─── Lista de trozas y totales (Brandon 08-10) ───────────────────────────────

/** ¿La fila es de trozas? La del CTP ampara producto (madera aserrada…): no lleva lista de trozas. */
const esDeTrozas = (f: FilaGuiaInforme): boolean => f.origen !== "ctp" || /troza/i.test(f.producto);

/**
 * El N° de la «Lista de trozas» de la guía, como va al papel. Si la guía no lo
 * trae, el N° de la GTF (`derivada`: la pantalla lo marca para revisar, el papel
 * no). `null` si la guía no es de trozas o no tiene ningún número.
 */
export function listaDeTrozas(f: FilaGuiaInforme): { nro: string; derivada: boolean } | null {
  const nro = (f.listaTrozasNro ?? "").trim();
  if (nro) return { nro, derivada: false };
  if (!esDeTrozas(f) || !f.numero.trim()) return null;
  return { nro: f.numero.trim(), derivada: true };
}

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

const lineasDe = (t: string): number => t.split("\n").filter((l) => l.trim()).length;

/** El m³ que declara la fila: sólo si su unidad es m³ y la cantidad es un número («1.43»; «1,43» también). */
export function m3DeFila(f: Pick<FilaGuiaInforme, "cantidad" | "unidad">): number | null {
  if (f.unidad.trim().toLowerCase().replace("³", "3") !== "m3") return null;
  const c = f.cantidad.trim().replace(/\s/g, "");
  const n = Number(/^\d+,\d+$/.test(c) ? c.replace(",", ".") : c);
  return c && Number.isFinite(n) ? n : null;
}

export interface TotalesRelacion {
  /** Por especie, en orden alfabético. `m3` nulo = ninguna de sus guías declara m³ (pt, unidades). */
  especies: EspecieDeGuia[];
  guias: number;
  trozas: number;
  m3: number | null;
}

const claveEspecieFila = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

/**
 * Trozas y m³ por especie de las guías EMITIDAS (las anuladas no movieron
 * madera). Una guía de varias especies suma su desglose (`porEspecie`); la de
 * una sola, su cantidad declarada y sus líneas de trozas. Es la suma de lo que
 * dice la propia tabla: un derivado del anexo, no un dato del libro.
 */
export function totalesPorEspecie(filas: readonly FilaGuiaInforme[]): TotalesRelacion {
  const mapa = new Map<string, EspecieDeGuia>();
  let guias = 0;
  let trozas = 0;
  let m3: number | null = null;
  for (const f of filas) {
    if (f.anulada) continue;
    guias += 1;
    const partes = f.porEspecie?.length
      ? f.porEspecie
      : [{ especie: f.especie.trim() || "Sin especie", trozas: lineasDe(f.trozas), m3: m3DeFila(f) }];
    for (const p of partes) {
      const k = claveEspecieFila(p.especie);
      const ya = mapa.get(k) ?? { especie: p.especie.trim(), trozas: 0, m3: null };
      ya.trozas += p.trozas;
      if (p.m3 != null) ya.m3 = r3((ya.m3 ?? 0) + p.m3);
      mapa.set(k, ya);
      trozas += p.trozas;
      if (p.m3 != null) m3 = r3((m3 ?? 0) + p.m3);
    }
  }
  return { especies: [...mapa.values()].sort((a, b) => a.especie.localeCompare(b.especie)), guias, trozas, m3 };
}

// ─── Ronda 4 (2026-08-20) — continuidad de período, historial, duplicados ────

/**
 * Relaciones YA guardadas de este formato (cualquier estado), la más
 * reciente primero por período "hasta" (o `updatedAt` si no lo tiene). Base
 * de la continuidad de período, el historial y el chequeo de duplicados —
 * las tres necesitan "qué se declaró antes", no cada una su propio filtro.
 */
export function relacionesDelFormato(tramites: TramiteRegistro[], formatoId: string): TramiteRegistro[] {
  return tramites
    .filter((t) => t.formatoId === formatoId)
    .slice()
    .sort((a, b) => (b.datos.periodoHasta || b.updatedAt || "").localeCompare(a.datos.periodoHasta || a.updatedAt || ""));
}

/** La última relación YA presentada (no borrador) con un "período — hasta"
 *  legible — `null` si no hay antecedente. Base común de las dos funciones
 *  de abajo: las dos preguntan "¿hasta cuándo llegó lo último declarado?". */
function ultimaPresentadaConPeriodo(relaciones: TramiteRegistro[]): TramiteRegistro | null {
  return relaciones.find((t) => t.estado !== "borrador" && /^\d{4}-\d{2}-\d{2}/.test(t.datos.periodoHasta ?? "")) ?? null;
}

/**
 * Sugerencia de "Período — desde": el día siguiente al "hasta" de la última
 * relación YA presentada — evita huecos o superposiciones entre
 * declaraciones consecutivas (lo que un fiscalizador cruza es que los
 * períodos se encadenen sin salto). `null` sin antecedente o con fecha rara.
 */
export function periodoDesdeSugerido(relaciones: TramiteRegistro[]): string | null {
  const ultima = ultimaPresentadaConPeriodo(relaciones);
  if (!ultima) return null;
  const d = new Date(`${ultima.datos.periodoHasta}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export interface AvisoPlazoRelacion {
  dias: number;
  numeroDocumento: string | null;
  periodoHasta: string;
}

/**
 * Cuántos días pasaron desde que terminó el período de la última relación
 * PRESENTADA, sin que haya una siguiente — `null` si no aplica (sin
 * antecedente, el "hasta" es de hoy o el futuro, o todavía no se cumplió
 * `diasLimite`). No es un plazo legal (la norma no fija uno para ESTA
 * relación en particular, ver §7 del skill serfor-osinfor-compliance): es el
 * recordatorio de que el siguiente tramo quedó sin declarar. Default 15 días
 * — el mismo criterio que `tramitesSinRespuesta` usa para "ir a preguntar".
 */
export function avisoPlazoRelacion(relaciones: TramiteRegistro[], hoy: Date, diasLimite = 15): AvisoPlazoRelacion | null {
  const ultima = ultimaPresentadaConPeriodo(relaciones);
  if (!ultima) return null;
  const d = new Date(`${ultima.datos.periodoHasta}T00:00:00Z`);
  const hoyUtc = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  const dias = Math.floor((hoyUtc - d.getTime()) / 86_400_000);
  if (dias < diasLimite) return null;
  return { dias, numeroDocumento: ultima.numeroDocumento, periodoHasta: ultima.datos.periodoHasta! };
}

export interface GtfDuplicada {
  numero: string;
  /** A qué otra relación pertenece — "N° 002-2026" o, sin numerar, una frase legible. */
  otraRelacion: string;
}

/**
 * N° de GTF de `filasActuales` que YA aparecen en OTRA relación guardada
 * (mismo formato, distinto id) — típicamente un tipeo repetido o la misma
 * guía declarada dos veces por error. Mira TODAS las filas de la otra
 * relación, emitida o anulada: aparecer en cualquiera de las dos ya amerita
 * revisar antes de presentar (a diferencia de `numerosGuiaRepetidos`, que
 * sólo mira DENTRO de la relación que se está llenando).
 */
export function gtfDuplicadaEntreRelaciones(filasActuales: FilaGuiaInforme[], otras: TramiteRegistro[]): GtfDuplicada[] {
  const otrasConNumeros = otras.map((t) => ({
    t,
    numeros: new Set(parseGuiasInforme(t.datos.guiasJson).map((g) => g.numero.trim()).filter(Boolean)),
  }));
  const encontradas: GtfDuplicada[] = [];
  const vistos = new Set<string>();
  for (const f of filasActuales) {
    const numero = f.numero.trim();
    if (!numero || vistos.has(numero)) continue;
    const otra = otrasConNumeros.find((o) => o.numeros.has(numero));
    if (otra) {
      vistos.add(numero);
      encontradas.push({ numero, otraRelacion: otra.t.numeroDocumento ? `N° ${otra.t.numeroDocumento}` : "otra relación sin N° asignado" });
    }
  }
  return encontradas;
}
