/**
 * Origen y salida de cada día de producción (ADR-445, 2026-09-27).
 *
 * Brandon: en la tira de «Producir sin lote» saber qué día viene de cubicar
 * pieza por pieza y cuál se declaró con los m³ por tipo, poder completar con
 * su cubicación los que no tienen piezas, y ver qué días salieron, en qué guía
 * y cuáles no.
 *
 * Este archivo es el CONTRATO que comparten el servidor (lo calcula) y la
 * pantalla (lo pinta). La lógica pura que lo arma vive aquí también.
 *
 * Regla de clasificación (medida en Blas y `main`, ver ADR-445):
 * - Paquete CUBICADO = espesor, ancho y largo > 0, cantidad > 0, y esa
 *   escuadría explica su volumen: |m³ de la escuadría − volumenM3| ≤ máx(0,01 m³; 2 %).
 *   «Tiene escuadría» no basta: en `main` hay medidas de muestra que no explican su m³.
 * - Corrida: `por_declarar` (sin cantidad y sin paquetes) · `por_tipo` (ningún
 *   paquete cubicado) · `cubicada` (lo cubicado llega al declarado − 0,01 m³ y
 *   hay al menos un paquete cubicado) · si no llega, `parcial`.
 * - Día (sin contar las `por_declarar`): todas cubicadas → `cubicado`; todas por
 *   tipo → `por_tipo`; lo demás → `mixto`. Sólo `por_declarar` → `por_declarar`.
 * - Salida: `sin_salida` · `parcial` (algo salió, algo queda) · `despachado`
 *   (todo salió con guía) · `sin_guia` (no queda nada pero salió marcado
 *   «usado», sin guía en el libro).
 * Cuadre: despachado + reprocesado + sin guía + en patio = declarado.
 */

export type OrigenDeCorrida = "cubicada" | "por_tipo" | "parcial" | "por_declarar";
export type OrigenDelDia = "cubicado" | "por_tipo" | "mixto" | "por_declarar";
export type EstadoDeSalida = "sin_salida" | "parcial" | "despachado" | "sin_guia";

/** Una cubicación guardada (cubicador) ligada a corridas de este día. */
export interface CubicacionVinculada {
  id: string;
  nombre: string;
  m3: number;
  pt: number;
  piezas: number;
  /** Ids de las corridas (`ForestCtpEntry`) a las que se ligó. */
  corridas: string[];
  /** `true` si todas sus corridas son de este día. */
  soloEsteDia: boolean;
}

/** Una guía (despacho) que se llevó madera de este día. */
export interface GuiaDelDia {
  despachoEntryId: string;
  lineNo: number;
  /** `null` = borrador (todavía sin N° de GTF). */
  gtfNumber: string | null;
  /** `YYYY-MM-DD` del despacho. */
  fecha: string;
  m3: number;
  /** Códigos de los paquetes de este día que van en esa guía. */
  paquetes: string[];
}

export interface SalidaDelDia {
  estado: EstadoDeSalida;
  m3Despachado: number;
  m3Reprocesado: number;
  m3SinGuia: number;
  m3EnPatio: number;
  /** Paquetes de este día apartados (reservados) y sin salir. */
  apartados: number;
  guias: GuiaDelDia[];
}

export interface OrigenYSalida {
  origen: OrigenDelDia;
  m3Declarado: number;
  /** m³ que explican los paquetes cubicados. */
  m3Cubicado: number;
  /** m³ de las cubicaciones vinculadas (complementan un día por tipo). */
  m3ConCubicacion: number;
  /** Corridas del día todavía sin declarar (sin cantidad y sin paquetes). */
  porDeclarar: number;
  cubicaciones: CubicacionVinculada[];
  salida: SalidaDelDia;
}

/** Lo que se agrega a cada corrida en el detalle del día. */
export interface OrigenYSalidaDeCorrida {
  origen: OrigenDeCorrida;
  m3Declarado: number;
  m3Cubicado: number;
  salida: SalidaDelDia;
  cubicaciones: CubicacionVinculada[];
}

// ── La cuenta (pura) ─────────────────────────────────────────────────────────

/**
 * Tolerancias del NEGOCIO, no del float (regla `verificacion-de-verdad` §4).
 * Un paquete: 10 litros o el 2 % de su volumen, lo que sea mayor — el libro
 * guarda la escuadría en cm y m con dos decimales (8 pies vuelven como 2,44 m)
 * y el m³ del cubicador sale del pie tablar (÷ 424), no de la geometría.
 * Medido el 27-09: en Blas los 669 paquetes con escuadría la explican (desvío
 * máximo 0,97 %); en `main`, 3 de 12 no (PQ-001, PQ-0291, PQ-DIM-9427).
 */
