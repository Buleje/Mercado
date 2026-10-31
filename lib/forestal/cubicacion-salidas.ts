/**
 * cubicacion-salidas — lo que ya se llevó de una cubicación guardada (Brandon
 * 28-10: «poner de lo total guardado si ya se llevó una parte o se llevó
 * completo… y en guardados diga cuánto se despachó y cuánto sobra»).
 *
 * Una SALIDA es un viaje: fecha, a quién, en qué vehículo, con qué guía, y
 * cuánto se llevó de cada grupo especie × tipo de la cubicación (piezas y pie
 * tablar; el m³ SALE del PT ÷ 424, nunca al revés). No mueve madera del Libro
 * ni plata: es la libreta del dueño para saber qué queda en el patio.
 *
 * Los grupos salen de las piezas guardadas (`tipoDePieza`: el forzado a mano
 * gana). Si después se re-cubica y un grupo desaparece, sus líneas no se
 * borran: quedan en `fuera` para que se vean y se corrijan.
 *
 * PURO y client-safe (lo usan el modal, Guardadas y el servidor).
 */
import { m3DesdePt, type PiezaCubicada } from "./cubicacion";
import { ORDEN_TIPO, tipoDePieza, type TipoComercial } from "./cubicacion-tipo";

const r2 = (n: number) => Math.round(n * 100) / 100;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Topes: un lote no sale en más de 100 viajes, ni un viaje lleva más de 200 grupos. */
export const SALIDAS_MAX = 100;
export const LINEAS_SALIDA_MAX = 200;
/** Tope de cada texto de la salida (placa, chofer, destino…). */
export const SALIDA_TEXTO_MAX = 120;
export const SALIDA_NOTAS_MAX = 600;
/**
 * Tolerancia del «salió todo» en la unidad del negocio: 1 PT (el reparto
 * proporcional redondea a centésimas por línea; 1 PT es menos de una tabla).
 */
export const TOLERANCIA_PT = 1;

/** Cuánto se llevó de UN grupo especie × tipo. */
export interface LineaSalida {
  /** Especie tal como está en las piezas ("" = sin especie). */
  especie: string;
  tipo: TipoComercial;
  /** Piezas enteras (≥ 0). */
  piezas: number;
  /** Pie tablar (≥ 0, 2 decimales). El m³ es `m3DesdePt(pt)`. */
  pt: number;
}

/** Un viaje de la madera de la cubicación. */
export interface SalidaCubicacion {
  id: string;
  /** Día del viaje (AAAA-MM-DD). */
  fecha: string;
  /** Al registrarla se marcó «se llevó todo lo que quedaba». */
  completo: boolean;
  /** A quién se le entregó (vacío = el comprador de la ficha). */
  cliente?: string;
  clienteParteId?: string;
  placa?: string;
  /** El vehículo en palabras: «Camión Volvo rojo», «Furgón», «Bote». */
  vehiculo?: string;
  chofer?: string;
  /** N° de la GTF con que salió este viaje. */
  gtf?: string;
  destino?: string;
  notas?: string;
  lineas: LineaSalida[];
  /** ISO. Lo pone el servidor al anotarla; el cliente nunca. */
  registradoAt: string;
  /** Usuario que la anotó (servidor). */
  por?: string;
}

/** Lo que el cliente manda: sin `registradoAt`/`por` (los pone el servidor). `id` vacío = nueva. */
export type SalidaEntrada = Omit<SalidaCubicacion, "id" | "registradoAt" | "por"> & { id?: string };

export const CAMPOS_TEXTO_SALIDA = [
  "cliente", "clienteParteId", "placa", "vehiculo", "chofer", "gtf", "destino",
] as const satisfies readonly (keyof SalidaCubicacion)[];

/** La clave de un grupo: especie sin mayúsculas ni espacios de más + tipo. */
export function claveGrupo(especie: string | null | undefined, tipo: TipoComercial): string {
  return `${(especie ?? "").trim().toLowerCase()}|${tipo}`;
}

/** Un grupo especie × tipo de la cubicación. */
export interface GrupoCubicado {
  clave: string;
  /** La especie como se escribió en su primera pieza ("" = sin especie). */
  especie: string;
  tipo: TipoComercial;
  piezas: number;
  pt: number;
  /** Σ PT × precio de cada pieza (sin precio propio, el general). */
  valor: number;
}

/**
 * Los grupos especie × tipo de las piezas, ordenados por especie y después por
 * el orden comercial de siempre (`ORDEN_TIPO`). `precioGeneral` = el precio de
 * las piezas sin `precio` propio (el `precioPt` de la guardada).
 */
