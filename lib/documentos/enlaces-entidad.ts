/**
 * Cableado único documento↔entidad del Archivo: el Archivo es el cajón central
 * hiperenlazado con Adelantos/Terceros, GTF por permiso, Equipo (pagos) y
 * Trámites. Cada documento se ata a su entidad con un TAG de máquina
 * (`<tipo>:<id>`) y vive en una CARPETA legible por tipo — el MISMO patrón que
 * ya usan asistencia (`lib/rrhh/asistencia-fotos.ts`), el plan forestal y las
 * guías (`lib/forestal/documentos-guia.ts`). Sin schema nuevo: `Document.tags`
 * y `folderId` ya existen e indexados.
 *
 * Puro y sin `server-only`: lo importan el cliente (filtrar/adjuntar en el
 * panel «Documentos de esta entidad») y el servidor (archivar un PDF).
 */

import { tagColaborador } from "@/lib/rrhh/asistencia-fotos";
import { ROL_CANDADO_DUENO } from "@/lib/documents/doc-access";

/**
 * `tramite` = trámites del CTP (cartas a la autoridad, KV `ctp-tramites:`).
 * `tramite_adm` / `alquiler` (ADR-524) = trámites de Administración (banco,
 * SUNAT, municipalidad…) y alquileres de locales: otro modelo, otro prefijo.
 */
export type TipoEntidad = "tercero" | "permiso" | "colaborador" | "tramite" | "tramite_adm" | "alquiler";

/** Prefijo del tag de máquina por tipo. */
export const PREFIJO_ENTIDAD: Record<TipoEntidad, string> = {
  tercero: "tercero:",
  permiso: "permiso:",
  colaborador: "colaborador:",
  tramite: "tramite:",
  tramite_adm: "tramiteadm:",
  alquiler: "alquiler:",
};

/**
 * El tag de máquina que ata un documento a su entidad: `tercero:<id>`.
 * Para `colaborador` reusa `tagColaborador` de asistencia — misma identidad,
 * no se parte en dos (si no, las fotos de asistencia y los pagos no se cruzan).
 */
export function tagEntidad(tipo: TipoEntidad, id: string): string {
  if (tipo === "colaborador") return tagColaborador(id.trim());
  return `${PREFIJO_ENTIDAD[tipo]}${id.trim()}`;
}

/** ¿Este tag ata un documento a alguna entidad? */
export function esTagDeEntidad(tag: string): boolean {
  return Object.values(PREFIJO_ENTIDAD).some((p) => tag.startsWith(p));
}

/**
 * Carpeta raíz legible por tipo (segmentos, como `CARPETA_ASISTENCIA`).
 * `permiso` cuelga de la carpeta de guías que ya existe («Guías forestales
 * (GTF)» = `CARPETA_GUIAS` en `documentos-guia.ts`; se repite el literal para
 * no importar ese módulo —server— en uno que también corre en el cliente).
 */
export const CARPETA_ENTIDAD: Record<TipoEntidad, readonly string[]> = {
  tercero: ["Terceros"],
  permiso: ["Guías forestales (GTF)", "Por permiso"],
  colaborador: ["Equipo", "Pagos"],
  tramite: ["Trámites"],
  // ADR-524: la misma raíz que los del CTP (en el Drive son «trámites» para Brandon).
  tramite_adm: ["Trámites"],
  alquiler: ["Alquileres"],
};

/** Limpia un nombre para usarlo como segmento de carpeta (sin `/`, recortado). */
export function segmentoCarpeta(nombre: string): string {
  const limpio = nombre
    .replace(/[\\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return limpio || "Sin nombre";
}

/**
 * Ruta de carpeta de UNA entidad, para `createFolderTree`:
 * `["Terceros", "ACME SAC"]`, o con período `["Equipo","Pagos","ACME","2026-W42"]`.
 */
export function rutaCarpetaEntidad(tipo: TipoEntidad, nombre: string, periodo?: string): string[] {
  const base = [...CARPETA_ENTIDAD[tipo], segmentoCarpeta(nombre)];
  return periodo ? [...base, segmentoCarpeta(periodo)] : base;
}

/**
 * Roles que ven los papeles SENSIBLES de una entidad (pagos del equipo, estado
 * de cuenta de un tercero). En el documento, no sólo en la ruta (igual que
 * `ROLES_PAPELES_GUIA`): en el Drive general el cajero no debe verlos.
 */
export const ROLES_ENTIDAD_SENSIBLE = ["admin", "owner"] as const;

/**
 * Candado de los papeles de fichas de persona, trámites y alquileres (ADR-524):
 * dueño y administrador, más el candado que deja afuera al manager (al que
 * `requireAdmin` deja pasar siempre). Lo pone el servidor al subir con vínculo,
 * al subir a una carpeta sensible y al ENLAZAR un documento que no tenía roles.
 */
export const ROLES_PAPEL_SENSIBLE: readonly string[] = [...ROLES_ENTIDAD_SENSIBLE, ROL_CANDADO_DUENO];

/** Carpetas raíz cuyo contenido nace con candado aunque no venga vínculo (sin tildes, en minúscula). */
export const RAICES_SENSIBLES = ["tramites", "alquileres", "socios y familia"] as const;

const normalizarRaiz = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * ¿La ruta («Trámites/Agrobanco 2026-10») cuelga de una carpeta sensible? La raíz
 * tiene que ser EXACTAMENTE una de ellas (sin mirar tildes ni mayúsculas): main
 * tiene «Trámites y Oficios (CTP)», papeles de la madera que abre el almacenero.
 */
export function rutaSensible(ruta: string | null | undefined): boolean {
  const raiz = (ruta ?? "").split(/[\\/]+/).map((x) => x.trim()).find(Boolean);
  if (!raiz) return false;
  const r = normalizarRaiz(raiz);
  return RAICES_SENSIBLES.some((s) => r === s);
}

/** Etiqueta humana por tipo, para encontrar el documento buscando por texto. */
export const ETIQUETA_HUMANA: Record<TipoEntidad, string> = {
  tercero: "tercero",
  permiso: "permiso",
  colaborador: "pago",
  tramite: "trámite",
  tramite_adm: "trámite",
  alquiler: "alquiler",
};

/**
 * Las etiquetas de un documento de entidad: humanas (para buscarlo) + la de
 * máquina (para atarlo). `extra` agrega términos buscables (el período, el N°).
 */
export function etiquetasDeEntidad(tipo: TipoEntidad, id: string, nombre: string, extra: string[] = []): string[] {
  return [ETIQUETA_HUMANA[tipo], segmentoCarpeta(nombre).toLowerCase(), ...extra, tagEntidad(tipo, id)];
}
