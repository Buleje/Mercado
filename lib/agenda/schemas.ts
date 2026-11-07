/**
 * Agenda de Administración (ADR-501) — validación de entrada. Zod 4: quien lo use llama
 * SIEMPRE `safeParse` (nunca `.parse()`) y responde 400 con el primer mensaje.
 *
 * Dos gotchas de Zod 4 que dan forma a este archivo (medidos 18-10 con zod 4.4.3):
 *  · `.partial()` APLICA los `.default()` (un PATCH parcial pisaría campos): el esquema
 *    de edición sale de `CAMPOS_ACTIVIDAD`, que no tiene defaults; los defaults viven
 *    sólo en el de alta.
 *  · `.partial()` lanza sobre un objeto con refinements: los `superRefine` van después.
 *
 * Las reglas que cruzan campos (objetivo y parámetros según la regla) se validan acá
 * cuando vienen juntos; en un PATCH que trae sólo uno, la DB class llama
 * `validarActividadCompleta` sobre la fila ya mezclada.
 */
import { z } from "zod";
import {
  CANALES_AGENDA,
  COLORES_AGENDA,
  ESTADOS_MANUALES,
  FRECUENCIAS_AGENDA,
  INCLUYE_FEED_ICS,
  REGLAS_AGENDA,
  ROLES_RESPONSABLE_AGENDA,
  type FechaKey,
  type ReglaAgenda,
} from "./tipos";

// ── Piezas ──────────────────────────────────────────────────────────────────

const RE_FECHA_KEY = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const MS_DIA = 86_400_000;

/** Máximo de días (contando ambos extremos) que pide el calendario en una llamada. */
export const MAX_DIAS_RANGO = 62;
export const MAX_NOMBRE_ACTIVIDAD = 80;
export const MAX_NOTA_AGENDA = 500;

/** «YYYY-MM-DD» que existe en el calendario (rechaza 2026-02-30). */
export function esFechaKeyValida(valor: string): boolean {
  if (!RE_FECHA_KEY.test(valor)) return false;
  const [y, m, d] = valor.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  return fecha.getUTCFullYear() === y && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
}

/** Días entre dos FechaKey válidas (hasta − desde). */
export function diasEntre(desde: FechaKey, hasta: FechaKey): number {
  const [y1, m1, d1] = desde.split("-").map(Number);
  const [y2, m2, d2] = hasta.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / MS_DIA);
}

export const FechaKeySchema = z
  .string()
  .refine(esFechaKeyValida, { message: "Fecha inválida: usa AAAA-MM-DD" });

export const HoraSchema = z.string().regex(RE_HORA, { message: "Hora inválida: usa HH:MM (00:00 a 23:59)" });

/** Texto opcional: recorta y guarda «» como null. */
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { message: `Máximo ${max} caracteres` })
    .nullable()
    .transform((v) => (v ? v : null));

/** 0 = domingo … 6 = sábado; sin repetidos y ordenados. */
const DiasSemanaSchema = z
  .array(z.number().int().min(0).max(6))
  .max(7)
  .transform((dias) => [...new Set(dias)].sort((a, b) => a - b));

// ── Recurrencia ─────────────────────────────────────────────────────────────

export const RecurrenciaSchema = z
  .object({
    frecuencia: z.enum(FRECUENCIAS_AGENDA),
    desde: FechaKeySchema,
    hasta: FechaKeySchema.nullable().default(null),
    diasSemana: DiasSemanaSchema.default([]),
    diaMes: z.number().int().min(1).max(31).nullable().default(null),
    cadaN: z.number().int().min(1).max(366).nullable().default(null),
  })
  .superRefine((r, ctx) => {
    const pideDias = r.frecuencia === "diaria" || r.frecuencia === "semanal" || r.frecuencia === "quincenal";
    if (pideDias && r.diasSemana.length === 0) {
      ctx.addIssue({ code: "custom", path: ["diasSemana"], message: "Elige al menos un día de la semana" });
    }
    if (r.frecuencia === "mensual" && r.diaMes === null) {
      ctx.addIssue({ code: "custom", path: ["diaMes"], message: "Elige el día del mes" });
    }
    if (r.frecuencia === "cada_n_dias" && r.cadaN === null) {
      ctx.addIssue({ code: "custom", path: ["cadaN"], message: "Indica cada cuántos días" });
    }
    if (r.hasta !== null && r.hasta < r.desde) {
      ctx.addIssue({ code: "custom", path: ["hasta"], message: "«Hasta» no puede ser antes de «desde»" });
    }
  });