export function gruposDeLaCubicacion(
  piezas: readonly PiezaCubicada[],
  precioGeneral = 0,
): GrupoCubicado[] {
  const general = Number.isFinite(precioGeneral) ? precioGeneral : 0;
  const mapa = new Map<string, GrupoCubicado>();
  /* La especie se escribe como en su PRIMERA pieza, en todos sus tipos («Tornillo» y «tornillo » son una). */
  const comoSeEscribe = new Map<string, string>();
  for (const p of piezas) {
    const tipo = tipoDePieza(p);
    const clave = claveGrupo(p.especie, tipo);
    const k = (p.especie ?? "").trim().toLowerCase();
    if (!comoSeEscribe.has(k)) comoSeEscribe.set(k, (p.especie ?? "").trim());
    const pt = Number(p.pieTablar) || 0;
    const precio = p.precio === undefined || p.precio === null || !Number.isFinite(p.precio) ? general : p.precio;
    const g = mapa.get(clave) ?? { clave, especie: comoSeEscribe.get(k) ?? "", tipo, piezas: 0, pt: 0, valor: 0 };
    g.piezas += Number(p.cantidad) || 0;
    g.pt += pt;
    g.valor += pt * precio;
    mapa.set(clave, g);
  }
  return [...mapa.values()]
    .map((g) => ({ ...g, pt: r2(g.pt), valor: r2(g.valor) }))
    .sort((a, b) =>
      a.especie.localeCompare(b.especie, "es", { sensitivity: "base" }) ||
      ORDEN_TIPO.indexOf(a.tipo) - ORDEN_TIPO.indexOf(b.tipo));
}

/** El PT que corresponde a `piezas` de un grupo, a su promedio por pieza (lo que se sugiere al escribir piezas). */
export function ptProporcional(grupo: Pick<GrupoCubicado, "piezas" | "pt">, piezas: number): number {
  if (!(grupo.piezas > 0) || !(piezas > 0)) return 0;
  return r2((grupo.pt / grupo.piezas) * piezas);
}

export interface Cantidad {
  piezas: number;
  pt: number;
  m3: number;
}

const cantidad = (piezas: number, pt: number): Cantidad => ({ piezas, pt: r2(pt), m3: m3DesdePt(r2(pt)) });

export interface SaldoGrupo extends GrupoCubicado {
  salio: Cantidad;
  /** Lo que queda (nunca negativo: lo de más se marca con `excedido`). */
  queda: Cantidad;
  /** Se anotó más de lo que se cubicó (piezas o más de 1 PT). */
  excedido: boolean;
  /** Valor de lo que salió, a precio promedio del grupo. */
  valorSalio: number;
}

export type EstadoSalidas = "sin-salidas" | "parcial" | "completo" | "excedido";

export interface SaldoCubicacion {
  grupos: SaldoGrupo[];
  total: Cantidad;
  salio: Cantidad;
  queda: Cantidad;
  /** Valor de la cubicación / de lo que salió / de lo que queda (precio promedio de cada grupo). */
  valor: { total: number; salio: number; queda: number };
  estado: EstadoSalidas;
  /** % del PT que ya salió (0-100, entero). */
  porcentaje: number;
  /** Líneas anotadas cuyo grupo ya no está en la cubicación (se re-cubicó). */
  fuera: LineaSalida[];
  /** Cuántos viajes. */
  viajes: number;
}

/** Cuánto salió y cuánto queda de cada grupo, y del total. */
export function saldoDeLaCubicacion(
  piezas: readonly PiezaCubicada[],
  salidas: readonly SalidaCubicacion[] | undefined,
  precioGeneral = 0,
): SaldoCubicacion {
  const grupos = gruposDeLaCubicacion(piezas, precioGeneral);
  const porClave = new Map(grupos.map((g) => [g.clave, { piezas: 0, pt: 0 }]));
  const fuera: LineaSalida[] = [];
  for (const s of salidas ?? []) {
    for (const l of s.lineas) {
      const acum = porClave.get(claveGrupo(l.especie, l.tipo));
      if (!acum) { fuera.push(l); continue; }
      acum.piezas += l.piezas;
      acum.pt += l.pt;
    }
  }
  const conSaldo: SaldoGrupo[] = grupos.map((g) => {
    const s = porClave.get(g.clave)!;
    const excedido = s.piezas > g.piezas || s.pt > g.pt + TOLERANCIA_PT;
    const valorSalio = g.pt > 0 ? r2(Math.min(s.pt, g.pt) * (g.valor / g.pt)) : 0;
    return {
      ...g,
      salio: cantidad(s.piezas, s.pt),
      queda: cantidad(Math.max(0, g.piezas - s.piezas), Math.max(0, g.pt - s.pt)),
      excedido,
      valorSalio,
    };
  });
  const suma = (f: (g: SaldoGrupo) => number) => conSaldo.reduce((a, g) => a + f(g), 0);
  const total = cantidad(suma((g) => g.piezas), suma((g) => g.pt));
  const salio = cantidad(suma((g) => g.salio.piezas), suma((g) => g.salio.pt));
  const queda = cantidad(suma((g) => g.queda.piezas), suma((g) => g.queda.pt));
  const valorTotal = r2(suma((g) => g.valor));
  const valorSalio = r2(suma((g) => g.valorSalio));
  const viajes = salidas?.length ?? 0;
  const excedido = conSaldo.some((g) => g.excedido) || fuera.length > 0;
  const estado: EstadoSalidas =
    viajes === 0 ? "sin-salidas"
      : excedido ? "excedido"
        : queda.piezas === 0 && queda.pt < TOLERANCIA_PT ? "completo"
          : "parcial";
  return {
    grupos: conSaldo,
    total,
    salio,
    queda,
    valor: { total: valorTotal, salio: valorSalio, queda: r2(valorTotal - valorSalio) },
    estado,
    porcentaje: total.pt > 0 ? Math.min(100, Math.round((salio.pt / total.pt) * 100)) : 0,
    fuera,
    viajes,
  };
}

