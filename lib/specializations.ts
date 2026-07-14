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
  | "spec:forestal:loth-libro"
  | "spec:forestal:gtf-emisor"
  | "spec:forestal:herramientas"
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
 * ¿Está habilitada esta especialización para el tenant?
 * Falla cerrado: ante cualquier error retorna `false` (no habilitar).
 */
export async function isSpecializationEnabled(
  tenantId: string,
  spec: SpecializationKey,
): Promise<boolean> {
  if (!isValidSpecializationKey(spec)) return false;
  try {
    const flag = await prisma.tenantFeatureFlag.findUnique({
      where: { tenantId_flagKey: { tenantId, flagKey: spec } },
      select: { enabled: true },
    });
    return flag?.enabled === true;
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
    const flags = await prisma.tenantFeatureFlag.findMany({
      where: {
        tenantId,
        enabled: true,
        flagKey: { startsWith: "spec:" },
      },
      select: { flagKey: true },
    });
    return flags
      .map((f) => f.flagKey)
      .filter(isValidSpecializationKey);
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
  // TODO Fase 3: registrar ActivityLog con actorId, action, before/after
}

/**
 * ModuleId derivado de SpecializationKey (helper para router admin).
 */
export function moduleIdForSpec(spec: SpecializationKey): string | null {
  return SPECIALIZATIONS[spec]?.moduleId ?? null;
}
