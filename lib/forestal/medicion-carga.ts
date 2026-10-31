/**
 * Cargas medidas en el monte (16-10, F3 de «Medir por foto», ADR-496).
 *
 * El celular del monte mide la cara de la carga por foto y GUARDA la carga;
 * la oficina la recoge desde el despacho con guía («Cargas medidas») y la pasa
 * a «Anotar a mano». Al registrar la guía, la carga queda `usada` con su N°.
 *
 *   medida ──(Usar en esta guía + registrar)──▶ usada (N° de guía)
 *     └────(Descartar, con motivo)───────────▶ descartada
 *
 * Security 16-10: el POST del despacho recibe los ids de las cargas y las
 * marca `usada` (`reservarCargas`) bajo el candado de la clave ANTES de
 * escribir el libro; si la guía no se registra, vuelven a `medida`
 * (`liberarCargas`). Antes el cliente las marcaba después y la misma carga
 * podía quedar en dos guías.
 *
 * No es un movimiento del libro (eso lo escribe el despacho al registrar): es
 * un borrador compartido entre el monte y la oficina, con vida de días. Vive
 * en KV (`ForestMedicionCargaDB`) y esta es su lógica PURA (client-safe):
 * validar las filas con la regla del libro, recalcular el volumen en el
 * servidor (regla 6), estados, tope y retención.
 */
import { z } from "zod";
import { TROZAS_POR_GUIA_MAX, trozaAManoSchema, volumenPorTroza, type TrozaAMano } from "./loth-trozas-a-mano";
import { CORRELATIVO_MAX, siguientesCorrelativos } from "./testas-medicion";

export type EstadoCarga = "medida" | "usada" | "descartada";
export type TipoFotoCarga = "original" | "anotada";

export interface Firma {
  en: string;
  por: string;
}

/** Una troza de la carga, como la dejó el monte y con el volumen del servidor. */
export interface FilaCarga {
  /** El N° que se le dio en el monte (el que va escrito en la foto anotada). */
  codigo: string;
  d1Cm: number;
  d2Cm: number;
  largoM: number;
  especie: string | null;
  /** Smalian SERFOR con las medidas del libro (`volumenPorTroza`), 4 decimales. */
  volumenM3: number;
  medidoPorFoto: boolean;
  /** D2 no se midió: va pareja (D2 = D1, ADR-492). */
  d2Supuesto: boolean;
  /** La foto no la vio clara (testa tapada o agregada a mano): se revisa con wincha. */
  dudosa: boolean;
}

export interface FotoCarga {
  /** Id del documento del Drive (carpeta del permiso › «Cargas medidas»). */
  docId: string;
  tipo: TipoFotoCarga;
  subida: Firma;
}

export interface CargaMedida {
  id: string;
  /** El permiso (plan) para el que se midió; `null` = sin permiso todavía. */
  planId: string | null;
  /** La especie si toda la carga es de una; `null` = varias o sin especie. */
  especie: string | null;
  /** El largo si toda la carga tiene el mismo; `null` = varios. */
  largoM: number | null;
  /** El N° con que arrancó la numeración en el monte. */
  desde: number;
  filas: FilaCarga[];
  trozas: number;
  volumenM3: number;
  fotos: FotoCarga[];
  /** Cuántas fotos dijo el monte que iba a subir: si faltan, se ve en las dos puntas. */
  fotosEsperadas: number;
  nota: string | null;
  estado: EstadoCarga;
  creada: Firma;
  usada?: Firma & { gtfNumber: string };
  descartada?: Firma & { motivo: string };
}

export interface AlmacenCargas {
  cargas: CargaMedida[];
}

/*
 * Topes medidos para que la fila KV no pase de ~1 MB (se lee entera en cada
 * GET y se reescribe en cada guardado). Peor caso: 150 trozas con N° de 12 y
 * especie de 60 letras, 12 fotos, nota y firmas largas = 34,7 KB por carga;
 * por 25 cargas = 0,87 MB (medido 16-10; lo vigila un test). Una carga real
 * de 14 trozas con 2 fotos pesa 2,7 KB.
 */
