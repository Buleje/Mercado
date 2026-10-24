/**
 * cubicacion-registro — una cubicación GUARDADA: el lote que se midió, con su
 * nombre, su fecha y sus totales congelados. PURO y client-safe (lo usan el
 * componente y la capa de datos).
 *
 * POR QUÉ LOS TOTALES SE CONGELAN: la cubicación guardada es el respaldo de
 * algo que ya pasó (una compra, un despacho, una liquidación). Si mañana sube
 * el precio del pie tablar, el papel que se firmó no cambia — por eso el
 * registro guarda `totales` y `valor` calculados AL GUARDAR, no derivados al
 * leer. Las piezas quedan igual para poder reabrir y seguir trabajando.
 */

import type { PiezaCubicada } from "./cubicacion";
import { cubicarPieza, m3DesdePt } from "./cubicacion";
import { ORDEN_TIPO, type TipoComercial } from "./cubicacion-tipo";
import { OBSERVACION_MAX } from "./observacion-de-pieza";
import { ANCHO_CAMION_M_DEFAULT, ANCHO_CAMION_M_MAX, ANCHO_CAMION_M_MIN } from "./camion-croquis";
import { limaDateKey } from "@/lib/utils";

export interface CubicacionTotales {
  piezas: number;
  pieTablar: number;
  m3: number;
}

/** La trasera que viaja con la cubicación guardada (antes vivía sólo en localStorage). */
export interface TraseraGuardada {
  ids: string[];
  anchoM: number;
}

/**
 * Los datos del papel que no son medidas (Brandon 24-10, modal «Guardar
 * cubicación»): a quién se vende, de qué comunidad salió la madera, con qué
 * permiso y en qué camión. Todo opcional y texto libre; las fichas del
 * Directorio (`*ParteId`) son sólo el enlace para abrirlas, nunca la fuente
 * del origen legal (eso es la GTF y el Libro).
 */
export interface FichaCubicacion {
  /** La ficha del Directorio del comprador (`cliente` es su nombre). */
  clienteParteId?: string;
  /** Comunidad nativa (CCNN) o predio de donde se extrajo la madera. */
  comunidad?: string;
  comunidadParteId?: string;
  /** Título habilitante o permiso de origen («Permiso 25-UCA-…»). */
  tituloHabilitante?: string;
  placa?: string;
  chofer?: string;
  /** Adónde va la madera (ciudad, aserradero, depósito). */
  destino?: string;
  /** Dónde se cubicó (patio, puerto, playa del río). */
  lugar?: string;
}

export const CAMPOS_FICHA = [
  "clienteParteId", "comunidad", "comunidadParteId", "tituloHabilitante", "placa", "chofer", "destino", "lugar",
] as const satisfies readonly (keyof FichaCubicacion)[];

/** Tope de cada campo de la ficha (los `*ParteId` son ids: 60). */
export const FICHA_MAX = 120;

/** La ficha en forma canónica: sólo campos conocidos, recortados; vacía → `undefined`. */
export function normalizarFicha(raw: unknown): FichaCubicacion | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const fuente = raw as Record<string, unknown>;
  const ficha: FichaCubicacion = {};
  for (const k of CAMPOS_FICHA) {
    const v = fuente[k];
    if (typeof v !== "string" || !v.trim()) continue;
    ficha[k] = v.trim().slice(0, k.endsWith("ParteId") ? 60 : FICHA_MAX);
  }
  return Object.keys(ficha).length > 0 ? ficha : undefined;
}

