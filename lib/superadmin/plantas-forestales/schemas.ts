/**
 * Entradas de las rutas `/api/superadmin/plantas/*` (siempre con `safeParse`).
 * Sin `server-only`: las pantallas validan con las mismas reglas antes de mandar.
 */
import { z } from "zod";
import { conteoPatioSchema } from "@/lib/forestal/conteo-patio-guardado";

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa una fecha AAAA-MM-DD");

/** cuid o el id literal "main". */
export const tenantIdSchema = z.string().regex(/^[a-z0-9-]{3,40}$/);

export const listaQuerySchema = z.object({
  desde: dia.optional(),
  hasta: dia.optional(),
  incluirPrueba: z.enum(["0", "1"]).optional(),
});

export const fichaQuerySchema = z.object({
  desde: dia.optional(),
  hasta: dia.optional(),
});

export const incoherenciasQuerySchema = z.object({
  gravedad: z.enum(["error", "warning", "info"]).optional(),
  origen: z.enum(["saldo", "cuadre_ingreso", "rendimiento", "pendiente", "inspeccion"]).optional(),
  tenantId: tenantIdSchema.optional(),
  incluirPrueba: z.enum(["0", "1"]).optional(),
});

export const refrescarSchema = z.object({ tenantId: tenantIdSchema.optional() });

// ── Inspección (fase 3) ─────────────────────────────────────────────────────

export const crearInspeccionSchema = z.object({
  fecha: dia,
  notas: z.string().max(2000).optional(),
});

/** La carpeta de `/api/superadmin/upload` donde van las fotos de los hallazgos. */
export const CARPETA_FOTOS_INSPECCION = "inspecciones-planta";

const FOTO_SUPABASE = /^\/storage\/v1\/object\/public\/media\/superadmin\/inspecciones-planta\/[A-Za-z0-9_-]+\.webp$/;
const FOTO_LOCAL = /^\/uploads\/inspecciones-planta\/[A-Za-z0-9_-]+\.webp$/;

function hostDeSupabase(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  try {
    return new URL(base).host;
  } catch {
    return null;
  }
}

/**
 * Sólo lo que devuelve `/api/superadmin/upload` con `folder=inspecciones-planta`
 * (security 17-10: `z.string().url()` aceptaba `javascript:` y `data:`):
 *  · Supabase Storage — `https://<proyecto>.supabase.co/storage/v1/object/public/media/superadmin/inspecciones-planta/<archivo>.webp`
 *    (el host es el de `NEXT_PUBLIC_SUPABASE_URL`; sin esa variable, cualquier `*.supabase.co`);
 *  · respaldo en disco de dev — `/uploads/inspecciones-planta/<archivo>.webp`.
 * Sin query, hash ni usuario en la URL.
 */
export function esFotoDeInspeccion(u: string): boolean {
  if (FOTO_LOCAL.test(u)) return true;
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.search || url.hash || url.username || url.password || url.port) return false;
  const host = hostDeSupabase();
  if (host ? url.host !== host : !url.host.endsWith(".supabase.co")) return false;
  return FOTO_SUPABASE.test(url.pathname);
}

const fotoSchema = z.string().max(500).refine(esFotoDeInspeccion, "La foto tiene que subirse desde la inspección");

const referenciaSchema = z.object({
  tipo: z.enum(["guia", "especie", "corrida", "lote", "troza"]),
  valor: z.string().max(80),
});

const hallazgoSchema = z.object({
  id: z.string().max(40),
  gravedad: z.enum(["error", "warning", "info"]),
  categoria: z.enum(["volumen", "documentos", "trazabilidad", "seguridad", "otro"]),
  texto: z.string().min(3).max(2000),
  m3: z.number().nonnegative().nullable(),
  fotos: z.array(fotoSchema).max(12),
  referencia: referenciaSchema.nullable(),
});

const conteoAserradaSchema = z.object({
  producto: z.string().max(200),
  especie: z.string().max(80).nullable(),
  libroM3: z.number(),
  contadoM3: z.number().nonnegative().nullable(),
  libroPiezas: z.number().int().nullable(),
  contadoPiezas: z.number().int().nonnegative().nullable(),
});

export const editarInspeccionSchema = z
  .object({
    hallazgos: z.array(hallazgoSchema).max(200).optional(),
    aserrada: z.array(conteoAserradaSchema).max(500).optional(),
    conteoPatio: conteoPatioSchema.optional(),
    conclusion: z.string().max(4000).optional(),
    responsablePlanta: z.string().max(120).optional(),
    cerrar: z.literal(true).optional(),
    anular: z.string().min(5).max(500).optional(),
  })
  .strict();

/** GET /api/superadmin/plantas/inspecciones: las de todas las plantas. */
export const inspeccionesQuerySchema = z.object({
  estado: z.enum(["abierta", "cerrada", "anulada"]).optional(),
  tenantId: tenantIdSchema.optional(),
  incluirPrueba: z.enum(["0", "1"]).optional(),
});

export type ListaQuery = z.infer<typeof listaQuerySchema>;
export type IncoherenciasQuery = z.infer<typeof incoherenciasQuerySchema>;
export type EditarInspeccion = z.infer<typeof editarInspeccionSchema>;

/** PATCH /api/superadmin/plantas/prueba: marcar (o desmarcar) una planta como de prueba. */
export const pruebaSchema = z.object({ tenantId: tenantIdSchema, esPrueba: z.boolean() }).strict();