/** Cargas sin usar a la vez: más es una carga que nadie recoge (o un bucle). */
export const MAX_CARGAS_VIVAS = 20;
/** Cargas guardadas en total (las terminadas se podan primero). */
export const MAX_CARGAS = 25;
/** Cargas que lleva una guía (el despacho las marca usadas al registrar). */
export const MAX_CARGAS_POR_GUIA = 10;
/** Lo usado o descartado se guarda 30 días; lo medido sin usar no vence solo. */
export const RETENCION_DIAS = 30;
/** Fotos por carga: original + anotada por cada foto que se midió. */
export const MAX_FOTOS_POR_CARGA = 12;

const DIA_MS = 86_400_000;

/* ── Entrada (lo que manda el monte) ─────────────────────────────────────── */

export const filaEntradaSchema = z.object({
  codigo: z.string().trim().min(1).max(12, "El N° de la troza es muy largo"),
  d1Cm: z.number().finite(),
  d2Cm: z.number().finite(),
  largoM: z.number().finite(),
  especie: z.string().trim().max(60, "La especie es muy larga").nullish(),
  medidoPorFoto: z.boolean().optional(),
  d2Supuesto: z.boolean().optional(),
  dudosa: z.boolean().optional(),
});
export type FilaEntrada = z.infer<typeof filaEntradaSchema>;

export const nuevaCargaSchema = z.object({
  planId: z.string().trim().min(1).max(64).nullable(),
  desde: z.number().int().min(1).max(CORRELATIVO_MAX),
  fotosEsperadas: z.number().int().min(0).max(MAX_FOTOS_POR_CARGA),
  nota: z.string().trim().max(300).nullish(),
  filas: z.array(filaEntradaSchema).min(1, "La carga no tiene trozas").max(TROZAS_POR_GUIA_MAX, `Una carga lleva hasta ${TROZAS_POR_GUIA_MAX} trozas`),
});
export type NuevaCarga = z.infer<typeof nuevaCargaSchema>;

export type ResultadoArmar = { ok: true; carga: CargaMedida } | { ok: false; fila: string; mensaje: string };

const r4 = (v: number): number => Math.round(v * 10000) / 10000;
const unico = <T>(v: readonly T[]): T | null => (v.length > 0 && v.every((x) => x === v[0]) ? (v[0] ?? null) : null);

/**
 * La carga como se guarda: cada fila pasa por la MISMA regla que el alta a
 * mano (`trozaAManoSchema`: rangos de Ø y largo, volumen > 0) y el volumen lo
 * calcula el servidor. Una fila mala rechaza la carga con su código: el monte
 * la corrige antes de guardar, no la oficina después.
 */
export function armarCarga(entrada: NuevaCarga, firma: Firma, id: string): ResultadoArmar {
  const filas: FilaCarga[] = [];
  const codigos = new Set<string>();
  for (const f of entrada.filas) {
    if (codigos.has(f.codigo)) return { ok: false, fila: f.codigo, mensaje: `El N° ${f.codigo} está dos veces en la carga.` };
    codigos.add(f.codigo);
    const r = trozaAManoSchema.safeParse({ d1Cm: f.d1Cm, d2Cm: f.d2Cm, largoM: f.largoM, cantidad: 1, especie: f.especie ?? null });
    if (!r.success) return { ok: false, fila: f.codigo, mensaje: `Troza ${f.codigo}: ${r.error.issues[0]?.message ?? "medida fuera de rango"}.` };
    const t = r.data;
    filas.push({
      codigo: f.codigo,
      d1Cm: t.d1Cm,
      d2Cm: t.d2Cm,
      largoM: t.largoM,
      especie: t.especie?.trim() || null,
      volumenM3: volumenPorTroza(t),
      medidoPorFoto: f.medidoPorFoto === true,
      d2Supuesto: f.d2Supuesto === true,
      dudosa: f.dudosa === true,
    });
  }
  return {
    ok: true,
    carga: {
      id,
      planId: entrada.planId,
      especie: unico(filas.map((f) => f.especie)),
      largoM: unico(filas.map((f) => f.largoM)),
      desde: entrada.desde,
      filas,
      trozas: filas.length,
      volumenM3: r4(filas.reduce((s, f) => s + f.volumenM3, 0)),
      fotos: [],
      fotosEsperadas: entrada.fotosEsperadas,
      nota: entrada.nota?.trim() || null,
      estado: "medida",
      creada: firma,
    },
  };
}