export interface CubicacionRegistro {
  id: string;
  /** Nombre con el que el usuario la va a buscar ("Lote Tornillo · Pérez"). */
  nombre: string;
  /** Fecha del trabajo (date-only AAAA-MM-DD): puede no ser la de guardado. */
  fecha: string;
  /** A quién se le vendió / de quién se compró. Opcional. */
  cliente?: string;
  /** Especie predominante del lote, si se trabajó con una sola. */
  especie?: string;
  notas?: string;
  /** S/ por pie tablar al momento de guardar (el de las piezas sin `precio` propio). */
  precioPt: number;
  /** Valor del lote congelado: Σ PT de cada pieza × su precio (o `precioPt`). */
  valor: number;
  /** Comprador, comunidad de origen, permiso, camión… (sin el campo = cubicaciones viejas). */
  ficha?: FichaCubicacion;
  totales: CubicacionTotales;
  piezas: PiezaCubicada[];
  /** Línea de PRODUCCIÓN del Libro CTP que se creó desde esta cubicación
   *  ("Enviar al Libro"). Es el hilo que permite, desde un despacho, encontrar
   *  las medidas pieza por pieza que el Libro no guarda. */
  ctpEntryId?: string;
  /**
   * Las corridas que esta cubicación ampara, cuando se midió un conjunto
   * (ADR-369): un camión se cubica entero y cuadra contra los N paquetes que
   * van a salir, no contra uno. `ctpEntryId` sigue siendo el primero, para que
   * lo viejo que lee un solo id no deje de funcionar.
   */
  ctpEntryIds?: string[];
  /** GTF de salida asociada, si ya se conoce (informativo). */
  gtfNumber?: string;
  /** Parte trasera del camión: ids de las piezas que se ven al abrir la compuerta
   *  y el ancho del croquis. Sin el campo = sin trasera (cubicaciones viejas). */
  trasera?: TraseraGuardada;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

/**
 * La trasera a guardar: sólo ids que existen entre las piezas (los que no, se
 * descartan sin error) y el ancho dentro de rango. Sin ids y con el ancho de
 * fábrica no hay nada que guardar → `undefined`.
 */
export function normalizarTrasera(
  trasera: { ids: readonly string[]; anchoM: number } | undefined,
  piezas: readonly { id: string }[],
): TraseraGuardada | undefined {
  if (!trasera) return undefined;
  const existentes = new Set(piezas.map((p) => p.id));
  const ids = [...new Set(trasera.ids)].filter((id) => existentes.has(id));
  const anchoM = Math.min(ANCHO_CAMION_M_MAX, Math.max(ANCHO_CAMION_M_MIN, Number.isFinite(trasera.anchoM) ? trasera.anchoM : ANCHO_CAMION_M_DEFAULT));
  if (ids.length === 0 && anchoM === ANCHO_CAMION_M_DEFAULT) return undefined;
  return { ids, anchoM };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** ¿Es un tipo comercial de verdad? (`raw.tipo` llega como `unknown`, del JSON guardado.) */
const esTipoComercial = (v: unknown): v is TipoComercial =>
  typeof v === "string" && (ORDEN_TIPO as readonly string[]).includes(v);

/** Fecha de hoy en formato date-only, sin arrastrar la hora. */
/**
 * Hoy en Pucallpa (`AAAA-MM-DD`). Era el día UTC: desde las 19:00 de Lima ya
 * decía «mañana», y con ADR-430 esa fecha elige el trato vigente del cliente
 * en el cubicador — un precio que empieza mañana regía esta noche.
 */
export const hoyISO = (): string => limaDateKey();

/** Totales de un conjunto de piezas (los mismos que muestra la tabla). */
export function totalesDe(piezas: PiezaCubicada[]): CubicacionTotales {
  // El m³ sale del pie tablar total (÷ 424), igual que el total de la pantalla:
  // sumar los m³ ya redondeados de cada fila corría el total unas centésimas.
  const pieTablar = r2(piezas.reduce((a, p) => a + (Number(p.pieTablar) || 0), 0));
  return {
    piezas: piezas.reduce((a, p) => a + (Number(p.cantidad) || 0), 0),
    pieTablar,
    m3: m3DesdePt(pieTablar),
  };
}

/**
 * Deja una pieza en forma canónica y RECALCULA su cubicación: lo que llega del
 * cliente no se cree a ciegas (podría venir con un pie tablar inventado).
 */
function normalizarPieza(raw: Record<string, unknown>, i: number): PiezaCubicada {
  const num = (v: unknown, def = 0) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : def;
  };
  const unidad = (v: unknown, def: PiezaCubicada["uEspesor"]) =>
    v === "pulg" || v === "cm" || v === "pies" || v === "m" ? v : def;
  const base = {
    cantidad: Math.max(1, Math.round(num(raw.cantidad, 1))),
    espesor: num(raw.espesor, 1),
    ancho: num(raw.ancho, 1),
    largo: num(raw.largo, 1),
    uEspesor: unidad(raw.uEspesor, "pulg"),
    uAncho: unidad(raw.uAncho, "pulg"),
    uLargo: unidad(raw.uLargo, "pies"),
  };
  const { pieTablar, m3 } = cubicarPieza(base);
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : `p-${i}`,
    ...base,
    especie: typeof raw.especie === "string" && raw.especie ? raw.especie.slice(0, 60) : undefined,
    // Estos tres se perdían al guardar (2026-09-23): la whitelist vieja sólo
    // dejaba pasar la medida. `codigo` sigue sin mapearse a propósito — es
    // interno del cubicado y nunca llega al servidor (`sinCodigoDeTroza`).
    dueno: typeof raw.dueno === "string" && raw.dueno.trim() ? raw.dueno.trim().slice(0, 120) : undefined,
    duenoParteId:
      typeof raw.duenoParteId === "string" && raw.duenoParteId.trim() ? raw.duenoParteId.trim().slice(0, 60) : undefined,
    tipo: esTipoComercial(raw.tipo) ? raw.tipo : undefined,
    observacion:
      typeof raw.observacion === "string" && raw.observacion.trim()
        ? raw.observacion.trim().slice(0, OBSERVACION_MAX)
        : undefined,
    /* 0 es un precio válido («esta pieza no se cobra»); sólo lo que no es número se descarta. */
    precio: precioValido(raw.precio),
    pieTablar,
    m3,
  };
}

