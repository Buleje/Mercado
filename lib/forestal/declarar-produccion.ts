/**
 * Declarar producción sin lote en su propio modal (ADR-429, Brandon 2026-09-22).
 *
 * «Producir sin lote» cubica; declarar pasa a un modal aparte con tres
 * secciones —resumen especie × tipo, servicio y detalle— y un solo pedido al
 * servidor (`POST /api/admin/forestal/ctp/produccion-sin-lote`). Este módulo
 * es el CONTRATO que comparten la pantalla (vista previa) y el servidor (la
 * cuenta que vale): tipos, el esquema Zod del pedido y las cuentas puras.
 *
 * Decisiones de Brandon (22-09):
 *  - **Un asiento por especie.** El LO-CTP declara una especie por asiento;
 *    antes, elegir una se la ponía a TODAS las piezas y la real se perdía.
 *  - **Madera propia**: un precio por especie, en S/ por pie tablar. Se guarda
 *    en cada paquete para valorizar lo producido y proponerlo al despachar.
 *  - **Servicio de aserrío**: el precio es un trato de ESA corrida (no toca la
 *    tarifa). Sin precio a mano, cobra la tarifa si hay una cargada.
 *
 * PURO y client-safe: nada de Prisma ni de servidor acá.
 */
import { z } from "zod";
import { claveEspecie } from "./loth-constants";
import { ORDEN_TIPO, tipoDePieza } from "./cubicacion-tipo";
import { toFeet, toInches, unificarPorMedida, type PiezaCubicada } from "./cubicacion";
import { productoDelTipoComercial } from "./loctp-catalogos";
import { sugerirCodigoPaquete } from "./produccion-paquetes";
import type { ResultadoCobro } from "./tarifa-aserrio";

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Un paquete del Libro armado desde una medida cubicada (`paquetesDeLoCubicado`). */
export interface PaqueteDeclarable {
  codigo: string;
  /** Producto del catálogo LO-CTP; `null` = genérico «MADERA ASERRADA». */
  productType: string | null;
  /** Tipo comercial de la medida (Comercial, Tabla…): agrupa el resumen. */
  tipo: string;
  presentacion: string;
  cantidad: number;
  volumenM3: number;
  espesorCm: number;
  anchoCm: number;
  largoM: number;
  /** «2×8×10» en pulgadas y pies, como se dictó. */
  medida: string;
  especie: string;
  pieTablar: number;
}

const PULG_A_CM = 2.54;
const PIE_A_M = 0.3048;

/**
 * De las piezas cubicadas a los paquetes del Libro: una línea por MEDIDA
 * (especie + tipo + dueño + escuadría, `unificarPorMedida`), con las
 * escuadrías pasadas a cm y m, que es como las declara el LO-CTP.
 *
 * Vivía dentro de `CtpProducirSinLoteModal`: sus tests tenían que importar el
 * modal entero —con el cubicador adentro— para probar una cuenta pura, y con
 * la suite completa esa importación pasaba los 15 s y el test se cortaba
 * (medido el 22-09 en el hook de commit, dos veces).
 */
export function paquetesDeLoCubicado(
  piezas: readonly PiezaCubicada[],
  /**
   * Los códigos de paquete que YA existen en la planta. El código es único en
   * TODO el tenant: con la serie de la planta sale libre de entrada (la
   * numeración `SL-1`, `SL-2`… chocaba con la segunda producción sin lote).
   */
  opts: { codigosEnPlanta?: readonly string[]; hoy?: Date } = {},
): PaqueteDeclarable[] {
  const hoy = opts.hoy ?? new Date();
  const enPlanta = opts.codigosEnPlanta ?? [];
  /* Los ya propuestos en ESTA tanda: dos medidas no pueden pedir el mismo. */
  const propuestos: string[] = [];
  return unificarPorMedida([...piezas])
    .filter((p) => p.cantidad > 0 && (p.m3 ?? 0) > 0)
    .map((p) => {
      const tipo = tipoDePieza(p);
      const codigo = sugerirCodigoPaquete(enPlanta, { hoy, ocupados: propuestos });
      propuestos.push(codigo);
      return {
        codigo,
        productType: productoDelTipoComercial(tipo),
        tipo,
        presentacion: "PIEZAS",
        cantidad: p.cantidad,
        volumenM3: r4(p.m3 ?? 0),
        /* Por la UNIDAD de cada medida: una pieza de 5 cm se guardaba como
           12,7 cm porque se la trataba como pulgadas (lo cazó el backend de
           ADR-429 con su chequeo de PT; el servidor la habría rechazado). */
        espesorCm: Math.round(toInches(p.espesor, p.uEspesor) * PULG_A_CM * 100) / 100,
        anchoCm: Math.round(toInches(p.ancho, p.uAncho) * PULG_A_CM * 100) / 100,
        largoM: Math.round(toFeet(p.largo, p.uLargo) * PIE_A_M * 100) / 100,
        medida: `${p.espesor}×${p.ancho}×${p.largo}`,
        especie: (p.especie ?? "").trim(),
        pieTablar: p.pieTablar ?? 0,
      };
    });
}

