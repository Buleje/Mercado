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
  fotos: z.array(z.string().url()).max(12),
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

export type ListaQuery = z.infer<typeof listaQuerySchema>;
export type IncoherenciasQuery = z.infer<typeof incoherenciasQuerySchema>;
export type EditarInspeccion = z.infer<typeof editarInspeccionSchema>;

/** PATCH /api/superadmin/plantas/prueba: marcar (o desmarcar) una planta como de prueba. */
export const pruebaSchema = z.object({ tenantId: tenantIdSchema, esPrueba: z.boolean() }).strict();