// ── Parámetros y objetivo según la regla ────────────────────────────────────

/** Qué recibe cada regla en `parametros`. Desconocidos = error (strict). */
export const PARAMETROS_POR_REGLA = {
  asistencia: z.strictObject({ minimo: z.enum(["todos", "alguno"]).default("todos") }),
  facturas: z.strictObject({ modo: z.enum(["emitir", "contador"]).default("emitir") }),
  servicio_aserrio: z.strictObject({ soloTerceros: z.boolean().default(false) }),
  gastos_ingresos: z.strictObject({
    que: z
      .array(z.enum(["gastos", "ingresos", "caja_cerrada", "cuenta_forestal"]), {
        message: "Elige qué se revisa: gastos, ingresos, caja o cuenta forestal",
      })
      .min(1, { message: "Elige qué se revisa: gastos, ingresos, caja o cuenta forestal" })
      .transform((xs) => [...new Set(xs)]),
  }),
  adelantos: z.strictObject({}),
  cuenta_tercero: z.strictObject({}),
  manual: z.strictObject({}),
} satisfies Record<ReglaAgenda, z.ZodType>;

export type ParametrosDeRegla<R extends ReglaAgenda> = z.output<(typeof PARAMETROS_POR_REGLA)[R]>;

/**
 * Qué objetivo admite cada regla: `exige` = obligatorio, `admite` = opcional (NULL = todas),
 * `null` = la regla no tiene objetivo. Coincide con el CHECK `AgendaActividad_objetivoTipo_chk`.
 */
export const OBJETIVO_POR_REGLA: Record<
  ReglaAgenda,
  { tipo: "parte" | "beneficiario"; modo: "exige" | "admite" } | null
> = {
  asistencia: null,
  facturas: null,
  servicio_aserrio: null,
  gastos_ingresos: null,
  adelantos: { tipo: "beneficiario", modo: "admite" },
  cuenta_tercero: { tipo: "parte", modo: "exige" },
  manual: null,
};

export const ObjetivoSchema = z.object({
  tipo: z.enum(["parte", "beneficiario"]),
  id: z.string().trim().min(1).max(64),
  nombre: z.string().trim().min(1).max(160),
});

type ObjetivoEntrada = z.output<typeof ObjetivoSchema> | null;

function mensajeObjetivo(regla: ReglaAgenda, objetivo: ObjetivoEntrada): string | null {
  const pide = OBJETIVO_POR_REGLA[regla];
  if (!pide) return objetivo ? "Esta actividad no va con una cuenta ni un beneficiario" : null;
  if (!objetivo) return pide.modo === "exige" ? "Elige la cuenta que se revisa" : null;
  if (objetivo.tipo !== pide.tipo) {
    return pide.tipo === "parte" ? "Elige una cuenta corriente, no un beneficiario" : "Elige un beneficiario de adelantos";
  }
  return null;
}

/** Primer mensaje de un safeParse fallido (para el 400). */
export function primerMensaje(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Datos inválidos";
}

export type ResultadoParametros =
  | { ok: true; parametros: Record<string, unknown> }
  | { ok: false; error: string };