/** Las filas de la carga como las toma «Anotar a mano» del despacho (una troza por fila). */
export function filasParaLaGuia(c: Pick<CargaMedida, "filas">): TrozaAMano[] {
  return c.filas.map((f) => ({
    d1Cm: f.d1Cm,
    d2Cm: f.d2Cm,
    largoM: f.largoM,
    cantidad: 1,
    especie: f.especie,
    ...(f.medidoPorFoto ? { medidoPorFoto: true } : {}),
    ...(f.d2Supuesto ? { d2Supuesto: true } : {}),
  }));
}

/* ── Almacén ─────────────────────────────────────────────────────────────── */

const esFirma = (v: unknown): v is Firma =>
  typeof v === "object" && v !== null && typeof (v as Firma).en === "string" && typeof (v as Firma).por === "string";

function esCarga(v: unknown): v is CargaMedida {
  if (typeof v !== "object" || v === null) return false;
  const c = v as CargaMedida;
  return (
    typeof c.id === "string" &&
    (c.estado === "medida" || c.estado === "usada" || c.estado === "descartada") &&
    Array.isArray(c.filas) &&
    Array.isArray(c.fotos) &&
    esFirma(c.creada)
  );
}

/** Lo guardado → almacén. Una carga rota se descarta sin tumbar las demás. */
export function normalizarAlmacen(v: unknown): AlmacenCargas {
  const crudo = typeof v === "object" && v !== null ? (v as { cargas?: unknown }).cargas : null;
  return { cargas: Array.isArray(crudo) ? crudo.filter(esCarga) : [] };
}

export const esViva = (c: Pick<CargaMedida, "estado">): boolean => c.estado === "medida";

/** Cuándo terminó (usada o descartada): la retención se cuenta desde ahí. */
const finDe = (c: CargaMedida): string => c.usada?.en ?? c.descartada?.en ?? c.creada.en;

/**
 * Lo terminado hace más de 30 días se va; si aun así pasa del tope, se van
 * los terminados más viejos. Una carga sin usar NUNCA se poda: es trabajo del
 * monte que nadie recogió todavía (sus fotos siguen en el Drive igual).
 */
export function podar(alm: AlmacenCargas, ahora: number, max = MAX_CARGAS): AlmacenCargas {
  const limite = ahora - RETENCION_DIAS * DIA_MS;
  let cargas = alm.cargas.filter((c) => esViva(c) || Date.parse(finDe(c)) >= limite);
  if (cargas.length > max) {
    const terminadas = cargas.filter((c) => !esViva(c)).sort((a, b) => finDe(a).localeCompare(finDe(b)));
    const sobran = new Set(terminadas.slice(0, cargas.length - max).map((c) => c.id));
    cargas = cargas.filter((c) => !sobran.has(c.id));
  }
  return cargas.length === alm.cargas.length ? alm : { cargas };
}

/** Las que la oficina puede usar, la más nueva primero. */
export function vigentes(alm: AlmacenCargas): CargaMedida[] {
  return alm.cargas.filter(esViva).sort((a, b) => b.creada.en.localeCompare(a.creada.en));
}

/** Lo terminado más reciente (para que el monte vea qué pasó con lo suyo). */
export function recientes(alm: AlmacenCargas, n = 10): CargaMedida[] {
  return alm.cargas
    .filter((c) => !esViva(c))
    .sort((a, b) => finDe(b).localeCompare(finDe(a)))
    .slice(0, n);
}

