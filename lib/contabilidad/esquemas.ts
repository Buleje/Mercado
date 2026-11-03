/**
 * lib/contabilidad/esquemas.ts — Zod de las entradas de la Contabilidad (ADR-529).
 * Siempre `safeParse`. PURO y client-safe.
 */
import { z } from "zod";
import { LIBROS_EXPORTABLES, NATURALEZAS, TIPOS_ASIENTO_MANUAL } from "./tipos";

export const ESQUEMA_MES = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: "El mes va como AAAA-MM." });
/** El día existe en el calendario (2026-02-31 no). */
const esDiaReal = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
};
const FECHA = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, { error: "La fecha va como AAAA-MM-DD." })
  .refine(esDiaReal, { error: "Esa fecha no existe en el calendario." });
const CODIGO = z.string().trim().regex(/^\d{2,10}$/, { error: "El código de cuenta son solo números (2 a 10)." });
const MONTO = z.number().finite().min(0, { error: "Los montos no pueden ser negativos." }).max(1e11);

export const QueryMes = z.object({ mes: ESQUEMA_MES });
export const QueryMayor = z.object({ mes: ESQUEMA_MES, cuenta: CODIGO.optional() });
export const QueryExportar = z.object({ mes: ESQUEMA_MES, libro: z.enum(LIBROS_EXPORTABLES) });

export const LineaManual = z
  .object({
    cuenta: CODIGO,
    debe: MONTO,
    haber: MONTO,
    glosa: z.string().trim().max(200).nullish(),
    tercero: z.string().trim().max(160).nullish(),
  })
  .refine((l) => (l.debe > 0) !== (l.haber > 0), { error: "Cada línea va al debe o al haber (solo uno, mayor que 0)." });

export const AsientoManualSchema = z.object({
  fecha: FECHA,
  glosa: z.string().trim().min(2, { error: "Escribe de qué es el asiento." }).max(300),
  tipo: z.enum(TIPOS_ASIENTO_MANUAL),
  lineas: z.array(LineaManual).min(2, { error: "Un asiento lleva al menos dos líneas." }).max(300),
});

export const CuentaPropiaSchema = z.object({
  codigo: z.string().trim().regex(/^\d{3,10}$/, { error: "El código son 3 a 10 números y cuelga de una cuenta del PCGE." }),
  nombre: z.string().trim().min(2, { error: "El nombre de la cuenta va con al menos 2 letras." }).max(120),
  naturaleza: z.enum(NATURALEZAS),
});

export const PatchCuentaSchema = z
  .object({ nombre: z.string().trim().min(2, { error: "El nombre de la cuenta va con al menos 2 letras." }).max(120).optional(), activa: z.boolean().optional() })
  .refine((p) => p.nombre !== undefined || p.activa !== undefined, { error: "Nada que cambiar." });

export const AjustesSchema = z.object({
  ventasConIgv: z.boolean().nullable().optional(),
  inicio: ESQUEMA_MES.optional(),
  mapeo: z.record(z.string().trim().min(2).max(40), CODIGO).optional(),
});

export type AsientoManualValidado = z.infer<typeof AsientoManualSchema>;
export type AjustesValidados = z.infer<typeof AjustesSchema>;