export type TipoServicio = "propia" | "tercero";

export const ETIQUETA_SERVICIO: Record<TipoServicio, string> = {
  propia: "Madera propia (para vender)",
  tercero: "Servicio de aserrío a un tercero",
};

// ── Una corrida por especie ─────────────────────────────────────────────────

export interface CorridaDeEspecie {
  /** El nombre como se cubicó la primera vez; «» = sin especie (no se puede declarar). */
  especie: string;
  paquetes: PaqueteDeclarable[];
  piezas: number;
  pt: number;
  m3: number;
}

/**
 * Parte lo cubicado en una corrida por especie, en el orden en que apareció
 * cada una. «TORNILLO» y «Tornillo» son la misma (`claveEspecie`). Lo que no
 * tiene especie queda en su propio grupo con `especie: ""`: la pantalla no
 * deja registrar hasta que se la pongan.
 */
export function corridasPorEspecie(paquetes: readonly PaqueteDeclarable[]): CorridaDeEspecie[] {
  const grupos = new Map<string, CorridaDeEspecie>();
  for (const p of paquetes) {
    /* «-» o «—» no es una especie: sin una letra, va al grupo «sin especie»
       (mismo criterio `\p{L}` que el servidor; antes se rechazaba tarde, 422). */
    const k = /\p{L}/u.test(p.especie) ? claveEspecie(p.especie) : "";
    let g = grupos.get(k);
    if (!g) {
      g = { especie: k ? p.especie.trim() : "", paquetes: [], piezas: 0, pt: 0, m3: 0 };
      grupos.set(k, g);
    }
    g.paquetes.push(p);
    g.piezas += p.cantidad;
    g.pt += p.pieTablar;
    g.m3 += p.volumenM3;
  }
  return [...grupos.values()].map((g) => ({ ...g, pt: r2(g.pt), m3: r4(g.m3) }));
}

// ── Resumen especie × tipo ──────────────────────────────────────────────────

export interface FilaResumen {
  especie: string;
  tipo: string;
  piezas: number;
  pt: number;
  m3: number;
}

export interface SubtotalEspecie {
  especie: string;
  piezas: number;
  pt: number;
  m3: number;
  filas: FilaResumen[];
}

export interface ResumenEspecieTipo {
  especies: SubtotalEspecie[];
  total: { piezas: number; pt: number; m3: number };
}

const rangoTipo = (tipo: string): number => {
  const i = (ORDEN_TIPO as readonly string[]).indexOf(tipo);
  return i < 0 ? ORDEN_TIPO.length : i;
};

/**
 * La tabla de resumen: por especie (en el orden en que se cubicó) y, adentro,
 * por tipo comercial en el orden de siempre (`ORDEN_TIPO`). Piezas · m³ · PT.
 */
export function resumenEspecieTipo(paquetes: readonly PaqueteDeclarable[]): ResumenEspecieTipo {
  const especies = corridasPorEspecie(paquetes).map((c): SubtotalEspecie => {
    const porTipo = new Map<string, FilaResumen>();
    for (const p of c.paquetes) {
      const tipo = p.tipo || "Otro";
      const f = porTipo.get(tipo) ?? { especie: c.especie, tipo, piezas: 0, pt: 0, m3: 0 };
      f.piezas += p.cantidad;
      f.pt += p.pieTablar;
      f.m3 += p.volumenM3;
      porTipo.set(tipo, f);
    }
    const filas = [...porTipo.values()]
      .map((f) => ({ ...f, pt: r2(f.pt), m3: r4(f.m3) }))
      .sort((a, b) => rangoTipo(a.tipo) - rangoTipo(b.tipo));
    return { especie: c.especie, piezas: c.piezas, pt: c.pt, m3: c.m3, filas };
  });
  const total = especies.reduce(
    (a, e) => ({ piezas: a.piezas + e.piezas, pt: a.pt + e.pt, m3: a.m3 + e.m3 }),
    { piezas: 0, pt: 0, m3: 0 },
  );
  return { especies, total: { piezas: total.piezas, pt: r2(total.pt), m3: r4(total.m3) } };
}