export type ResultadoCrear = { ok: true; almacen: AlmacenCargas; carga: CargaMedida } | { ok: false; motivo: "tope" };

export function crearCarga(alm: AlmacenCargas, carga: CargaMedida, ahora: number): ResultadoCrear {
  const podado = podar(alm, ahora);
  if (podado.cargas.filter(esViva).length >= MAX_CARGAS_VIVAS) return { ok: false, motivo: "tope" };
  const almacen = podar({ cargas: [...podado.cargas, carga] }, ahora);
  return { ok: true, almacen, carga };
}

export type FalloCarga = "no_existe" | "cerrada" | "tope_fotos" | "otra_guia";

export type ResultadoCambio =
  | { ok: true; almacen: AlmacenCargas; carga: CargaMedida; cambio: boolean }
  | { ok: false; motivo: FalloCarga; carga?: CargaMedida };

function reemplazar(alm: AlmacenCargas, c: CargaMedida): AlmacenCargas {
  return { cargas: alm.cargas.map((x) => (x.id === c.id ? c : x)) };
}

/** Ata una foto ya subida al Drive. Sólo mientras la carga está sin usar. */
export function agregarFoto(alm: AlmacenCargas, id: string, foto: FotoCarga): ResultadoCambio {
  const c = alm.cargas.find((x) => x.id === id);
  if (!c) return { ok: false, motivo: "no_existe" };
  if (!esViva(c)) return { ok: false, motivo: "cerrada", carga: c };
  if (c.fotos.some((f) => f.docId === foto.docId)) return { ok: true, almacen: alm, carga: c, cambio: false };
  if (c.fotos.length >= MAX_FOTOS_POR_CARGA) return { ok: false, motivo: "tope_fotos", carga: c };
  const nueva: CargaMedida = { ...c, fotos: [...c.fotos, foto] };
  return { ok: true, almacen: reemplazar(alm, nueva), carga: nueva, cambio: true };
}

export type AccionCarga = { accion: "usada"; gtfNumber: string } | { accion: "descartar"; motivo: string };

/**
 * medida → usada (con el N° de la guía) o descartada (con el motivo).
 * Marcar usada dos veces con la MISMA guía no es error (el reintento del
 * despacho tras un corte); con otra guía, sí: la misma carga no sale dos veces.
 */
export function aplicarAccion(alm: AlmacenCargas, id: string, a: AccionCarga, firma: Firma): ResultadoCambio {
  const c = alm.cargas.find((x) => x.id === id);
  if (!c) return { ok: false, motivo: "no_existe" };
  if (a.accion === "usada") {
    const gtf = a.gtfNumber.trim();
    if (c.estado === "usada") {
      return c.usada?.gtfNumber === gtf ? { ok: true, almacen: alm, carga: c, cambio: false } : { ok: false, motivo: "otra_guia", carga: c };
    }
    if (c.estado !== "medida") return { ok: false, motivo: "cerrada", carga: c };
    const nueva: CargaMedida = { ...c, estado: "usada", usada: { ...firma, gtfNumber: gtf } };
    return { ok: true, almacen: reemplazar(alm, nueva), carga: nueva, cambio: true };
  }
  if (c.estado !== "medida") return { ok: false, motivo: "cerrada", carga: c };
  const nueva: CargaMedida = { ...c, estado: "descartada", descartada: { ...firma, motivo: a.motivo.trim() } };
  return { ok: true, almacen: reemplazar(alm, nueva), carga: nueva, cambio: true };
}

export type ResultadoReservar =
  | { ok: true; almacen: AlmacenCargas; cargas: CargaMedida[]; cambiadas: string[] }
  | { ok: false; motivo: FalloCarga; id: string; carga?: CargaMedida };