/** Valida y normaliza (aplica defaults) los parámetros de una regla. */
export function validarParametros(regla: ReglaAgenda, parametros: unknown): ResultadoParametros {
  const r = PARAMETROS_POR_REGLA[regla].safeParse(parametros ?? {});
  return r.success ? { ok: true, parametros: r.data } : { ok: false, error: primerMensaje(r.error) };
}

/**
 * Chequeo cruzado sobre la actividad ENTERA (alta o fila ya mezclada con el PATCH).
 * Devuelve los parámetros normalizados para guardar.
 */
export function validarActividadCompleta(a: {
  regla: ReglaAgenda;
  objetivo: ObjetivoEntrada;
  parametros: unknown;
}): ResultadoParametros {
  const errObjetivo = mensajeObjetivo(a.regla, a.objetivo);
  if (errObjetivo) return { ok: false, error: errObjetivo };
  return validarParametros(a.regla, a.parametros);
}

// ── Actividad: alta y edición ───────────────────────────────────────────────

/** Campos de una actividad SIN defaults ni refinements (base del alta y del PATCH). */
const CAMPOS_ACTIVIDAD = {
  nombre: z
    .string()
    .trim()
    .min(1, { message: "Ponle un nombre a la actividad" })
    .max(MAX_NOMBRE_ACTIVIDAD, { message: `El nombre va hasta ${MAX_NOMBRE_ACTIVIDAD} caracteres` }),
  regla: z.enum(REGLAS_AGENDA),
  objetivo: ObjetivoSchema.nullable(),
  recurrencia: RecurrenciaSchema,
  hora: HoraSchema.nullable(),
  canales: z
    .array(z.enum(CANALES_AGENDA))
    .min(1, { message: "Elige al menos un canal de aviso" })
    .transform((xs) => [...new Set(xs)]),
  responsableRol: z.enum(ROLES_RESPONSABLE_AGENDA).nullable(),
  parametros: z.record(z.string(), z.unknown()),
  color: z.enum(COLORES_AGENDA),
  nota: textoOpcional(MAX_NOTA_AGENDA),
  activo: z.boolean(),
};

export const ActividadCrearSchema = z
  .object({
    ...CAMPOS_ACTIVIDAD,
    regla: CAMPOS_ACTIVIDAD.regla.default("manual"),
    objetivo: CAMPOS_ACTIVIDAD.objetivo.default(null),
    hora: CAMPOS_ACTIVIDAD.hora.default(null),
    canales: CAMPOS_ACTIVIDAD.canales.default(["campana"]),
    responsableRol: CAMPOS_ACTIVIDAD.responsableRol.default(null),
    parametros: CAMPOS_ACTIVIDAD.parametros.default({}),
    color: CAMPOS_ACTIVIDAD.color.default("info"),
    nota: CAMPOS_ACTIVIDAD.nota.default(null),
    activo: CAMPOS_ACTIVIDAD.activo.default(true),
  })
  .superRefine((a, ctx) => {
    const errObjetivo = mensajeObjetivo(a.regla, a.objetivo);
    if (errObjetivo) ctx.addIssue({ code: "custom", path: ["objetivo"], message: errObjetivo });
    const p = validarParametros(a.regla, a.parametros);
    if (!p.ok) ctx.addIssue({ code: "custom", path: ["parametros"], message: p.error });
  })
  .transform((a) => {
    const p = validarParametros(a.regla, a.parametros);
    return { ...a, parametros: p.ok ? p.parametros : a.parametros };
  });

/**
 * PATCH: cualquier campo + `version` (ISO de updatedAt que el cliente editó; si cambió → 409).
 * Sin defaults: lo que no viene no se toca. El chequeo cruzado completo lo hace la DB class
 * con `validarActividadCompleta` después de mezclar con la fila.
 */
