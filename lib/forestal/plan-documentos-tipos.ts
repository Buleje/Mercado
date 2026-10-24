/**
 * lib/forestal/plan-documentos-tipos.ts — contrato de ADR-467 (Documentos del plan).
 * Lo escribe el hilo principal ANTES de despachar; backend y frontend lo IMPORTAN, ninguno lo edita.
 * PURO: sin React, sin fetch, sin Prisma.
 */
import { z } from "zod";
import type { CampoPersonalizado } from "@/lib/campos-personalizados";

// ── Llaves estables (van a la base) ─────────────────────────────────────────
export const FORMULARIO_CARPETAS_PLAN = "forestal.plan.documentos";
export const PREFIJO_FORMULARIO_CARPETA = "forestal.plan.documentos.";
export const formularioDeCarpeta = (clave: string): string => `${PREFIJO_FORMULARIO_CARPETA}${clave}`;
export const esFormularioDeCarpeta = (f: string): boolean => f.startsWith(PREFIJO_FORMULARIO_CARPETA);

export const TIPO_CARPETA = "carpeta" as const; // sólo en FORMULARIO_CARPETAS_PLAN, sólo por la ruta nueva
export const TIPO_ARCHIVO = "archivo" as const; // sólo bajo PREFIJO_FORMULARIO_CARPETA

/** Etiquetas de máquina (≤40 caracteres: el PATCH del Drive las corta ahí; un cuid da 30-38). */
export const tagRaizPlan = (planId: string): string => `plan:${planId}`;
export const tagCarpetaPlan = (clave: string): string => `plan-carpeta:${clave}`;
export const tagCampo = (campoId: string): string => `campo:${campoId}`;
export const PREFIJOS_TAG_MAQUINA_PLAN = ["plan:", "plan-carpeta:", "campo:"] as const;
export const esTagDeMaquinaPlan = (t: string): boolean => PREFIJOS_TAG_MAQUINA_PLAN.some((p) => t.startsWith(p));

export const RAIZ_DRIVE_LOTH = "Libro TH";
export const DIAS_VENCE_PRONTO = 30;
export const ROLES_LECTURA_DOCS_PLAN = ["admin", "almacenero", "owner"] as const;
export const ROLES_ESCRITURA_DOCS_PLAN = ["admin", "owner"] as const;

// ── Lo que devuelve el servidor ─────────────────────────────────────────────
export type EstadoCasillero = "falta" | "cargado" | "vence_pronto" | "vencido";

export interface ArchivoDelPlan {
  documentId: string;
  nombre: string;
  mimeType: string;
  size: number;
  /** ISO. Es `Document.expiresAt`: el mismo dato que avisa el Drive (ADR-119). */
  expiresAt: string | null;
  uploadedAt: string;
  /** El casillero `archivo` al que pertenece (etiqueta `campo:`), o null = suelto en la carpeta. */
  campoId: string | null;
}

export interface CasilleroArchivo {
  campo: Omit<CampoPersonalizado, "tipo"> & { tipo: typeof TIPO_ARCHIVO }; // no depende de ampliar TipoCampo
  estado: EstadoCasillero;
  archivos: ArchivoDelPlan[];
  /** El vencimiento más próximo entre sus archivos (ISO) o null. */
  venceEl: string | null;
}

export interface CarpetaDelPlan {
  clave: string;
  /** Nombre que se ve en el Drive (manda el Drive; la plantilla sólo siembra). */
  nombre: string;
  /** null = todavía no se creó en el Drive (plan sin preparar o carpeta nueva de la plantilla). */
  folderId: string | null;
  /** Fila `tipo:"carpeta"` de la plantilla; null = carpeta hecha a mano en el Drive (sin adoptar). */
  plantillaId: string | null;
  soloEstePlan: boolean;
  orden: number;
  casilleros: CasilleroArchivo[];
  sueltos: ArchivoDelPlan[];
  /** Subcarpetas más hondas: se abren en Documentos, no acá. */
  subcarpetas: number;
}

export interface ResumenDocumentosPlan {
  esperados: number;
  cargados: number;
  faltan: number;
  vencenPronto: number;
  vencidos: number;
}