export const TOLERANCIA_PAQUETE_M3 = 0.01;
export const TOLERANCIA_PAQUETE_PCT = 0.02;
/** Una corrida o un día: 10 litros, la cinta del aserradero. */
export const TOLERANCIA_CORRIDA_M3 = 0.01;
/** Medio diezmilésimo: el libro guarda cuatro decimales, lo de abajo es float. */
const EPS = 0.00005;

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const positivo = (v: number | null | undefined): number => (v != null && Number.isFinite(v) && v > 0 ? v : 0);

/** Lo que hace falta de un paquete del libro para saber si se cubicó. */
export interface PaqueteParaOrigen {
  id?: string;
  codigo?: string;
  /** Piezas del paquete. */
  cantidad: number | null;
  volumenM3: number;
  espesorCm: number | null;
  anchoCm: number | null;
  largoM: number | null;
}

/**
 * El m³ que explica la escuadría del paquete (piezas × espesor × ancho × largo),
 * o `null` si le falta una de las cuatro: sin las cuatro no hay medida.
 */
export function m3DeLaEscuadria(p: PaqueteParaOrigen): number | null {
  const n = positivo(p.cantidad);
  const e = positivo(p.espesorCm);
  const a = positivo(p.anchoCm);
  const l = positivo(p.largoM);
  if (!(n > 0 && e > 0 && a > 0 && l > 0)) return null;
  /* cm × cm × m = 10⁻⁴ m³. */
  return (n * e * a * l) / 10_000;
}

/**
 * ¿El paquete salió de cubicar pieza por pieza? Sólo si su escuadría EXPLICA
 * su volumen. «Tiene escuadría» no basta: en `main` PQ-DIM-9427 trae 12 piezas
 * de 2,5 × 20 × 2,8 (0,168 m³) y declara 0,0336 — una medida de muestra puesta
 * sobre un volumen por tipo.
 */
export function origenDePaquete(p: PaqueteParaOrigen): "cubicado" | "por_tipo" {
  const escuadria = m3DeLaEscuadria(p);
  if (escuadria == null) return "por_tipo";
  const v = positivo(p.volumenM3);
  const tolerancia = Math.max(TOLERANCIA_PAQUETE_M3, TOLERANCIA_PAQUETE_PCT * v);
  return Math.abs(escuadria - v) <= tolerancia + EPS ? "cubicado" : "por_tipo";
}

/** Lo que hace falta de una corrida para decir de dónde salió su volumen. */
export interface CorridaParaOrigen {
  /** `quantity` del asiento, en su unidad (null = sin declarar). */
  cantidad: number | null;
  /** El declarado en m³ (0 si el asiento está en otra unidad), el del casillero. */
  m3Declarado: number;
  paquetes: readonly PaqueteParaOrigen[];
}

export interface OrigenCalculado {
  origen: OrigenDeCorrida;
  m3Declarado: number;
  m3Cubicado: number;
  paquetesCubicados: number;
}

/**
 * El origen de UNA corrida. `cubicada` pide las dos cosas: que lo cubicado
 * llegue al declarado (−10 L) y que haya AL MENOS un paquete cubicado — la
 * corrida de 1 litro del 29/08 de Blas llega «sin nada» a su declarado y no por
 * eso se cubicó.
 */
export function origenDeCorrida(c: CorridaParaOrigen): OrigenCalculado {
  const m3Declarado = r4(positivo(c.m3Declarado));
  const cubicados = c.paquetes.filter((p) => origenDePaquete(p) === "cubicado");
  const m3Cubicado = r4(cubicados.reduce((a, p) => a + positivo(p.volumenM3), 0));
  const base = { m3Declarado, m3Cubicado, paquetesCubicados: cubicados.length };
  if (!(positivo(c.cantidad) > 0) && c.paquetes.length === 0) return { origen: "por_declarar", ...base };
  if (cubicados.length === 0) return { origen: "por_tipo", ...base };
  if (m3Cubicado >= m3Declarado - TOLERANCIA_CORRIDA_M3 - EPS) return { origen: "cubicada", ...base };
  return { origen: "parcial", ...base };
}

/** El origen del día a partir del de sus corridas (las `por_declarar` no votan). */
export function origenDelDia(origenes: readonly OrigenDeCorrida[]): OrigenDelDia {
  const votan = origenes.filter((o) => o !== "por_declarar");
  if (votan.length === 0) return "por_declarar";
  if (votan.every((o) => o === "cubicada")) return "cubicado";
  if (votan.every((o) => o === "por_tipo")) return "por_tipo";
  return "mixto";
}

// ── Salida ───────────────────────────────────────────────────────────────────