export const ActividadEditarSchema = z
  .object(CAMPOS_ACTIVIDAD)
  .partial()
  .extend({ version: z.iso.datetime({ message: "Falta la versión de la actividad" }) })
  .superRefine((a, ctx) => {
    if (Object.entries(a).every(([campo, v]) => campo === "version" || v === undefined)) {
      ctx.addIssue({ code: "custom", message: "No hay nada que cambiar" });
    }
    if (a.regla !== undefined && a.objetivo !== undefined) {
      const errObjetivo = mensajeObjetivo(a.regla, a.objetivo);
      if (errObjetivo) ctx.addIssue({ code: "custom", path: ["objetivo"], message: errObjetivo });
    }
    if (a.regla !== undefined && a.parametros !== undefined) {
      const p = validarParametros(a.regla, a.parametros);
      if (!p.ok) ctx.addIssue({ code: "custom", path: ["parametros"], message: p.error });
    }
  });

export type ActividadCrearInput = z.output<typeof ActividadCrearSchema>;
export type ActividadEditarInput = z.output<typeof ActividadEditarSchema>;

// ── Ocurrencias, rango, notas, feed ─────────────────────────────────────────

/** Marcar un día a mano (upsert por [tenantId, actividadId, fecha]). */
export const MarcarOcurrenciaSchema = z
  .object({
    actividadId: z.string().trim().min(1).max(64),
    fecha: FechaKeySchema,
    estado: z.enum(ESTADOS_MANUALES),
    posponerA: FechaKeySchema.nullable().default(null),
    nota: textoOpcional(MAX_NOTA_AGENDA).default(null),
  })
  .superRefine((o, ctx) => {
    if (o.estado === "pospuesta") {
      if (o.posponerA === null) {
        ctx.addIssue({ code: "custom", path: ["posponerA"], message: "Elige para qué día se pospone" });
      } else if (o.posponerA <= o.fecha) {
        ctx.addIssue({ code: "custom", path: ["posponerA"], message: "Se pospone a un día después" });
      }
    }
  })
  // CHECK AgendaOcurrencia_posponer_chk: sólo «pospuesta» lleva día nuevo.
  .transform((o) => (o.estado === "pospuesta" ? o : { ...o, posponerA: null }));

export type MarcarOcurrenciaInput = z.output<typeof MarcarOcurrenciaSchema>;

/** `?desde&hasta` del calendario: hasta ≥ desde y como mucho MAX_DIAS_RANGO días. */
export const RangoSchema = z
  .object({ desde: FechaKeySchema, hasta: FechaKeySchema })
  .superRefine((r, ctx) => {
    if (!esFechaKeyValida(r.desde) || !esFechaKeyValida(r.hasta)) return;
    const dias = diasEntre(r.desde, r.hasta) + 1;
    if (dias < 1) {
      ctx.addIssue({ code: "custom", path: ["hasta"], message: "«Hasta» no puede ser antes de «desde»" });
    } else if (dias > MAX_DIAS_RANGO) {
      ctx.addIssue({ code: "custom", path: ["hasta"], message: `Como mucho ${MAX_DIAS_RANGO} días por consulta` });
    }
  });

export type RangoInput = z.output<typeof RangoSchema>;

/**
 * `fecha` que suman POST/PATCH de /api/notes: `.extend(NotaConFechaSchema.shape)`.
 * Opcional y sin default: en un PATCH, no mandarla = no tocarla; `null` = quitarle el día.
 */
export const NotaConFechaSchema = z.object({ fecha: FechaKeySchema.nullable().optional() });

/** POST /api/admin/agenda/ics — `{ nombre?, incluye? }` (CHECK AgendaFeedIcs_incluye_chk). */
export const FeedIcsCrearSchema = z.object({
  nombre: z.string().trim().min(1).max(80).optional(),
  incluye: z
    .array(z.enum(INCLUYE_FEED_ICS))
    .min(1, { message: "Elige qué entra en el calendario" })
    .transform((xs) => [...new Set(xs)])
    .optional(),
});

export type FeedIcsCrearInput = z.output<typeof FeedIcsCrearSchema>;