export interface PlanDocumentosVista {
  planId: string;
  planType: string;
  carpetaRaizId: string | null;
  /** «Libro TH/CCNN SAN LUIS DE CHINCHIGUANI/19-SEC-REG-PLT-2025-096» (para «Abrir en Documentos»). */
  rutaRaiz: string;
  preparada: boolean;
  carpetas: CarpetaDelPlan[];
  resumen: ResumenDocumentosPlan;
  /** Lo que el plan YA guarda: se muestra, no se pide de nuevo. */
  delPlan: {
    resolucionNumber: string | null;
    resolucionDate: string | null;
    representanteLegal: string | null;
    propietarioNombre: string | null;
  };
}

/** Plantilla sugerida (semilla): se escribe UNA vez por negocio en el primer `preparar`. */
export interface CarpetaSemilla {
  clave: string;
  nombre: string;
  descripcion: string;
  archivos: { nombre: string; descripcion: string }[];
  campos: { nombre: string; tipo: "texto" | "numero" | "fecha"; descripcion: string }[];
}

// ── Cuerpos (Zod; siempre safeParse) ────────────────────────────────────────
const id = z.string().trim().min(1).max(40);
const clave = z.string().trim().min(1).max(40).regex(/^[a-z0-9-]+$/);
const nombreCarpeta = z.string().trim().min(1).max(80);

export const PlanIdQuery = z.object({ planId: id });
export const PrepararBody = z.object({ planId: id });
export const CarpetaNuevaBody = z.object({
  planId: id,
  nombre: nombreCarpeta,
  /** true = entra a la plantilla (todos los planes); false = sólo este plan. */
  paraTodosLosPlanes: z.boolean().default(false),
});
export const CarpetaEditarBody = z.object({
  planId: id,
  clave,
  nombre: nombreCarpeta.optional(),
  orden: z.number().int().min(0).max(9999).optional(),
});
export const AdoptarCarpetaBody = z.object({ planId: id, folderId: id, paraTodosLosPlanes: z.boolean().default(false) });
export const PlantillaCarpetaPatch = z.object({
  id,
  nombre: nombreCarpeta.optional(),
  orden: z.number().int().min(0).max(9999).optional(),
  activo: z.boolean().optional(),
  /** Renombrar también las carpetas ya creadas en los planes (por etiqueta, no por nombre). */
  renombrarEnPlanes: z.boolean().default(false),
});
export const VincularArchivoBody = z.object({
  planId: id,
  documentId: id,
  /** null = sacarlo del casillero (queda suelto en su carpeta). */
  campoId: id.nullable(),
});

export type PrepararInput = z.infer<typeof PrepararBody>;
export type CarpetaNuevaInput = z.infer<typeof CarpetaNuevaBody>;
export type CarpetaEditarInput = z.infer<typeof CarpetaEditarBody>;
export type AdoptarCarpetaInput = z.infer<typeof AdoptarCarpetaBody>;
export type PlantillaCarpetaPatchInput = z.infer<typeof PlantillaCarpetaPatch>;
export type VincularArchivoInput = z.infer<typeof VincularArchivoBody>;

/** Respuestas: toda ruta de escritura devuelve la vista entera (una fuente para la pantalla). */
export type RespuestaVista = { vista: PlanDocumentosVista };
export type RespuestaError = { error: string; message?: string };

/** Estado de un casillero. `hoy` = limaDateKey() (a las 20:00 de Pucallpa el UTC ya es mañana). */
export function estadoDeCasillero(archivos: readonly Pick<ArchivoDelPlan, "expiresAt">[], hoy: string, dias = DIAS_VENCE_PRONTO): EstadoCasillero {
  if (archivos.length === 0) return "falta";
  const fechas = archivos.map((a) => a.expiresAt?.slice(0, 10)).filter((f): f is string => Boolean(f)).sort();
  if (fechas.length === 0) return "cargado";
  const t = Date.parse(`${hoy}T00:00:00Z`);
  const limite = new Date(t + dias * 86_400_000).toISOString().slice(0, 10);
  if (fechas[0] < hoy) return "vencido";
  if (fechas[0] <= limite) return "vence_pronto";
  return "cargado";
}
