/**
 * Schema legal para inscripción de repartidor (Buleje · Pucallpa).
 *
 * Cumplimiento:
 *   - Ley 29733 (datos personales) — consentimientos explícitos.
 *   - Ley 27261 / Código del Niño y Adolescente — edad mínima 18.
 *   - DS 017-2009-MTC — licencia de conducir vigente para moto/auto.
 *   - SOAT vehicular obligatorio para vehículos motorizados.
 *
 * Diseño: schema único compartido entre el form (client) y la API.
 */
import { z } from "zod";

// ── Helpers ──────────────────────────────────────────────────────────

/** Calcula la edad cumplida en años a la fecha de hoy. */
function ageInYears(birthIso: string): number {
  const birth = new Date(birthIso);
  if (Number.isNaN(birth.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

const DNI_REGEX = /^\d{8}$/;
const PLATE_REGEX = /^[A-Z0-9-]{5,10}$/i;
const LICENSE_REGEX = /^[A-Z]?\d{6,10}$/i;
const SOAT_REGEX = /^[A-Z0-9-]{4,30}$/i;

// ── Subschemas ────────────────────────────────────────────────────────

export const VehicleType = z.enum(["moto", "bicicleta", "auto", "a_pie"]);
export type VehicleTypeT = z.infer<typeof VehicleType>;

export const Availability = z.enum(["manana", "tarde", "noche", "full", "fines"]);

/** Categorías de licencia válidas en Perú (DS 017-2009-MTC). */
export const LicenseCategory = z.enum([
  "A-I",   // moto < 250cc
  "A-IIa", // moto 250-500cc
  "A-IIb", // moto > 500cc
  "B-IIa", // auto particular
  "B-IIb", // auto profesional
  "B-IIc", // taxi
]);

/**
 * Vehículos motorizados que requieren licencia + placa + SOAT.
 */
export const MOTORIZED: VehicleTypeT[] = ["moto", "auto"];

// ── Schema principal ──────────────────────────────────────────────────

export const DriverApplySchema = z
  .object({
    // ── Datos personales ─────────────────────────
    name: z
      .string()
      .trim()
      .min(2, "Nombre demasiado corto")
      .max(100, "Nombre demasiado largo")
      .regex(/^[A-Za-zÁÉÍÓÚáéíóúñÑ\s]+$/, "Solo letras y espacios"),
    dni: z
      .string()
      .regex(DNI_REGEX, "DNI debe tener 8 dígitos"),
    birthDate: z
      .string()
      .min(10, "Fecha requerida"),
    phone: z
      .string()
      .min(6)
      .max(20)
      .regex(/^[\d\s+()-]+$/, "Formato de teléfono inválido"),
    email: z.string().email("Email inválido").optional().or(z.literal("")),

    // ── Operación ────────────────────────────────
    zone: z.string().min(1).max(80, "Demasiado largo (máx 80)"),
    vehicleType: VehicleType,
    availability: Availability,

    // ── KYC vehicular (requerido si motorizado) ──
    licenseNumber: z.string().trim().optional().or(z.literal("")),
    licenseCategory: LicenseCategory.optional(),
    licenseExpiresAt: z.string().optional().or(z.literal("")),
    vehiclePlate: z.string().trim().optional().or(z.literal("")),
    soatNumber: z.string().trim().optional().or(z.literal("")),
    soatExpiresAt: z.string().optional().or(z.literal("")),

    // ── Consentimientos legales (obligatorios) ───
    acceptedTerms: z.literal(true, {
      message: "Debes aceptar los términos y condiciones",
    }),
    acceptedPrivacy: z.literal(true, {
      message: "Debes aceptar el tratamiento de datos (Ley 29733)",
    }),
    confirmAdult: z.literal(true, {
      message: "Debes confirmar que tienes 18 años o más",
    }),
  })
  // ── Reglas cruzadas ─────────────────────────────────────────────
  .refine((d) => ageInYears(d.birthDate) >= 18, {
    message: "Debes tener al menos 18 años",
    path: ["birthDate"],
  })
  .refine((d) => ageInYears(d.birthDate) < 80, {
    message: "Verifica la fecha de nacimiento",
    path: ["birthDate"],
  })
  .refine(
    (d) => !MOTORIZED.includes(d.vehicleType) || (d.licenseNumber && LICENSE_REGEX.test(d.licenseNumber)),
    { message: "Licencia inválida (solo letras y números, 6-10 caracteres)", path: ["licenseNumber"] },
  )
  .refine(
    (d) => !MOTORIZED.includes(d.vehicleType) || !!d.licenseCategory,
    { message: "Selecciona la categoría de tu licencia", path: ["licenseCategory"] },
  )
  .refine(
    (d) =>
      !MOTORIZED.includes(d.vehicleType) ||
      (d.licenseExpiresAt && new Date(d.licenseExpiresAt) > new Date()),
    { message: "Licencia vencida o fecha inválida", path: ["licenseExpiresAt"] },
  )
  .refine(
    (d) => !MOTORIZED.includes(d.vehicleType) || (d.vehiclePlate && PLATE_REGEX.test(d.vehiclePlate)),
    { message: "Placa inválida (ej: A1B-234)", path: ["vehiclePlate"] },
  )
  .refine(
    (d) => !MOTORIZED.includes(d.vehicleType) || (d.soatNumber && SOAT_REGEX.test(d.soatNumber)),
    { message: "Número de SOAT inválido", path: ["soatNumber"] },
  )
  .refine(
    (d) =>
      !MOTORIZED.includes(d.vehicleType) ||
      (d.soatExpiresAt && new Date(d.soatExpiresAt) > new Date()),
    { message: "SOAT vencido o fecha inválida", path: ["soatExpiresAt"] },
  )
  // Categoría de licencia consistente con el vehículo
  .refine(
    (d) =>
      d.vehicleType !== "moto" ||
      !d.licenseCategory ||
      d.licenseCategory.startsWith("A-"),
    { message: "Para moto necesitas licencia categoría A", path: ["licenseCategory"] },
  )
  .refine(
    (d) =>
      d.vehicleType !== "auto" ||
      !d.licenseCategory ||
      d.licenseCategory.startsWith("B-"),
    { message: "Para auto necesitas licencia categoría B", path: ["licenseCategory"] },
  );

export type DriverApplyInput = z.infer<typeof DriverApplySchema>;

// ── Persistencia: KYC estructurado guardado en `DeliveryPartner.notes` ──

export interface DriverKycPayload {
  schemaVersion: 1;
  applicationStatus: "pendiente" | "aprobada" | "rechazada";
  availability: string;
  kyc: {
    dni: string;
    birthDate: string;
    license: {
      number: string | null;
      category: string | null;
      expiresAt: string | null;
    } | null;
    vehicle: {
      plate: string | null;
      soatNumber: string | null;
      soatExpiresAt: string | null;
    } | null;
  };
  consents: {
    acceptedTerms: boolean;
    acceptedPrivacy: boolean;
    confirmAdult: boolean;
    /** ISO timestamp de cuándo se aceptaron */
    acceptedAt: string;
    /** Versión de los T&C aceptados — bumpear cuando cambien */
    termsVersion: string;
    privacyVersion: string;
  };
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
}

export const TERMS_VERSION = "2026-04-30.v1";
export const PRIVACY_VERSION = "2026-04-30.v1";

/** Construye el payload JSON para `DeliveryPartner.notes`. */
export function buildKycNotes(input: DriverApplyInput): DriverKycPayload {
  const isMotor = MOTORIZED.includes(input.vehicleType);
  return {
    schemaVersion: 1,
    applicationStatus: "pendiente",
    availability: input.availability,
    kyc: {
      dni: input.dni,
      birthDate: input.birthDate,
      license: isMotor
        ? {
            number: input.licenseNumber || null,
            category: input.licenseCategory ?? null,
            expiresAt: input.licenseExpiresAt || null,
          }
        : null,
      vehicle: isMotor
        ? {
            plate: input.vehiclePlate || null,
            soatNumber: input.soatNumber || null,
            soatExpiresAt: input.soatExpiresAt || null,
          }
        : null,
    },
    consents: {
      acceptedTerms: input.acceptedTerms,
      acceptedPrivacy: input.acceptedPrivacy,
      confirmAdult: input.confirmAdult,
      acceptedAt: new Date().toISOString(),
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
    },
  };
}

/** Parser tolerante: si `notes` no es JSON o falta, devuelve null. */
export function parseKycNotes(notes: string | null | undefined): DriverKycPayload | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    if (typeof parsed === "object" && parsed && parsed.schemaVersion === 1) {
      return parsed as DriverKycPayload;
    }
    return null;
  } catch {
    return null;
  }
}
