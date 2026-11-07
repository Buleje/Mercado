/**
 * Registry + helpers para especializaciones por tenant (ADR-124).
 *
 * Filosofía: las especializaciones son módulos verticales habilitables
 * desde superadmin. Usan TenantFeatureFlag con namespace `spec:`.
 *
 * Lectura:
 *   import { isSpecializationEnabled, SPECIALIZATIONS } from "@/lib/specializations";
 *   const enabled = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
 *
 * Toggle (solo superadmin):
 *   import { setSpecialization } from "@/lib/specializations";
 *   await setSpecialization(tenantId, "spec:forestal:ctp-libro", true, superadminId);
 */
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidate } from "@/lib/cache";

// ─── Registry: catálogo de especializaciones disponibles ──────────────────

export interface Specialization {
  /** Clave única — usar también como flagKey en TenantFeatureFlag. */
  key: SpecializationKey;
  /** Vertical de negocio (forestal, salud, textil, etc.). */
  vertical: string;
  /** Nombre humano corto. */
  name: string;
  /** Descripción para el toggle UI superadmin. */
  description: string;
  /** Módulo admin que se habilita (ModuleId en module-permissions). */
  moduleId: string;
  /** Si requiere otro spec previamente (ej. ctp-libro requiere forestal vertical). */
  requires?: SpecializationKey[];
  /** Industry recomendada para el tenant (no obligatoria). */
  recommendedIndustry?: string;
  /** Si está disponible o aún en desarrollo. */
  status: "available" | "beta" | "coming-soon";
}

export type SpecializationKey =
  | "spec:forestal:ctp-libro"
  | "spec:forestal:lotes"
  | "spec:forestal:loth-libro"
  | "spec:forestal:gtf-emisor"
  | "spec:forestal:herramientas"
  | "spec:forestal:tramites"
  | "spec:agricola:cacao-acopio"
  | "spec:salud:recetas-medicas"
  | "spec:textil:cuero";

export const SPECIALIZATIONS: Record<SpecializationKey, Specialization> = {
  "spec:forestal:ctp-libro": {
    key: "spec:forestal:ctp-libro",
    vertical: "forestal",
    name: "Libro de Operaciones CTP",
    description:
      "Registra ingresos de madera al Centro de Transformación Primaria. Compatible con LOE-CTP SERFOR (interno, no oficial).",
    moduleId: "ctp-libro-operaciones",
    recommendedIndustry: "madereria",
    status: "available",
  },
  "spec:forestal:tramites": {
    key: "spec:forestal:tramites",
    vertical: "forestal",
    name: "Trámites y Oficios (Forestal)",
    description:
      "Genera las solicitudes que el CTP presenta a la autoridad (visado de talonario de GTF, inspección de campo, actualización de datos, descargo ante supervisión, permiso CITES) con el membrete legal y los datos del Libro, y lleva el expediente de qué se presentó (ADR-308).",
    moduleId: "forestal-tramites",
    recommendedIndustry: "madereria",
    status: "available",
  },
  "spec:forestal:lotes": {
    key: "spec:forestal:lotes",
    vertical: "forestal",
    name: "Lotes de Producción",
    description:
      "Agrupa corridas de producción del CTP en lotes comerciales con código, grado de calidad, estado y cadena de custodia heredada. Certificado y QR verificable por lote. Requiere el Libro CTP.",
    moduleId: "forestal-lotes",
    requires: ["spec:forestal:ctp-libro"],
    recommendedIndustry: "madereria",
    status: "available",
  },
  "spec:forestal:loth-libro": {
    key: "spec:forestal:loth-libro",
    vertical: "forestal",
    name: "Libro de Operaciones de Títulos Habilitantes",
    description:
      "Libro del titular de la concesión/permiso en el bosque: tala, trozado, despacho, consumo, producto terminado y su despacho (6 secciones SERFOR, RDE 264-2019). Interno, no oficial.",
    moduleId: "loth-libro-operaciones",
    recommendedIndustry: "madereria",
    status: "available",
  },
  "spec:forestal:gtf-emisor": {
    key: "spec:forestal:gtf-emisor",
    vertical: "forestal",
    name: "Emisor de Guías de Transporte Forestal",
    description:
      "Emite GTF (Guías de Transporte Forestal) para movimientos de productos forestales. Requiere integración futura con SNIFFS.",
    moduleId: "gtf-emisor",
    requires: ["spec:forestal:ctp-libro"],
    recommendedIndustry: "madereria",
    status: "coming-soon",
  },
  "spec:forestal:herramientas": {
    key: "spec:forestal:herramientas",
    vertical: "forestal",
    name: "Herramientas Forestales",
    description:
      "Utilidades para el negocio forestal. Incluye el cubicador de madera aserrada por voz (pie tablar + m³) con conversiones. Extensible a más herramientas.",
    moduleId: "forestal-herramientas",
    recommendedIndustry: "madereria",
    status: "available",
  },
  "spec:agricola:cacao-acopio": {
    key: "spec:agricola:cacao-acopio",
    vertical: "agricola",
    name: "Acopio & Beneficio de Cacao",
    description:
      "Libro de acopio de cacao en grano: productores, lotes, calidad (prueba de corte NTP-ISO 1114 + humedad NTP-ISO 2291), grado por defectos (NTP-ISO 2451) y liquidación al productor. Alineado a NTP 208.040.",
    moduleId: "cacao-acopio",
    recommendedIndustry: "agricultura",
    status: "available",
  },
  "spec:salud:recetas-medicas": {
    key: "spec:salud:recetas-medicas",
    vertical: "salud",
    name: "Recetas Médicas",
    description:
      "Registro y validación de recetas médicas. Filtro de productos controlados (psicotrópicos, controlados SUNAT).",
    moduleId: "recetas-medicas",
    recommendedIndustry: "farmacia",
    status: "coming-soon",
  },
  "spec:textil:cuero": {
    key: "spec:textil:cuero",
    vertical: "textil",
    name: "Trazabilidad Cuero",
    description:
      "Registro de cueros, curtido, lotes. Compatible con estándares internacionales LWG.",
    moduleId: "cuero-trazabilidad",
    recommendedIndustry: "otro",
    status: "coming-soon",
  },
};