// ── Precio por especie ──────────────────────────────────────────────────────

/** Precio en S/ por pie tablar, por clave de especie. `null` = sin precio (nunca 0). */
export type PreciosPorEspecie = Record<string, number | null>;

/** Normaliza lo tipeado: vacío, cero o negativo = sin precio. */
export function precioValido(v: number | string | null | undefined): number | null {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  return n != null && Number.isFinite(n) && n > 0 ? r4(n) : null;
}

export function precioDe(precios: PreciosPorEspecie, especie: string): number | null {
  return precioValido(precios[claveEspecie(especie)]);
}

/** PT × precio, en soles. Sin precio → `null`, no 0: «no sé» no es «vale cero». */
export function importe(pt: number, precioPt: number | null): number | null {
  return precioPt != null && precioPt > 0 ? r2(pt * precioPt) : null;
}

export interface Valorizacion {
  /** Suma de lo que tiene precio; `null` si ninguna especie tiene. */
  total: number | null;
  /** Las especies que quedaron sin precio: se dicen, no se esconden. */
  sinPrecio: string[];
}

export function valorizar(especies: readonly SubtotalEspecie[], precios: PreciosPorEspecie): Valorizacion {
  let total: number | null = null;
  const sinPrecio: string[] = [];
  for (const e of especies) {
    const imp = importe(e.pt, precioDe(precios, e.especie));
    if (imp == null) sinPrecio.push(e.especie || "Sin especie");
    else total = r2((total ?? 0) + imp);
  }
  return { total, sinPrecio };
}

// ── Detalle ─────────────────────────────────────────────────────────────────

/**
 * El detalle ordenado: especie (en el orden en que se cubicó) → tipo
 * (`ORDEN_TIPO`) → espesor → ancho → largo. Es lo que se lee de arriba abajo
 * contra la pila, así que el orden no es cosmético.
 */
export function ordenarDetalle(paquetes: readonly PaqueteDeclarable[]): PaqueteDeclarable[] {
  const rangoEspecie = new Map<string, number>();
  for (const p of paquetes) {
    const k = claveEspecie(p.especie);
    if (!rangoEspecie.has(k)) rangoEspecie.set(k, rangoEspecie.size);
  }
  return [...paquetes].sort(
    (a, b) =>
      (rangoEspecie.get(claveEspecie(a.especie)) ?? 0) - (rangoEspecie.get(claveEspecie(b.especie)) ?? 0) ||
      rangoTipo(a.tipo) - rangoTipo(b.tipo) ||
      a.espesorCm - b.espesorCm ||
      a.anchoCm - b.anchoCm ||
      a.largoM - b.largoM,
  );
}

// ── El pedido al servidor ───────────────────────────────────────────────────

const positivo = (max: number) => z.number().finite().positive().max(max);
const precioSchema = z.number().finite().positive().max(100_000).nullable();
const especieSchema = z.string().trim().min(1).max(80);

const paqueteSchema = z.object({
  codigo: z.string().trim().min(1).max(40),
  productType: z.string().trim().max(120).nullable(),
  presentacion: z.string().trim().min(1).max(40),
  cantidad: z.number().int().positive().max(1_000_000),
  volumenM3: positivo(10_000),
  pieTablar: positivo(10_000_000),
  /* Mínimos reales de aserradero (medio centímetro, 10 cm de largo): una
     medida minúscula guardaba 0,00 cm en el libro y agrandaba la tolerancia
     del PT (auditoría de seguridad, 22-09). */
  espesorCm: z.number().finite().min(0.5).max(1_000),
  anchoCm: z.number().finite().min(0.5).max(1_000),
  largoM: z.number().finite().min(0.1).max(100),
});

const precioPorEspecieSchema = z.object({ especie: especieSchema, precioPt: precioSchema });

/**
 * Cuerpo de `POST /api/admin/forestal/ctp/produccion-sin-lote`.
 *
 * El servidor NO confía en montos: recibe precios unitarios y paquetes, y el
 * importe lo calcula él con lo que quedó guardado (regla 6 del repo).
 */
