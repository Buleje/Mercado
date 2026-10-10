/**
 * lib/marketplace/application-score.ts
 *
 * Score PURO (sin DB, sin I/O) de completitud + riesgo de una solicitud de
 * vendor del marketplace. Prioriza la cola de revisión del superadmin: las
 * solicitudes "listas" (docs completos, datos válidos) se aprueban rápido; las
 * de riesgo o incompletas se marcan para revisar/pedir info.
 *
 * No reemplaza el criterio humano — es una ayuda de triage. El superadmin
 * sigue decidiendo en el route de review.
 */

export interface ApplicationScoreInput {
  ruc: string;
  contactName: string;
  contactDni: string;
  contactPhone: string;
  contactEmail: string;
  rucDocumentUrl: string | null;
  storefrontPhotoUrl: string | null;
  termsAcceptedAt: Date | string | null;
  schedule: unknown;
  deliveryZones: unknown;
}

export type ApplicationTier = "listo" | "revisar" | "incompleto";

export interface ScoreCheck {
  key: string;
  label: string;
  ok: boolean;
  points: number;
}

export interface ApplicationScore {
  /** 0-100. */
  score: number;
  tier: ApplicationTier;
  checks: ScoreCheck[];
  /** Señales que exigen ojo humano (formato inválido, falta verificación). */
  riskFlags: string[];
}

// ── Validadores Perú ───────────────────────────────────────────────────────
const RUC_RE = /^(10|15|16|17|20)\d{9}$/;
const DNI_RE = /^\d{8}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function digits(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}
export function isValidRuc(ruc: string): boolean {
  return RUC_RE.test(digits(ruc));
}
function isValidDni(dni: string): boolean {
  return DNI_RE.test(digits(dni));
}
function isValidEmail(email: string): boolean {
  return EMAIL_RE.test((email ?? "").trim());
}
function isValidPhone(phone: string): boolean {
  // Celular PE: 9 dígitos, empieza en 9.
  return /^9\d{8}$/.test(digits(phone));
}
function isNonEmpty(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === "object") return Object.keys(v as object).length > 0;
  return false;
}

/** Calcula score + tier + flags de una solicitud de vendor. */
export function scoreApplication(input: ApplicationScoreInput): ApplicationScore {
  const hasRucDoc = !!input.rucDocumentUrl;
  const hasStorefront = !!input.storefrontPhotoUrl;
  const hasTerms = !!input.termsAcceptedAt;
  const rucOk = isValidRuc(input.ruc);
  const contactOk =
    !!input.contactName?.trim() &&
    isValidDni(input.contactDni) &&
    isValidPhone(input.contactPhone) &&
    isValidEmail(input.contactEmail);
  const scheduleOk = isNonEmpty(input.schedule);
  const deliveryOk = isNonEmpty(input.deliveryZones);

  const checks: ScoreCheck[] = [
    { key: "ruc_doc", label: "Documento RUC", ok: hasRucDoc, points: 25 },
    { key: "storefront", label: "Foto del local", ok: hasStorefront, points: 20 },
    { key: "contact", label: "Contacto válido", ok: contactOk, points: 15 },
    { key: "ruc_format", label: "RUC con formato válido", ok: rucOk, points: 10 },
    { key: "terms", label: "Términos aceptados", ok: hasTerms, points: 10 },
    { key: "schedule", label: "Horario definido", ok: scheduleOk, points: 10 },
    { key: "delivery", label: "Zonas de reparto", ok: deliveryOk, points: 10 },
  ];

  const score = checks.reduce((acc, c) => acc + (c.ok ? c.points : 0), 0);

  const riskFlags: string[] = [];
  if (!rucOk) riskFlags.push("RUC con formato inválido");
  if (!isValidDni(input.contactDni)) riskFlags.push("DNI con formato inválido");
  if (!isValidEmail(input.contactEmail)) riskFlags.push("Email inválido");
  if (!isValidPhone(input.contactPhone)) riskFlags.push("Teléfono inválido");
  if (!hasRucDoc) riskFlags.push("Sin documento RUC");
  if (!hasStorefront) riskFlags.push("Sin foto del local");

  // Tier: sin verificación visual (doc RUC + foto) nunca es "listo".
  let tier: ApplicationTier;
  if (!hasRucDoc || !hasStorefront) {
    tier = "incompleto";
  } else if (score >= 80 && riskFlags.length === 0) {
    tier = "listo";
  } else if (score >= 55) {
    tier = "revisar";
  } else {
    tier = "incompleto";
  }

  return { score, tier, checks, riskFlags };
}