/**
 * El registro de la guía marca `usada` TODAS sus cargas, o ninguna: si una ya
 * va en otra guía, está descartada o no existe, no se toca nada (y el
 * despacho no escribe el libro). Ya usada con ESTA guía = reintento: pasa,
 * pero no cuenta en `cambiadas` (si el registro falla, no se suelta: la
 * marcó otro pedido).
 */
export function reservarCargas(alm: AlmacenCargas, ids: readonly string[], gtfNumber: string, firma: Firma): ResultadoReservar {
  let almacen = alm;
  const cargas: CargaMedida[] = [];
  const cambiadas: string[] = [];
  for (const id of new Set(ids)) {
    const r = aplicarAccion(almacen, id, { accion: "usada", gtfNumber }, firma);
    if (!r.ok) return { ok: false, motivo: r.motivo, id, ...(r.carga ? { carga: r.carga } : {}) };
    almacen = r.almacen;
    cargas.push(r.carga);
    if (r.cambio) cambiadas.push(id);
  }
  return { ok: true, almacen, cargas, cambiadas };
}

/**
 * El registro falló: las que ESTE pedido marcó vuelven a `medida`. Sólo si
 * siguen usadas con el mismo N° y la misma firma (`en` + `por`): una que otro
 * pedido marcó después no se suelta.
 */
export function liberarCargas(
  alm: AlmacenCargas,
  ids: readonly string[],
  gtfNumber: string,
  firma: Firma,
): { almacen: AlmacenCargas; liberadas: string[] } {
  const pedidas = new Set(ids);
  const gtf = gtfNumber.trim();
  const liberadas: string[] = [];
  const cargas = alm.cargas.map((c) => {
    const u = c.usada;
    if (!pedidas.has(c.id) || c.estado !== "usada" || !u || u.gtfNumber !== gtf || u.en !== firma.en || u.por !== firma.por) return c;
    liberadas.push(c.id);
    const { usada: _usada, ...resto } = c;
    return { ...resto, estado: "medida" as const };
  });
  return { almacen: liberadas.length ? { cargas } : alm, liberadas };
}

/** «24 a 37» / «24» / «A-1, …»: el rango de N° que lleva la foto. */
export function rangoDeCodigos(filas: readonly Pick<FilaCarga, "codigo">[]): string {
  if (filas.length === 0) return "—";
  const primero = filas[0]?.codigo ?? "";
  const ultimo = filas[filas.length - 1]?.codigo ?? "";
  return filas.length === 1 ? primero : `${primero} a ${ultimo}`;
}

/** Fotos que se esperaban y no llegaron (la subida falló o se cortó). */
export const fotosQueFaltan = (c: Pick<CargaMedida, "fotos" | "fotosEsperadas">): number => Math.max(0, c.fotosEsperadas - c.fotos.length);

/**
 * El N° que sigue por permiso contando también las cargas SIN USAR del monte:
 * el libro todavía no las tiene, y sin esto dos cargas del mismo permiso
 * medidas el mismo día arrancarían las dos en el mismo N° (la foto anotada
 * de la segunda diría «24» otra vez).
 */
export function correlativosConCargas(
  base: Readonly<Record<string, number>>,
  cargas: readonly Pick<CargaMedida, "planId" | "filas" | "estado">[],
): Record<string, number> {
  const deCargas = siguientesCorrelativos(cargas.filter(esViva).flatMap((c) => c.filas.map((f) => ({ planId: c.planId, trozaCode: f.codigo }))));
  const out: Record<string, number> = { ...base };
  for (const [k, n] of Object.entries(deCargas)) out[k] = Math.max(out[k] ?? 1, n);
  return out;
}

/** «PO-2026-001 · Juan Pérez»: el permiso como se reconoce en el monte y en la oficina. */
export function etiquetaPermiso(
  p: { planNumber?: string | null; tituloHabilitante?: string | null; titularName?: string | null } | null | undefined,
): string | null {
  if (!p) return null;
  const partes = [p.tituloHabilitante?.trim() || p.planNumber?.trim(), p.titularName?.trim()].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}
