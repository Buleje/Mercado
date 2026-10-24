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

/**
 * Fotos de los hallazgos: PRIVADAS (security 17-10, como las fotos de la carga,
 * ADR-434). Se suben por `POST /api/superadmin/plantas/<planta>/inspecciones/fotos`
 * al bucket privado, con un nombre que no se adivina (`randomUUID`), y se ven
 * sólo con la sesión del superadmin por
 * `GET /api/superadmin/plantas/<planta>/inspecciones/fotos/<uuid>` (302 a una
 * URL firmada de 10 min). Lo que guarda el hallazgo es esa dirección relativa.
 */
export const CARPETA_FOTOS_INSPECCION = "inspecciones-planta";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const FOTO_INSPECCION = new RegExp(`^/api/superadmin/plantas/([a-z0-9-]{3,40})/inspecciones/fotos/(${UUID})$`);

/** Dónde se sube la foto de un hallazgo de esa planta. */
export function rutaFotosDeInspeccion(tenantId: string): string {
  return `/api/superadmin/plantas/${encodeURIComponent(tenantId)}/inspecciones/fotos`;
}

/** La dirección (relativa, con sesión) de una foto ya subida. */
export function urlDeFotoDeInspeccion(tenantId: string, id: string): string {
  return `${rutaFotosDeInspeccion(tenantId)}/${id}`;
}

/** El archivo en el bucket privado: una carpeta por planta. */
export function pathDeFotoDeInspeccion(tenantId: string, id: string): string {
  return `superadmin/${CARPETA_FOTOS_INSPECCION}/${tenantId}/${id}.webp`;
}

export function esIdDeFotoDeInspeccion(id: string): boolean {
  return new RegExp(`^${UUID}$`).test(id);
}

/** `{ tenantId, id }` de una foto de inspección; cualquier otra cosa = `null`. */
export function leerFotoDeInspeccion(u: string): { tenantId: string; id: string } | null {
  const m = FOTO_INSPECCION.exec(u);
  return m ? { tenantId: m[1], id: m[2] } : null;
}

/**
 * Sólo lo que devuelve la subida de fotos de la inspección (security 17-10:
 * `z.string().url()` aceptaba `javascript:` y `data:`; después, URL públicas
 * del almacén que cualquiera veía sin sesión). Que la foto sea de ESTA planta
 * lo comprueba la DB class al guardar (`ForestInspeccionPlantaDB.editar`).
 */
export function esFotoDeInspeccion(u: string): boolean {
  return leerFotoDeInspeccion(u) !== null;
}

/* Topes de una VISITA (security 17-10: al máximo anterior un PATCH pesaba
   8,4 MB y dejó el servidor lento 10 min). La ruta además corta en 2 MB. */
export const MAX_HALLAZGOS = 100;
export const MAX_TEXTO_HALLAZGO = 1000;
export const MAX_FOTOS_HALLAZGO = 6;
export const MAX_ASERRADA = 300;
export const MAX_CONCLUSION = 3000;
/** Lecturas del conteo de una inspección: el patio entero (hasta 5.000 trozas) con holgura. */
export const MAX_LECTURAS_INSPECCION = 6000;
/** El cuerpo de un PATCH; 413 si pasa. */
export const MAX_BYTES_PATCH_INSPECCION = 2 * 1024 * 1024;

const fotoSchema = z.string().max(200).refine(esFotoDeInspeccion, "La foto tiene que subirse desde la inspección");

const referenciaSchema = z.object({
  tipo: z.enum(["guia", "especie", "corrida", "lote", "troza"]),
  valor: z.string().max(80),
});

const hallazgoSchema = z.object({
  id: z.string().max(40),
  gravedad: z.enum(["error", "warning", "info"]),
  categoria: z.enum(["volumen", "documentos", "trazabilidad", "seguridad", "otro"]),
  texto: z.string().min(3).max(MAX_TEXTO_HALLAZGO),
  m3: z.number().nonnegative().nullable(),
  fotos: z.array(fotoSchema).max(MAX_FOTOS_HALLAZGO),
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

/**
 * El conteo de trozas que manda el equipo, SIN las trozas: las pone el servidor
 * desde el libro congelado (`conteoDeLaInspeccion`), así que mandarlas sólo
 * pesa. La pantalla ya manda `trozas: []`.
 */
export const conteoInspeccionSchema = conteoPatioSchema.extend({
  trozas: conteoPatioSchema.shape.trozas.max(0, "Las trozas las pone el servidor"),
  lecturas: conteoPatioSchema.shape.lecturas.max(MAX_LECTURAS_INSPECCION),
});

export const editarInspeccionSchema = z
  .object({
    hallazgos: z.array(hallazgoSchema).max(MAX_HALLAZGOS).optional(),
    aserrada: z.array(conteoAserradaSchema).max(MAX_ASERRADA).optional(),
    conteoPatio: conteoInspeccionSchema.optional(),
    conclusion: z.string().max(MAX_CONCLUSION).optional(),
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
