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
/** `papel:` = qué papel del permiso es (lista «Papeles», `loth-plan-papeles.ts`). */
export const PREFIJOS_TAG_MAQUINA_PLAN = ["plan:", "plan-carpeta:", "campo:", "papel:"] as const;
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
  /** Qué papel del permiso es (etiqueta `papel:<clave>`), o null. Opcional: lo agregó «Papeles». */
  papel?: string | null;
}

/**
 * Un archivo que el rol que mira NO puede abrir (roles o candado del
 * documento o de su carpeta): cuenta para el estado del casillero y para los
 * Papeles, pero viaja sin nombre ni id (security 25-10: el almacenero veía el
 * nombre de un papel con candado de dueño).
 */
export interface ArchivoConCandado {
  campoId: string | null;
  papel?: string | null;
  expiresAt: string | null;
  uploadedAt: string;
}

/**
 * Cómo cuenta un casillero en «lo que falta» según el TIPO de plan (ADR-517):
 * · `obligatorio` — es el de un papel que la norma pide siempre; su estado es
 *   el del papel (la cuenta de las carpetas es la de los papeles);
 * · `si_aplica` — papel que se pide según el caso (poder, regente…): no falta;
 * · `no_aplica` — casillero de la plantilla sugerida que este tipo no pide (el
 *   título de propiedad en un PO): no cuenta;
 * · `propio` — lo agregó el negocio: cuenta como siempre.
 */
export type CuentaCasillero = "obligatorio" | "si_aplica" | "no_aplica" | "propio";

/** Sin `cuenta` (vista anterior a ADR-517) cuenta como antes: todos. */
export const cuentaEnLoQueFalta = (cuenta: CuentaCasillero | undefined): boolean =>
  cuenta === undefined || cuenta === "obligatorio" || cuenta === "propio";

export interface CasilleroArchivo {
  campo: Omit<CampoPersonalizado, "tipo"> & { tipo: typeof TIPO_ARCHIVO }; // no depende de ampliar TipoCampo
  estado: EstadoCasillero;
  archivos: ArchivoDelPlan[];
  /** Los que el rol no ve (sólo viene si hay alguno). */
  conCandado?: ArchivoConCandado[];
  /** El vencimiento más próximo entre sus archivos (ISO) o null. */
  venceEl: string | null;
  /** Qué papel del permiso representa (`loth-plan-papeles`), o null. Opcional: ADR-517. */
  papel?: string | null;
  /** Cómo cuenta según el tipo de plan. Opcional: ADR-517. */
  cuenta?: CuentaCasillero;
  /**
   * Lo pide la norma y la plantilla no lo tiene (el contrato de concesión de
   * un PO): no existe en la base, `campo.id` = "" y lo que se sube ahí queda
   * con la etiqueta `papel:` en su carpeta. Opcional: ADR-517.
   */
  porNorma?: boolean;
}

export interface CarpetaDelPlan {
  clave: string;
  /** Nombre que se ve en el Drive (manda el Drive; la plantilla sólo siembra). */
  nombre: string;
  /**
   * Sólo cuando la pestaña muestra otro nombre por el tipo de plan (ADR-517:
   * «Contrato de concesión» en un PO): el que tiene en el Drive/Documentos.
   */
  nombreEnDocumentos?: string;
  /** null = todavía no se creó en el Drive (plan sin preparar o carpeta nueva de la plantilla). */
  folderId: string | null;
  /** Fila `tipo:"carpeta"` de la plantilla; null = carpeta hecha a mano en el Drive (sin adoptar). */
  plantillaId: string | null;
  soloEstePlan: boolean;
  orden: number;
  casilleros: CasilleroArchivo[];
  sueltos: ArchivoDelPlan[];
  /** Sueltos que el rol no ve (sólo viene si hay alguno). */
  sueltosConCandado?: ArchivoConCandado[];
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