export function listSpecializations(): Specialization[] {
  return Object.values(SPECIALIZATIONS);
}

export function listSpecializationsByVertical(vertical: string): Specialization[] {
  return listSpecializations().filter((s) => s.vertical === vertical);
}

export function isValidSpecializationKey(key: string): key is SpecializationKey {
  return key in SPECIALIZATIONS;
}

// ─── DB ops ───────────────────────────────────────────────────────────────

/**
 * Las claves `spec:*` encendidas del negocio, cacheadas 60 s (16-10, carril
 * velocidad): las piden el sidebar en cada carga (`/api/admin/me/specializations`)
 * y decenas de rutas forestales vía {@link isSpecializationEnabled}; era una
 * ida a la base por pregunta (~120 ms desde la PC de Brandon). Los errores NO
 * se cachean (getOrSet sólo guarda lo que resolvió). La limpian
 * {@link setSpecialization} y `TenantFeatureFlagDB.set` vía
 * {@link olvidarEspecializaciones}.
 */
async function especializacionesEncendidas(tenantId: string): Promise<string[]> {
  // `{ v }`: getOrSet trata `null` como «no está»; una lista vacía sí se guarda.
  const caja = await getOrSet<{ v: string[] }>(claveEspecializaciones(tenantId), 60, async () => {
    const flags = await prisma.tenantFeatureFlag.findMany({
      where: {
        tenantId,
        enabled: true,
        flagKey: { startsWith: "spec:" },
      },
      select: { flagKey: true },
    });
    return { v: flags.map((f) => f.flagKey) };
  });
  return caja.v;
}

function claveEspecializaciones(tenantId: string): string {
  return `especializaciones:${tenantId}`;
}

/** Tras escribir un `TenantFeatureFlag` del negocio. */
export function olvidarEspecializaciones(tenantId: string): void {
  invalidate(claveEspecializaciones(tenantId));
}

/**
 * ¿Está habilitada esta especialización para el tenant?
 * Falla cerrado: ante cualquier error retorna `false` (no habilitar).
 */
export async function isSpecializationEnabled(
  tenantId: string,
  spec: SpecializationKey,
): Promise<boolean> {
  if (!isValidSpecializationKey(spec)) return false;
  try {
    return (await especializacionesEncendidas(tenantId)).includes(spec);
  } catch {
    return false;
  }
}

/**
 * Lista TODAS las especializaciones habilitadas para un tenant.
 * Útil para el sidebar admin (saber qué módulos extra mostrar).
 */
export async function listEnabledSpecializations(
  tenantId: string,
): Promise<SpecializationKey[]> {
  try {
    return (await especializacionesEncendidas(tenantId)).filter(isValidSpecializationKey);
  } catch {
    return [];
  }
}

/**
 * Habilita o deshabilita una especialización para un tenant.
 * SOLO debe llamarse desde rutas protegidas por superadmin auth.
 * Crea el TenantFeatureFlag si no existe (upsert).
 */
export async function setSpecialization(
  tenantId: string,
  spec: SpecializationKey,
  enabled: boolean,
  _actorId: string, // superadminId — se usa en audit log (TODO Fase 3)
): Promise<void> {
  if (!isValidSpecializationKey(spec)) {
    throw new Error(`Invalid specialization key: ${spec}`);
  }
  await prisma.tenantFeatureFlag.upsert({
    where: { tenantId_flagKey: { tenantId, flagKey: spec } },
    update: { enabled },
    create: { tenantId, flagKey: spec, enabled },
  });
  olvidarEspecializaciones(tenantId);
  // TODO Fase 3: registrar ActivityLog con actorId, action, before/after
}

/**
 * ModuleId derivado de SpecializationKey (helper para router admin).
 */
export function moduleIdForSpec(spec: SpecializationKey): string | null {
  return SPECIALIZATIONS[spec]?.moduleId ?? null;
}
