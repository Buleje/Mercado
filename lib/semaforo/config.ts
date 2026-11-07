/**
 * lib/semaforo/config.ts — configuración del Semáforo por negocio (ADR-508).
 *
 * Vive en `featureFlagsJson.semaforo` (sin columna nueva): se escribe por clave
 * con `SettingsDB.pisarClavesFlags`, nunca el JSON entero. Lo que falta o no
 * pasa el schema cae al catálogo (`INDICADORES`): un JSON roto nunca tumba la
 * pantalla, sólo vuelve a los valores por defecto.
 *
 * Puro: lo usan la ruta (PUT), la DB (lectura) y la vista (modal de ajustes).
 */
import { z } from "zod";
import { IDS_INDICADORES, INDICADORES, type IndicadorId, type TramoAccion, type UmbralIndicador } from "./indicadores";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const fechaKey = z.string().regex(FECHA, "Fecha AAAA-MM-DD");
const numero = z.number().finite().min(-1e9).max(1e9);
const accion = z.string().trim().max(160);

const ajusteIndicadorSchema = z.object({
  verde: numero.nullable().optional(),
  amarillo: numero.nullable().optional(),
  verdeHasta: numero.nullable().optional(),
  acciones: z
    .object({ verde: accion.optional(), amarillo: accion.optional(), rojo: accion.optional(), bajo: accion.optional() })
    .optional(),
  apagado: z.boolean().optional(),
});

export const configSemaforoSchema = z.object({
  version: z.literal(1).optional(),
  /** Día en que el negocio arranca de verdad: lo de antes son datos de prueba. */
  lanzamiento: fechaKey.nullable().optional(),
  /** Decisión «seguir, ajustar o parar» sobre la ganancia acumulada desde el lanzamiento. */
  decision: z
    .object({
      fecha: fechaKey,
      verde: numero,
      amarillo: numero,
      /** Rojo sólo si además la recompra (%) está debajo de esto. `null` = rojo con la ganancia sola. */
      rojoSiRecompraMenorA: z.number().min(0).max(100).nullable().optional(),
    })
    .nullable()
    .optional(),
  /** Códigos (barcode o sku) de los productos A. Vacío = los que tienen stock mínimo. */
  productosA: z.array(z.string().trim().min(1).max(40)).max(300).optional(),
  /** Categorías de gasto que cuentan como anuncios (sin mayúsculas). */
  categoriasAnuncios: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  /** Caja anotada a mano (cuenta + Yape + efectivo). */
  cajaAnotada: z.object({ monto: numero, fecha: fechaKey }).nullable().optional(),
  indicadores: z.partialRecord(z.enum(IDS_INDICADORES), ajusteIndicadorSchema).optional(),
});

export type ConfigSemaforoGuardada = z.infer<typeof configSemaforoSchema>;

export interface AjusteNormalizado extends UmbralIndicador {
  acciones: Readonly<Record<TramoAccion, string>>;
  apagado: boolean;
}

export interface ConfigSemaforo {
  lanzamiento: string | null;
  decision: { fecha: string; verde: number; amarillo: number; rojoSiRecompraMenorA: number | null } | null;
  productosA: string[];
  categoriasAnuncios: string[];
  cajaAnotada: { monto: number; fecha: string } | null;
  indicadores: Readonly<Record<IndicadorId, AjusteNormalizado>>;
  /** El JSON guardado no pasó el schema: se usan los valores por defecto. */
  invalida: boolean;
}

export const CATEGORIAS_ANUNCIOS_DEFECTO = ["marketing", "publicidad", "anuncios"] as const;

/** `undefined` = no lo tocó → defecto; `null` = lo borró a propósito → sin meta. */
const elegir = (v: number | null | undefined, defecto: number | null | undefined): number | null =>
  v === undefined ? (defecto ?? null) : v;

/** Mezcla lo guardado con el catálogo. Nunca tira: lo inválido vuelve al defecto. */
export function normalizarConfig(crudo: unknown): ConfigSemaforo {
  const r = crudo === undefined || crudo === null ? null : configSemaforoSchema.safeParse(crudo);
  const g: ConfigSemaforoGuardada = r?.success ? r.data : {};
  const indicadores = {} as Record<IndicadorId, AjusteNormalizado>;
  for (const def of INDICADORES) {
    const a = g.indicadores?.[def.id];
    const accionDe = (t: TramoAccion): string =>
      a?.acciones?.[t]?.trim() || (t === "bajo" ? (def.acciones.bajo ?? def.acciones.amarillo) : def.acciones[t]);
    indicadores[def.id] = {
      verde: elegir(a?.verde, def.umbral.verde),
      amarillo: elegir(a?.amarillo, def.umbral.amarillo),
      verdeHasta: elegir(a?.verdeHasta, def.umbral.verdeHasta),
      acciones: { verde: accionDe("verde"), amarillo: accionDe("amarillo"), rojo: accionDe("rojo"), bajo: accionDe("bajo") },
      apagado: a?.apagado === true,
    };
  }
  const anuncios = (g.categoriasAnuncios ?? []).map((c) => c.toLowerCase());
  return {
    lanzamiento: g.lanzamiento ?? null,
    decision: g.decision
      ? { ...g.decision, rojoSiRecompraMenorA: g.decision.rojoSiRecompraMenorA ?? null }
      : null,
    productosA: g.productosA ?? [],
    categoriasAnuncios: anuncios.length > 0 ? anuncios : [...CATEGORIAS_ANUNCIOS_DEFECTO],
    cajaAnotada: g.cajaAnotada ?? null,
    indicadores,
    invalida: r !== null && !r.success,
  };
}

/** Lee `featureFlagsJson` completo y devuelve la config del semáforo ya normalizada. */
export function configDeFlags(flags: unknown): ConfigSemaforo {
  const semaforo = flags && typeof flags === "object" ? (flags as Record<string, unknown>).semaforo : undefined;
  return normalizarConfig(semaforo);
}

/** Lo guardado tal cual (para el PUT que mezcla por indicador). Inválido = vacío. */
export function guardadaDeFlags(flags: unknown): ConfigSemaforoGuardada {
  const semaforo = flags && typeof flags === "object" ? (flags as Record<string, unknown>).semaforo : undefined;
  const r = configSemaforoSchema.safeParse(semaforo ?? {});
  return r.success ? r.data : {};
}

/**
 * Mezcla un cambio sobre lo guardado: las claves de primer nivel se pisan y
 * `indicadores` se mezcla por indicador (cambiar el ticket no borra la caja).
 */
export function mezclarConfig(actual: ConfigSemaforoGuardada, cambio: ConfigSemaforoGuardada): ConfigSemaforoGuardada {
  const indicadores = { ...(actual.indicadores ?? {}) };
  for (const [id, ajuste] of Object.entries(cambio.indicadores ?? {}) as Array<[IndicadorId, NonNullable<ConfigSemaforoGuardada["indicadores"]>[IndicadorId]]>) {
    if (!ajuste) continue;
    indicadores[id] = { ...(indicadores[id] ?? {}), ...ajuste };
  }
  return { ...actual, ...cambio, version: 1, indicadores };
}
