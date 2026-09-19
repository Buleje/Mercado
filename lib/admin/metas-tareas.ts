/**
 * lib/admin/metas-tareas.ts — contrato de metas y tareas del panel (ADR-415).
 *
 * Antes las dos listas vivían en `local-data/*.json` sin `tenantId`: todos los
 * negocios leían y escribían la misma, y en Vercel el disco es de sólo lectura,
 * así que producción nunca guardó una.
 *
 * Las listas cerradas viven acá Y en los CHECK de
 * `prisma/migrations/adr-415-metas-y-tareas.sql`: una categoría nueva cambia
 * los dos lados.
 *
 * Los esquemas de edición se escriben aparte y SIN `.default()`: en Zod 4,
 * `.partial()` aplica los defaults, así que un PATCH `{ current: 5 }` también
 * mandaba `category: "ventas"` y pisaba la categoría (medido 2026-09-14). Zod
 * descarta las claves que no están en el esquema: el `{ ...goal, ...body }` de
 * antes dejaba cambiar cualquier campo, incluso `createdAt`.
 */
import { z } from "zod";

export const CATEGORIAS_META = ["ventas", "pedidos", "clientes", "productos", "caja", "ticket_promedio", "retencion"] as const;
export const PERIODOS_META = ["diario", "semanal", "mensual"] as const;
export const PRIORIDADES_TAREA = ["baja", "media", "alta", "urgente"] as const;
export const ESTADOS_TAREA = ["pendiente", "en_progreso", "completada", "cancelada"] as const;

export type CategoriaMeta = (typeof CATEGORIAS_META)[number];
export type PeriodoMeta = (typeof PERIODOS_META)[number];
export type PrioridadTarea = (typeof PRIORIDADES_TAREA)[number];
export type EstadoTarea = (typeof ESTADOS_TAREA)[number];

/** DECIMAL(14,2) en la base. */
const monto = z.coerce.number().max(999_999_999_999.99);

/** "YYYY-MM-DD" guarda la fecha; `""` o `null` la borran; ausente no la toca. */
const fecha = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha_invalida"), z.literal(""), z.null()])
  .optional();

/** Texto libre opcional: `""` o `null` lo borran; ausente no lo toca. */
const textoOpcional = (max: number) => z.union([z.string().trim().max(max), z.null()]).optional();

const nombreMeta = z.string().trim().min(1).max(120);
const unidadMeta = z.string().trim().min(1).max(20);
const tituloTarea = z.string().trim().min(1).max(200);

const alMenosUnCampo = (obj: Record<string, unknown>) => Object.values(obj).some((v) => v !== undefined);

export const metaCrearSchema = z.object({
  name: nombreMeta,
  category: z.enum(CATEGORIAS_META).default("ventas"),
  period: z.enum(PERIODOS_META).default("mensual"),
  target: monto.positive(),
  current: monto.min(0).default(0),
  unit: unidadMeta.default("S/"),
  dueDate: fecha,
});

export const metaEditarSchema = z
  .object({
    name: nombreMeta.optional(),
    category: z.enum(CATEGORIAS_META).optional(),
    period: z.enum(PERIODOS_META).optional(),
    target: monto.positive().optional(),
    current: monto.min(0).optional(),
    unit: unidadMeta.optional(),
    dueDate: fecha,
  })
  .refine(alMenosUnCampo, "sin_cambios");

export const tareaCrearSchema = z.object({
  title: tituloTarea,
  description: textoOpcional(2000),
  priority: z.enum(PRIORIDADES_TAREA).default("media"),
  assignedTo: textoOpcional(120),
  dueDate: fecha,
  module: textoOpcional(60),
});

/** `completedAt` no se acepta: lo pone el servidor al completar y lo borra al reabrir. */
export const tareaEditarSchema = z
  .object({
    title: tituloTarea.optional(),
    description: textoOpcional(2000),
    priority: z.enum(PRIORIDADES_TAREA).optional(),
    status: z.enum(ESTADOS_TAREA).optional(),
    assignedTo: textoOpcional(120),
    dueDate: fecha,
    module: textoOpcional(60),
  })
  .refine(alMenosUnCampo, "sin_cambios");

export type MetaCrear = z.infer<typeof metaCrearSchema>;
export type MetaEditar = z.infer<typeof metaEditarSchema>;
export type TareaCrear = z.infer<typeof tareaCrearSchema>;
export type TareaEditar = z.infer<typeof tareaEditarSchema>;

/** Lo que devuelve la API: la misma forma que leía el panel cuando vivía en JSON. */
export interface MetaDTO {
  id: string;
  name: string;
  category: CategoriaMeta;
  period: PeriodoMeta;
  target: number;
  current: number;
  unit: string;
  createdAt: string;
  dueDate?: string;
}

export interface TareaDTO {
  id: string;
  title: string;
  description?: string;
  priority: PrioridadTarea;
  status: EstadoTarea;
  assignedTo?: string;
  dueDate?: string;
  module?: string;
  createdAt: string;
  completedAt?: string;
}

/** "2026-09-14" → medianoche UTC, que es como Prisma entrega un DATE de Postgres. */
export function fechaADate(fechaSinHora: string): Date {
  return new Date(`${fechaSinHora}T00:00:00Z`);
}

/** Un DATE de Postgres → "YYYY-MM-DD": `<input type="date">` no muestra un ISO completo. */
export function dateAFecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Valor de un campo opcional para escribir: ausente no toca, `""`/`null` borra. */
export function opcionalParaGuardar(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  return v === null || v.trim() === "" ? null : v.trim();
}

// ── Fechas sin hora, en el día de Lima ──────────────────────────────────────
// `new Date("2026-09-14")` es medianoche UTC: en Lima son las 19:00 del 13. La
// plantilla «Meta diaria» creada el 14 a la noche vencía el 15, y una tarea que
// vence el 14 salía vencida y fechada «13/9» (medido 2026-09-14). Estas cuentas
// trabajan con la clave "YYYY-MM-DD" y nunca pasan por la zona del navegador.

const MS_DIA = 86_400_000;
const aUtc = (fecha: string) => Date.UTC(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1, Number(fecha.slice(8, 10)));

/** Días de `desde` a `hasta`: del 14/09 al 30/09 son 16; hacia atrás, negativo. */
export function diasEntreFechas(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / MS_DIA);
}

export function sumarDiasAFecha(fecha: string, dias: number): string {
  return new Date(aUtc(fecha) + dias * MS_DIA).toISOString().slice(0, 10);
}

/** Un mes después; si el día no existe en ese mes (31/01 + 1 mes), el último del mes. */
export function sumarMesesAFecha(fecha: string, meses: number): string {
  const base = new Date(Date.UTC(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  const dia = Math.min(Number(fecha.slice(8, 10)), ultimo);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Cuándo vence una meta creada desde plantilla, contado desde `hoy` (el día de Lima): diaria hoy, semanal en 7 días, mensual en un mes. */
export function vencimientoDePlantilla(periodo: PeriodoMeta, hoy: string): string {
  if (periodo === "diario") return hoy;
  if (periodo === "semanal") return sumarDiasAFecha(hoy, 7);
  return sumarMesesAFecha(hoy, 1);
}

/** "2026-09-14" → "14/09/2026", sin pasar por `Date`. */
export function fechaParaMostrar(fecha: string): string {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}`;
}