export const produccionSinLoteSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha AAAA-MM-DD"),
  lineaProduccion: z.string().trim().max(40).nullable().optional(),
  /** Permiso declarado del asiento (ADR-402): no hay guía de la que heredarlo. */
  originCode: z.string().trim().max(80).nullable().optional(),
  observaciones: z.string().trim().max(2000).nullable().optional(),
  servicio: z.discriminatedUnion("tipo", [
    z.object({
      tipo: z.literal("propia"),
      /** S/ por PT por especie; se guarda en cada paquete (`precioVentaPt`). */
      preciosVentaPt: z.array(precioPorEspecieSchema).max(12),
    }),
    z.object({
      tipo: z.literal("tercero"),
      /** La cuenta del cliente: una parte del directorio forestal. */
      parteId: z.string().trim().min(1).max(64),
      /** Trato de ESTA corrida, por especie. `null` = cobra la tarifa si hay. */
      preciosManualPt: z.array(precioPorEspecieSchema).max(12),
    }),
  ]),
  /** Una corrida por especie (ADR-429): el LO-CTP declara una por asiento. */
  corridas: z
    .array(z.object({ especie: especieSchema, paquetes: z.array(paqueteSchema).min(1).max(500) }))
    .min(1)
    .max(12),
  /** Ya se avisó de un posible duplicado (misma fecha, especie y m³) y se sigue igual. */
  confirmarDuplicado: z.boolean().optional(),
});

export type ProduccionSinLoteInput = z.infer<typeof produccionSinLoteSchema>;

/** Una corrida que quedó en el Libro, con lo que se cobró o valorizó. */
export interface CorridaDeclarada {
  id: string;
  lineNo: number | null;
  especie: string;
  pt: number;
  m3: number;
  /** Madera propia: PT × precio de venta guardado. `null` = sin precio. */
  valorVenta: number | null;
  /** Servicio a tercero: el resultado del cargo (ADR-412). */
  aserrio: ResultadoCobro | null;
}

export interface ProduccionSinLoteRespuesta {
  corridas: CorridaDeclarada[];
  total: { pt: number; m3: number; valorVenta: number | null };
}

/** Códigos de error que la pantalla sabe explicar. */
export type ErrorProduccionSinLote =
  | "POSIBLE_DUPLICADO" // 409 · detail.duplicados[{ id, lineNo, especie, m3, sinLote }]
  | "PAQUETE_YA_DECLARADO" // 409 · detail { codigo, lineNo, corridaId }
  | "PARTE_NO_EXISTE" // 404 · detail { parteId }
  | "SIN_ESPECIE" // 422
  | "PT_NO_CUADRA" // 422 · detail { codigo, pieTablar, calculado, tolerancia }
  | "PERIODO_CERRADO" // 422 · detail { periodKey }
  | "ESPECIE_REPETIDA" // 400
  | "FECHA_INVALIDA" // 400
  | "LINEA_INVALIDA" // 400 — la línea sale de LINEAS_PRODUCCION, no es texto libre
  | "validation_error"; // 400 — Zod

/** Arma el pedido desde lo que muestra la pantalla: una corrida por especie. */
export function armarPedido(args: {
  paquetes: readonly PaqueteDeclarable[];
  fecha: string;
  lineaProduccion?: string | null;
  originCode?: string | null;
  observaciones?: string | null;
  servicio: { tipo: "propia"; precios: PreciosPorEspecie } | { tipo: "tercero"; parteId: string; precios: PreciosPorEspecie };
  confirmarDuplicado?: boolean;
}): ProduccionSinLoteInput {
  const corridas = corridasPorEspecie(args.paquetes);
  const precios = corridas.map((c) => ({ especie: c.especie, precioPt: precioDe(args.servicio.precios, c.especie) }));
  return {
    fecha: args.fecha,
    lineaProduccion: args.lineaProduccion ?? null,
    originCode: args.originCode ?? null,
    observaciones: args.observaciones ?? null,
    servicio:
      args.servicio.tipo === "propia"
        ? { tipo: "propia", preciosVentaPt: precios }
        : { tipo: "tercero", parteId: args.servicio.parteId, preciosManualPt: precios },
    corridas: corridas.map((c) => ({
      especie: c.especie,
      paquetes: c.paquetes.map((p) => ({
        codigo: p.codigo,
        productType: p.productType,
        presentacion: p.presentacion,
        cantidad: p.cantidad,
        volumenM3: p.volumenM3,
        pieTablar: p.pieTablar,
        espesorCm: p.espesorCm,
        anchoCm: p.anchoCm,
        largoM: p.largoM,
      })),
    })),
    confirmarDuplicado: args.confirmarDuplicado,
  };
}