/** Una atribución VIGENTE de la corrida a un despacho (`ForestCtpDespachoOrigen`). */
export interface SalidaRegistrada {
  despachoEntryId: string;
  lineNo: number;
  /** `null` = borrador. */
  gtfNumber: string | null;
  /** `YYYY-MM-DD` del despacho. */
  fecha: string;
  /** m³ de ESTA corrida en ese despacho (`origen.quantity`). */
  m3: number;
  /** Código que lleva la línea de despacho (ADR-444). */
  codigoProducto: string | null;
  /**
   * La línea es una salida de trozas sin aserrar (ADR-363): su código es el de
   * una PIEZA y puede coincidir con el de un paquete (Blas: «55»…«72»). No
   * nombra ningún paquete.
   */
  esSalidaDeTrozas: boolean;
}

export interface CorridaParaSalida {
  m3Declarado: number;
  /** Del saldo (`saldosDeCorridas`, la única fuente): despachos vigentes. */
  despachado: number;
  /** Del saldo: reprocesos vigentes. */
  reprocesado: number;
  /** Marcada «ya se usó» (`usadoAt`): lo que queda salió sin guía en el libro. */
  usado: boolean;
  paquetes: readonly Pick<PaqueteParaOrigen, "id" | "codigo">[];
  salidas: readonly SalidaRegistrada[];
  /** Reservas vivas (`liberadoAt` null); `paqueteId` null = la corrida entera. */
  apartados: readonly { paqueteId: string | null }[];
}

/**
 * El estado de la salida a partir de sus cuatro montos. «Queda» se mide con la
 * tolerancia de 10 L; «salió» y «sin guía» con la del libro (4 decimales): la
 * corrida de 1 L del 29/08, marcada usada, salió sin guía — no «despachada».
 * Una corrida reprocesada entera sale del patio por el libro: cuenta como
 * `despachado` (el monto dice cuánto fue reproceso).
 */
export function estadoDeSalida(
  s: Pick<SalidaDelDia, "m3Despachado" | "m3Reprocesado" | "m3SinGuia" | "m3EnPatio">,
): EstadoDeSalida {
  const salio = s.m3Despachado + s.m3Reprocesado + s.m3SinGuia;
  if (salio <= EPS) return "sin_salida";
  if (s.m3EnPatio > TOLERANCIA_CORRIDA_M3 + EPS) return "parcial";
  if (s.m3SinGuia > EPS) return "sin_guia";
  return "despachado";
}

const porFechaYLinea = (a: GuiaDelDia, b: GuiaDelDia) =>
  a.fecha.localeCompare(b.fecha) || a.lineNo - b.lineNo;

/**
 * La salida de UNA corrida.
 *
 * Cuadre: despachado + reprocesado + sin guía + en patio = declarado, mientras
 * el libro cumpla I3/I5 (lo atribuido no pasa de lo producido). Qué paquete va
 * en qué guía se lee de SUS salidas: el código de la línea de despacho sólo
 * nombra un paquete si esa línea cita a esta corrida y no es una salida de
 * trozas — nunca buscando el código suelto en todo el libro.
 */
export function salidaDeCorrida(c: CorridaParaSalida): SalidaDelDia {
  const declarado = r4(positivo(c.m3Declarado));
  const despachado = r4(positivo(c.despachado));
  const reprocesado = r4(positivo(c.reprocesado));
  const resto = r4(Math.max(0, declarado - despachado - reprocesado));
  const m3SinGuia = c.usado ? resto : 0;
  const m3EnPatio = c.usado ? 0 : resto;

  const codigos = new Set(c.paquetes.map((p) => (p.codigo ?? "").trim()).filter(Boolean));
  const guias: GuiaDelDia[] = c.salidas.map((s) => {
    const codigo = (s.codigoProducto ?? "").trim();
    return {
      despachoEntryId: s.despachoEntryId,
      lineNo: s.lineNo,
      gtfNumber: (s.gtfNumber ?? "").trim() || null,
      fecha: s.fecha,
      m3: r4(positivo(s.m3)),
      paquetes: !s.esSalidaDeTrozas && codigo && codigos.has(codigo) ? [codigo] : [],
    };
  });
  guias.sort(porFechaYLinea);

  const salidos = new Set(guias.flatMap((g) => g.paquetes));
  const codigoDe = new Map(c.paquetes.filter((p) => p.id).map((p) => [p.id as string, (p.codigo ?? "").trim()]));
  const apartados =
    m3EnPatio > EPS
      ? c.apartados.filter((a) => a.paqueteId == null || !salidos.has(codigoDe.get(a.paqueteId) ?? "")).length
      : 0;

  const montos = { m3Despachado: despachado, m3Reprocesado: reprocesado, m3SinGuia, m3EnPatio };
  return { estado: estadoDeSalida(montos), ...montos, apartados, guias };
}

/**
 * La salida de un día (o de varias corridas) juntando las de sus corridas. Un
 * despacho que se lleva dos corridas del mismo día es UNA guía con la suma.
 */
