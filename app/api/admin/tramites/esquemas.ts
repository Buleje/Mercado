/**
 * Esquemas de las rutas de trámites de Administración (ADR-524).
 *
 * Patch = ausente no se toca, `null` borra, "" = null. El texto libre que
 * puede llevar una clave (`proximoPaso`, `contacto`, `notas`, nota de
 * requisito) pasa por `textoSinClave` → 422 `parece_clave`.
 */
import { z } from "zod";
import {
  CANALES_TRAMITE,
  ENTIDADES_TRAMITE,
  ESTADOS_REQUISITO,
  ESTADOS_TRAMITE,
} from "@/lib/admin/fichas-tramites-alquileres";
import { textoSinClave } from "@/lib/admin/sin-claves";
import { CLAVES_PLANTILLA_TRAMITE, plantillaTramite } from "@/lib/admin/tramites-plantillas";
import { diaSchema } from "@/lib/forestal/directorio";
import type { RequisitoNuevo, TramiteCrear } from "@/lib/db/tramites.db";

const texto = (max: number) => z.string().trim().max(max);
const idSchema = z.string().trim().min(1).max(40);

const camposTramite = {
  entidad: z.enum(ENTIDADES_TRAMITE),
  entidadNombre: texto(120).nullable(),
  asunto: textoSinClave(200).min(1, "Falta el asunto"),
  parteId: idSchema.nullable(),
  personaNombre: texto(120).nullable(),
  alquilerId: idSchema.nullable(),
  estado: z.enum(ESTADOS_TRAMITE),
  iniciadoEl: diaSchema.nullable(),
  enviadoEl: diaSchema.nullable(),
  venceEl: diaSchema.nullable(),
  proximoPaso: textoSinClave(300).nullable(),
  proximoPasoEl: diaSchema.nullable(),
  canal: z.enum(CANALES_TRAMITE).nullable(),
  contacto: textoSinClave(200).nullable(),
  notas: textoSinClave(2000).nullable(),
};

const requisitoNuevoSchema = z
  .object({
    nombre: textoSinClave(200).min(1, "Falta el nombre del requisito"),
    estado: z.enum(ESTADOS_REQUISITO).optional(),
    documentId: idSchema.nullable().optional(),
    nota: textoSinClave(500).nullable().optional(),
  })
  .strict();

export const tramitePatchSchema = z.object(camposTramite).partial().strict();

export const tramiteCrearSchema = z
  .object(camposTramite)
  .partial()
  .extend({
    requisitos: z.array(requisitoNuevoSchema).max(60).optional(),
    /** Siembra los requisitos de una plantilla (y entidad/asunto si no vinieron). */
    plantilla: z.enum(CLAVES_PLANTILLA_TRAMITE).optional(),
  })
  .strict();

export const requisitosOpsSchema = z
  .object({
    agregar: z.array(requisitoNuevoSchema).max(60).optional(),
    cambiar: z
      .array(
        z
          .object({
            id: idSchema,
            estado: z.enum(ESTADOS_REQUISITO).optional(),
            documentId: idSchema.nullable().optional(),
            nota: textoSinClave(500).nullable().optional(),
            nombre: textoSinClave(200).min(1).optional(),
            orden: z.number().int().min(0).max(999).optional(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    quitar: z.array(idSchema).max(100).optional(),
  })
  .strict()
  .refine((o) => (o.agregar?.length ?? 0) + (o.cambiar?.length ?? 0) + (o.quitar?.length ?? 0) > 0, {
    message: "No vino nada que agregar, cambiar o quitar",
  });

export const filtroTramitesSchema = z.object({
  estado: z.enum(ESTADOS_TRAMITE).optional(),
  entidad: z.enum(ENTIDADES_TRAMITE).optional(),
  parteId: idSchema.optional(),
  alquilerId: idSchema.optional(),
  q: texto(100).optional(),
  vencen: z.coerce.number().int().min(0).max(366).optional(),
});

/** "" → null en los textos opcionales (vaciar un campo desde un input). */
export function sinVacios<T extends Record<string, unknown>>(o: T): T {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) r[k] = v === "" ? null : v;
  return r as T;
}

/**
 * Plantilla → entidad/asunto que falten + sus requisitos en «falta» (primero
 * los de la plantilla, después los que vinieron, sin repetir el nombre).
 * Devuelve null si después de eso sigue sin entidad o sin asunto.
 */
export function armarAlta(d: z.infer<typeof tramiteCrearSchema>): TramiteCrear | null {
  const { plantilla: clave, requisitos = [], ...campos } = d;
  const p = clave ? plantillaTramite(clave) : null;
  const entidad = campos.entidad ?? p?.entidad;
  const asunto = campos.asunto ?? p?.asunto;
  if (!entidad || !asunto) return null;
  const vistos = new Set<string>();
  const todos: RequisitoNuevo[] = [];
  for (const r of [...(p?.requisitos ?? []).map((nombre) => ({ nombre })), ...requisitos]) {
    const k = r.nombre.trim().toLowerCase();
    if (vistos.has(k)) continue;
    vistos.add(k);
    todos.push(r);
  }
  return { ...sinVacios(campos), entidad, asunto, requisitos: todos };
}