/** S/ por PT de una pieza tal como llega (≥ 0, 2 decimales); lo que no es número → `undefined`. */
function precioValido(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? r2(Math.min(n, 999999)) : undefined;
}

/**
 * El precio por PT con que se valorizó cada pieza de una cubicación guardada:
 * el suyo, o el del lote. Lo usan el detalle y el comparador para que el
 * valor por especie sume EXACTO el `valor` guardado.
 */
export const precioDeCubicacion = (c: Pick<CubicacionRegistro, "precioPt">) => (p: PiezaCubicada): number =>
  p.precio ?? c.precioPt ?? 0;

/**
 * Arma el registro completo a partir de lo que hay en pantalla. Es la única
 * vía de creación: así los totales guardados SIEMPRE salen de las piezas.
 */
export function construirRegistro(input: {
  id?: string;
  nombre: string;
  fecha?: string;
  cliente?: string;
  especie?: string;
  notas?: string;
  precioPt?: number;
  piezas: Record<string, unknown>[];
  ctpEntryId?: string;
  ctpEntryIds?: string[];
  gtfNumber?: string;
  trasera?: { ids: string[]; anchoM: number };
  ficha?: FichaCubicacion | Record<string, unknown>;
  createdAt?: string;
  createdBy?: string;
}): CubicacionRegistro {
  const piezas = input.piezas.map(normalizarPieza);
  const totales = totalesDe(piezas);
  const precioPt = Number.isFinite(Number(input.precioPt)) && Number(input.precioPt) > 0 ? r2(Number(input.precioPt)) : 0;
  const precioDe = precioDeCubicacion({ precioPt });
  const ahora = new Date().toISOString();
  return {
    id: input.id ?? `cub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    nombre: (input.nombre || "Cubicación sin nombre").trim().slice(0, 120),
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(input.fecha ?? "") ? input.fecha! : hoyISO(),
    cliente: input.cliente?.trim().slice(0, 120) || undefined,
    especie: input.especie?.trim().slice(0, 60) || undefined,
    notas: input.notas?.trim().slice(0, 600) || undefined,
    precioPt,
    valor: r2(piezas.reduce((a, p) => a + p.pieTablar * precioDe(p), 0)),
    ficha: normalizarFicha(input.ficha),
    totales,
    piezas,
    /* El primero de la lista manda como `ctpEntryId`: lo que ya leía un solo id
       —el ANEXO N° 04, la ficha del despacho— sigue encontrando su corrida. */
    ctpEntryId: (input.ctpEntryId ?? input.ctpEntryIds?.[0])?.trim().slice(0, 60) || undefined,
    ctpEntryIds: input.ctpEntryIds?.length
      ? [...new Set(input.ctpEntryIds.map((x) => x.trim().slice(0, 60)).filter(Boolean))].slice(0, 100)
      : undefined,
    gtfNumber: input.gtfNumber?.trim().slice(0, 60) || undefined,
    trasera: normalizarTrasera(input.trasera, piezas),
    createdAt: input.createdAt ?? ahora,
    updatedAt: ahora,
    createdBy: input.createdBy,
  };
}

/**
 * TODAS las corridas que ampara una cubicación: `ctpEntryIds` y el `ctpEntryId`
 * viejo, sin repetir. Leer sólo `ctpEntryId` (el primero) perdía las demás de
 * un camión cubicado entero (ADR-369) — el `?despachoId=` del Anexo 04 no
 * sugería la cubicación si el despacho salía de la segunda corrida (ADR-445).
 */
export function corridasDeCubicacion(c: Pick<CubicacionRegistro, "ctpEntryId" | "ctpEntryIds">): string[] {
  const ids = [...(c.ctpEntryIds ?? []), ...(c.ctpEntryId ? [c.ctpEntryId] : [])]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
  return [...new Set(ids)];
}

/** Nombre sugerido cuando el usuario no escribe uno: fecha + especie + piezas. */
export function nombreSugerido(especie: string | undefined, totales: CubicacionTotales): string {
  const fecha = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
  return `${especie ? `${especie} · ` : ""}${totales.piezas} pzas · ${fecha}`;
}

/** Los textos de la ficha que se buscan («Chinchihuani», la placa, el permiso). */
export const textosDeFicha = (f: FichaCubicacion | undefined): string[] =>
  f ? [f.comunidad, f.tituloHabilitante, f.placa, f.chofer, f.destino, f.lugar].filter((x): x is string => Boolean(x)) : [];

/** Filtra el historial por nombre, cliente, especie, fecha o lo de su ficha. */
export function filtrarCubicaciones(lista: CubicacionRegistro[], termino: string): CubicacionRegistro[] {
  const t = termino.trim().toLowerCase();
  if (!t) return lista;
  return lista.filter((c) =>
    [c.nombre, c.cliente, c.especie, c.fecha, c.notas, ...textosDeFicha(c.ficha)].some((campo) => (campo ?? "").toLowerCase().includes(t)),
  );
}