/** Las líneas de «se llevó todo lo que quedaba»: cada grupo con su saldo. */
export function lineasDeLoQueQueda(saldo: Pick<SaldoCubicacion, "grupos">): LineaSalida[] {
  return saldo.grupos
    .filter((g) => g.queda.piezas > 0 || g.queda.pt >= TOLERANCIA_PT)
    .map((g) => ({ especie: g.especie, tipo: g.tipo, piezas: g.queda.piezas, pt: g.queda.pt }));
}

export const ETIQUETA_ESTADO_SALIDAS: Record<EstadoSalidas, string> = {
  "sin-salidas": "Sin salidas",
  parcial: "Salió una parte",
  completo: "Salió todo",
  excedido: "Salió más de lo cubicado",
};

/* ---------- Normalizar (lo que llega del cliente o del KV) ---------- */

const texto = (v: unknown, max: number): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

const esTipo = (v: unknown): v is TipoComercial =>
  typeof v === "string" && (ORDEN_TIPO as readonly string[]).includes(v);

/** Una línea en forma canónica; sin cantidad (0 piezas y 0 PT) → `null`. */
export function normalizarLineaSalida(raw: unknown): LineaSalida | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  if (!esTipo(f.tipo)) return null;
  const piezas = Math.max(0, Math.round(Number(f.piezas) || 0));
  const pt = Math.max(0, r2(Number(f.pt) || 0));
  if (piezas === 0 && pt === 0) return null;
  return { especie: texto(f.especie, 60) ?? "", tipo: f.tipo, piezas, pt };
}

/**
 * Una salida en forma canónica. Sin líneas con cantidad → `null` (un viaje
 * vacío no se anota). Las líneas del mismo grupo se suman en una.
 */
export function normalizarSalida(raw: unknown, sello?: { id: string; registradoAt: string; por?: string }): SalidaCubicacion | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const f = raw as Record<string, unknown>;
  const porClave = new Map<string, LineaSalida>();
  for (const l of Array.isArray(f.lineas) ? f.lineas.slice(0, LINEAS_SALIDA_MAX) : []) {
    const linea = normalizarLineaSalida(l);
    if (!linea) continue;
    const k = claveGrupo(linea.especie, linea.tipo);
    const previa = porClave.get(k);
    porClave.set(k, previa ? { ...previa, piezas: previa.piezas + linea.piezas, pt: r2(previa.pt + linea.pt) } : linea);
  }
  const lineas = [...porClave.values()];
  if (lineas.length === 0) return null;
  const id = sello?.id ?? texto(f.id, 60);
  const registradoAt = sello?.registradoAt ?? texto(f.registradoAt, 40);
  if (!id || !registradoAt) return null;
  const salida: SalidaCubicacion = {
    id,
    fecha: typeof f.fecha === "string" && FECHA.test(f.fecha) ? f.fecha : registradoAt.slice(0, 10),
    completo: f.completo === true,
    lineas,
    registradoAt,
  };
  for (const k of CAMPOS_TEXTO_SALIDA) {
    const v = texto(f[k], k.endsWith("ParteId") ? 60 : SALIDA_TEXTO_MAX);
    if (v) salida[k] = v;
  }
  const notas = texto(f.notas, SALIDA_NOTAS_MAX);
  if (notas) salida.notas = notas;
  const por = sello?.por ?? texto(f.por, 120);
  if (por) salida.por = por;
  return salida;
}

/** Las salidas guardadas (del KV): las que no se leen se descartan; por fecha y orden de anotación. */
export function normalizarSalidas(raw: unknown): SalidaCubicacion[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const lista = raw.slice(0, SALIDAS_MAX).map((s) => normalizarSalida(s)).filter((s): s is SalidaCubicacion => s !== null);
  if (lista.length === 0) return undefined;
  return lista.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.registradoAt.localeCompare(b.registradoAt));
}

/** Un id nuevo de salida (el servidor lo pone a las nuevas). */
export const idSalidaNueva = (): string => `sal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
