/**
 * schemas.ts — validación de entrada de Recursos Humanos (ADR-414).
 *
 * Siempre `safeParse()`, nunca `.parse()`. Las reglas ENTRE campos (documento
 * sin tipo, DNI de 8 dígitos, `SIN_PAGO ⇔ 0`, el par repetido
 * `(colaboradorId, fecha)` dentro de un lote, el rango ≤ 62/93 días) van en
 * los puros `revisar*` de `asistencia.ts`/`ganado.ts` y en las rutas — no en
 * un `.refine` dentro de una unión discriminada, que Zod no deja encadenar bien.
 */

import { z } from "zod";
import { ESTADOS_ASISTENCIA, MODALIDADES, TIPOS_DOCUMENTO } from "./tipos";

const fechaKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha va como AAAA-MM-DD");
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "La hora va como HH:MM");
const id = z.string().min(1).max(40);
const texto = (max: number) => z.string().trim().max(max);

const tarifaInput = z.object({
  modalidad: z.enum(["HORA", "DIA", "SEMANA", "MES"]),
  monto: z.number().positive().max(9_999_999),
  horasJornada: z.number().positive().max(24).optional(),
  vigenteDesde: fechaKey,
});
export type TarifaInput = z.infer<typeof tarifaInput>;

/** Ausente = mantener · `null` = quitar · valor = cambiar (mismo criterio que ADR-412). */
const camposColaborador = {
  nombre: z.string().trim().min(2).max(120),
  apodo: texto(40).nullable(),
  tipoDocumento: z.enum(TIPOS_DOCUMENTO).nullable(),
  documento: texto(20).nullable(),
  celular: texto(20).nullable(),
  direccion: texto(300).nullable(),
  contactoEmergenciaNombre: texto(120).nullable(),
  contactoEmergenciaCelular: texto(20).nullable(),
  puestoId: id.nullable(),
  fechaIngreso: fechaKey.nullable(),
  observaciones: texto(2000).nullable(),
};

export const colaboradorCrearSchema = z.object({
  ...camposColaborador,
  apodo: camposColaborador.apodo.optional(),
  tipoDocumento: camposColaborador.tipoDocumento.optional(),
  documento: camposColaborador.documento.optional(),
  celular: camposColaborador.celular.optional(),
  direccion: camposColaborador.direccion.optional(),
  contactoEmergenciaNombre: camposColaborador.contactoEmergenciaNombre.optional(),
  contactoEmergenciaCelular: camposColaborador.contactoEmergenciaCelular.optional(),
  puestoId: camposColaborador.puestoId.optional(),
  fechaIngreso: camposColaborador.fechaIngreso.optional(),
  observaciones: camposColaborador.observaciones.optional(),
  estado: z.enum(["ACTIVO", "VACACIONES", "LICENCIA", "SUSPENDIDO"]).default("ACTIVO"),
  beneficiarioId: id.nullable().optional(), // sólo completo
  tarifaInicial: tarifaInput.nullable().optional(), // sólo completo
});
export type ColaboradorCrearInput = z.infer<typeof colaboradorCrearSchema>;

export const colaboradorAccionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("editar"), ...z.object(camposColaborador).partial().shape }),
  z.object({
    action: z.literal("cambiar_estado"),
    estado: z.enum(["ACTIVO", "VACACIONES", "LICENCIA", "SUSPENDIDO"]),
    sinPagoDesde: fechaKey.optional(),
  }),
  z.object({
    action: z.literal("cesar"),
    fechaCese: fechaKey,
    motivo: z.string().trim().min(3).max(300),
    confirmar: z.boolean().optional(),
  }),
  z.object({ action: z.literal("reingresar"), fecha: fechaKey, tarifa: tarifaInput.nullable().optional() }),
  z.object({ action: z.literal("vincular_beneficiario"), beneficiarioId: id.nullable() }),
  z.object({ action: z.literal("vincular_usuario"), adminUserId: id.nullable() }),
  z.object({ action: z.literal("restaurar") }),
]);
export type ColaboradorAccionInput = z.infer<typeof colaboradorAccionSchema>;

export const tarifaGuardarSchema = z.object({
  modalidad: z.enum(MODALIDADES),
  monto: z.number().min(0).max(9_999_999), // SIN_PAGO ⇔ 0 lo valida el puro
  horasJornada: z.number().positive().max(24).optional(),
  vigenteDesde: fechaKey,
  motivo: texto(300).optional(),
});
export type TarifaGuardarInput = z.infer<typeof tarifaGuardarSchema>;

export const puestoSchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  descripcion: texto(300).nullable().optional(),
  tarifaSugerida: z
    .object({ modalidad: z.enum(["HORA", "DIA", "SEMANA", "MES"]), monto: z.number().positive().max(9_999_999) })
    .nullable()
    .optional(),
  horasJornada: z.number().positive().max(24).optional(),
  orden: z.number().int().min(0).max(999).optional(),
});
export type PuestoInput = z.infer<typeof puestoSchema>;

export const marcaInputSchema = z.object({
  colaboradorId: id,
  fecha: fechaKey,
  /** `null` = quitar la marca del día. */
  estado: z.enum(ESTADOS_ASISTENCIA).nullable(),
  entrada: hora.nullable().optional(),
  salida: hora.nullable().optional(),
  refrigerioMin: z.number().int().min(0).max(240).optional(),
  horas: z.number().positive().max(24).nullable().optional(),
  nota: texto(300).nullable().optional(),
});
export type MarcaInputWire = z.infer<typeof marcaInputSchema>;

export const guardarMarcasSchema = z.object({
  marcas: z.array(marcaInputSchema).min(1).max(200),
  motivo: texto(300).optional(),
});
export type GuardarMarcasInput = z.infer<typeof guardarMarcasSchema>;

export const masivoSchema = z.object({
  fecha: fechaKey,
  estado: z.enum(ESTADOS_ASISTENCIA).default("PRESENTE"),
  entrada: hora.nullable().optional(),
  salida: hora.nullable().optional(),
  colaboradorIds: z.array(id).max(500).optional(), // ausente = todos los incluibles
  sobrescribir: z.boolean().default(false),
  nota: texto(300).nullable().optional(),
});
export type MasivoInput = z.infer<typeof masivoSchema>;

export const rangoSchema = z.object({ desde: fechaKey, hasta: fechaKey, colaboradorId: id.optional() });
export type RangoInput = z.infer<typeof rangoSchema>;