export function salidaDelDia(salidas: readonly SalidaDelDia[]): SalidaDelDia {
  const guias = new Map<string, GuiaDelDia>();
  let m3Despachado = 0;
  let m3Reprocesado = 0;
  let m3SinGuia = 0;
  let m3EnPatio = 0;
  let apartados = 0;
  for (const s of salidas) {
    m3Despachado += s.m3Despachado;
    m3Reprocesado += s.m3Reprocesado;
    m3SinGuia += s.m3SinGuia;
    m3EnPatio += s.m3EnPatio;
    apartados += s.apartados;
    for (const g of s.guias) {
      const previa = guias.get(g.despachoEntryId);
      guias.set(
        g.despachoEntryId,
        previa
          ? { ...previa, m3: r4(previa.m3 + g.m3), paquetes: [...new Set([...previa.paquetes, ...g.paquetes])] }
          : { ...g, paquetes: [...g.paquetes] },
      );
    }
  }
  const montos = {
    m3Despachado: r4(m3Despachado),
    m3Reprocesado: r4(m3Reprocesado),
    m3SinGuia: r4(m3SinGuia),
    m3EnPatio: r4(m3EnPatio),
  };
  return { estado: estadoDeSalida(montos), ...montos, apartados, guias: [...guias.values()].sort(porFechaYLinea) };
}

// ── Cubicaciones ligadas ─────────────────────────────────────────────────────

/** Una cubicación guardada, con las corridas que ampara (`corridasDeCubicacion`). */
export interface CubicacionParaVincular {
  id: string;
  nombre: string;
  m3: number;
  pt: number;
  piezas: number;
  corridas: readonly string[];
}

/**
 * Las cubicaciones ligadas a alguna de `buscadas`. `soloEsteDia` = todas sus
 * corridas son del día (`idsDelDia`): una que ampara un camión de tres días no
 * es la cubicación de éste, y su m³ no se le puede cargar entero.
 */
export function cubicacionesVinculadas(
  buscadas: readonly string[],
  idsDelDia: readonly string[],
  cubicaciones: readonly CubicacionParaVincular[],
): CubicacionVinculada[] {
  const buscar = new Set(buscadas);
  const delDia = new Set(idsDelDia);
  return cubicaciones
    .filter((c) => c.corridas.some((id) => buscar.has(id)))
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      m3: r4(positivo(c.m3)),
      pt: Math.round(positivo(c.pt) * 100) / 100,
      piezas: Math.round(positivo(c.piezas)),
      corridas: [...c.corridas],
      soloEsteDia: c.corridas.length > 0 && c.corridas.every((id) => delDia.has(id)),
    }));
}

/** m³ de las cubicaciones que son SÓLO del día (las que abarcan otros no se reparten a ojo). */
const m3DeLasDelDia = (vs: readonly CubicacionVinculada[]) =>
  r4(vs.filter((v) => v.soloEsteDia).reduce((a, v) => a + v.m3, 0));

// ── Día y corrida, completos ─────────────────────────────────────────────────

/** Todo lo que el servidor junta de una corrida para armar origen y salida. */
export interface CorridaParaOrigenYSalida extends CorridaParaOrigen, CorridaParaSalida {
  id: string;
  m3Declarado: number;
  paquetes: readonly PaqueteParaOrigen[];
}

export function origenYSalidaDeCorrida(
  c: CorridaParaOrigenYSalida,
  contexto: { idsDelDia: readonly string[]; cubicaciones: readonly CubicacionParaVincular[] },
): OrigenYSalidaDeCorrida {
  const o = origenDeCorrida(c);
  return {
    origen: o.origen,
    m3Declarado: o.m3Declarado,
    m3Cubicado: o.m3Cubicado,
    salida: salidaDeCorrida(c),
    cubicaciones: cubicacionesVinculadas([c.id], contexto.idsDelDia, contexto.cubicaciones),
  };
}

export function origenYSalidaDelDia(
  corridas: readonly CorridaParaOrigenYSalida[],
  cubicaciones: readonly CubicacionParaVincular[],
): OrigenYSalida {
  const ids = corridas.map((c) => c.id);
  const origenes = corridas.map(origenDeCorrida);
  const vinculadas = cubicacionesVinculadas(ids, ids, cubicaciones);
  return {
    origen: origenDelDia(origenes.map((o) => o.origen)),
    m3Declarado: r4(origenes.reduce((a, o) => a + o.m3Declarado, 0)),
    m3Cubicado: r4(origenes.reduce((a, o) => a + o.m3Cubicado, 0)),
    m3ConCubicacion: m3DeLasDelDia(vinculadas),
    porDeclarar: origenes.filter((o) => o.origen === "por_declarar").length,
    cubicaciones: vinculadas,
    salida: salidaDelDia(corridas.map(salidaDeCorrida)),
  };
}
