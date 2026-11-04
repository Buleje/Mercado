/**
 * Esquemas de las rutas de alquileres (ADR-524).
 *
 * Montos en soles/dólares con hasta 2 decimales (el backend los pasa a
 * céntimos). Patch = ausente no se toca, `null` borra, "" = null. Texto libre
 * que puede llevar una clave (`reajuste`, `notas`, notas del pago) pasa por
 * `textoSinClave` → 422 `parece_clave`. Sin `.transform` (en Zod 4 vuelve
 * requerida la clave): la CCI se normaliza en `normalizar()`.
 */
import { z } from "zod";
import {
  ESTADOS_ALQUILER,
  MEDIOS_PAGO_ALQUILER,
  MONEDAS,
  NUESTRO_PAPEL,
} from "@/lib/admin/fichas-tramites-alquileres";
import { textoSinClave } from "@/lib/admin/sin-claves";
import { diaSchema } from "@/lib/forestal/directorio";
import type { AlquilerCrear, AlquilerPatch, PagoPatch } from "@/lib/db/alquileres.db";

const texto = (max: number) => z.string().trim().max(max);
const idSchema = z.string().trim().min(1).max(40);
const dosDecimales = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6;
const monto = z
  .number()
  .finite()
  .max(1_000_000_000, "Monto demasiado grande")
  .refine(dosDecimales, "Hasta 2 decimales");

const camposAlquiler = {
  nombre: texto(160).min(1, "Falta el nombre del alquiler"),
  direccion: texto(300).nullable(),
  partidaSunarp: texto(40).nullable(),
  manzana: texto(20).nullable(),
  lote: texto(20).nullable(),
  areaM2: z.number().finite().positive().max(10_000_000).refine(dosDecimales, "Hasta 2 decimales").nullable(),
  ubigeo: z.string().trim().regex(/^\d{6}$/, "El ubigeo son 6 dígitos").nullable(),
  duenoParteId: idSchema.nullable(),
  duenoTexto: texto(160).nullable(),
  inquilinoParteId: idSchema.nullable(),
  inquilinoTexto: texto(160).nullable(),
  nuestroPapel: z.enum(NUESTRO_PAPEL).nullable(),
  rentaMensual: monto.refine((n) => n > 0, "La renta tiene que ser mayor que 0"),
  moneda: z.enum(MONEDAS),
  incluyeImpuestos: z.boolean().nullable(),
  diaPago: z.number().int().min(1).max(31).nullable(),
  garantiaMonto: monto.refine((n) => n >= 0, "La garantía no puede ser negativa").nullable(),
  garantiaPagada: z.boolean().nullable(),
  garantiaPagadaEl: diaSchema.nullable(),
  garantiaDevueltaEl: diaSchema.nullable(),
  inicioEl: diaSchema,
  finEl: diaSchema.nullable(),
  renovacionAutomatica: z.boolean(),
  avisoNoRenovarDias: z.number().int().min(0).max(365).nullable(),
  reajuste: textoSinClave(300).nullable(),
  contratoDocumentId: idSchema.nullable(),
  cuentaBanco: texto(80).nullable(),
  cuentaCci: z
    .string()
    .trim()
    .refine((s) => s === "" || /^\d{20}$/.test(s.replace(/[\s-]/g, "")), "La CCI son 20 dígitos")
    .nullable(),
  cuentaTitular: texto(160).nullable(),
  estado: z.enum(ESTADOS_ALQUILER),
  notas: textoSinClave(2000).nullable(),
};

/** R4: «terminado» sin fecha de fin no pasa (en el PATCH, el fin guardado lo mira `AlquileresDB.actualizar`). */
const terminadoConFin = {
  check: (o: { estado?: string | null; finEl?: string | null }) => o.estado !== "terminado" || o.finEl !== null,
  error: { message: "Para dar por terminado el alquiler, pon la fecha de fin.", path: ["finEl"] },
};

export const alquilerCrearSchema = z
  .object(camposAlquiler)
  .partial()
  .required({ nombre: true, rentaMensual: true, inicioEl: true })
  .strict()
  .refine((o) => o.estado !== "terminado" || !!o.finEl, terminadoConFin.error);

export const alquilerPatchSchema = z.object(camposAlquiler).partial().strict().refine(terminadoConFin.check, terminadoConFin.error);

export const filtroAlquileresSchema = z.object({
  estado: z.enum(ESTADOS_ALQUILER).optional(),
  duenoParteId: idSchema.optional(),
});

const camposPago = {
  periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "El mes va como AAAA-MM"),
  monto: monto.refine((n) => n > 0, "El monto tiene que ser mayor que 0"),
  pagadoEl: diaSchema,
  medio: z.enum(MEDIOS_PAGO_ALQUILER),
  numeroOperacion: texto(60).nullable(),
  comprobanteDocumentId: idSchema.nullable(),
  notas: textoSinClave(500).nullable(),
};

export const pagoSchema = z
  .object(camposPago)
  .partial({ numeroOperacion: true, comprobanteDocumentId: true, notas: true })
  .strict();

export const pagoPatchSchema = z
  .object(camposPago)
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: "No vino nada que corregir" });

/** "" → null y la CCI sin espacios ni guiones. */
export function normalizar<T extends Record<string, unknown>>(o: T): T {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === "") r[k] = null;
    else if (k === "cuentaCci" && typeof v === "string") r[k] = v.replace(/[\s-]/g, "");
    else r[k] = v;
  }
  return r as T;
}

export type AlquilerCrearBody = z.infer<typeof alquilerCrearSchema>;
export const aCrear = (d: AlquilerCrearBody): AlquilerCrear => normalizar(d) as AlquilerCrear;
export const aPatch = (d: z.infer<typeof alquilerPatchSchema>): AlquilerPatch => normalizar(d) as AlquilerPatch;
export const aPagoPatch = (d: z.infer<typeof pagoPatchSchema>): PagoPatch => normalizar(d) as PagoPatch;
