/**
 * Lo que la lista de Postulantes (Reparto › Equipo) usa y no es su cuerpo: los
 * tipos de la solicitud y su KYC, leer el cuerpo de la solicitud, si el KYC
 * está completo y los bloques de datos. Sacado de `tabs/SolicitudesTab.tsx` el
 * 10-10 (mismo comportamiento).
 */
import type { ReactNode } from "react";
import { Check, X } from "@buleje/design-system/icons";

export function consentIcon(ok: boolean) {
  return ok
    ? <Check className="ml-auto h-4 w-4 text-[var(--data-success-500)]" aria-label="Sí" />
    : <X className="ml-auto h-4 w-4 text-[var(--data-error-500)]" aria-label="No" />;
}

export function KycSection({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-base)] px-3 py-2.5">
      <p className="text-sm font-bold text-[var(--text-secondary)] mb-1.5">
        {title}
      </p>
      <dl className="space-y-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 text-sm">
            <dt className="text-[var(--text-tertiary)]">{k}</dt>
            <dd className="font-bold text-[var(--text-primary)] truncate">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ─────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────


// ── Tipos/helpers movidos de DeliveryPartnersModule (refactor 2026-06-15) ──
export interface DriverKycSummary {
  schemaVersion: 1;
  applicationStatus: "pendiente" | "aprobada" | "rechazada";
  availability: string;
  kyc: {
    dni: string;
    birthDate: string;
    license: { number: string | null; category: string | null; expiresAt: string | null } | null;
    vehicle: { plate: string | null; soatNumber: string | null; soatExpiresAt: string | null } | null;
  };
  consents: {
    acceptedTerms: boolean;
    acceptedPrivacy: boolean;
    confirmAdult: boolean;
    acceptedAt: string;
    termsVersion: string;
    privacyVersion: string;
  };
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
}

export interface DriverApplication {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  partner: { id: string; isActive: boolean; vehicleType: string; zone: string } | null;
  kyc: DriverKycSummary | null;
}

export function parseApplicationBody(body: string) {
  // Soporta dos formatos:
  //   v1 legacy:   "Name (Phone) - Zona: zone - Vehículo: type - Horario: avail"
  //   v2 KYC:      "Name · DNI 12345678 | Tel 999333222 | ... | Horario: full"
  const v1 = body.match(
    /^(.+?)\s*\((.+?)\)\s*-\s*Zona:\s*(.+?)\s*-\s*Vehículo:\s*(.+?)\s*-\s*Horario:\s*(.+)$/,
  );
  if (v1) {
    return {
      name: v1[1].trim(),
      phone: v1[2].trim(),
      zone: v1[3].trim(),
      vehicle: v1[4].trim(),
      availability: v1[5].trim(),
      dni: "",
    };
  }
  // v2: extraer por tokens.
  const nameMatch = body.match(/^([^·|]+)/);
  const phoneMatch = body.match(/Tel\s+(\d{6,15})/i);
  const dniMatch = body.match(/DNI\s+(\d{8})/i);
  const vehicleMatch = body.match(/Vehículo:\s*([^·|]+)/i);
  const availMatch = body.match(/Horario:\s*([^·|]+)/i);
  return {
    name: nameMatch?.[1]?.trim() ?? body,
    phone: phoneMatch?.[1] ?? "",
    zone: "",
    vehicle: vehicleMatch?.[1]?.trim()?.split(/\s+/)?.[0] ?? "",
    availability: availMatch?.[1]?.trim() ?? "",
    dni: dniMatch?.[1] ?? "",
  };
}

/** Verifica que el KYC esté completo según el tipo de vehículo (gate de aprobación). */
export function isKycComplete(kyc: DriverKycSummary | null, vehicleType: string): { ok: boolean; missing: string[] } {
  if (!kyc) return { ok: false, missing: ["KYC no enviado (formulario antiguo)"] };
  const missing: string[] = [];
  if (!/^\d{8}$/.test(kyc.kyc.dni)) missing.push("DNI inválido");
  if (!kyc.kyc.birthDate) missing.push("Fecha de nacimiento");
  if (!kyc.consents.acceptedTerms) missing.push("Términos no aceptados");
  if (!kyc.consents.acceptedPrivacy) missing.push("Privacidad no aceptada");
  if (!kyc.consents.confirmAdult) missing.push("Edad no confirmada");
  // FIX 2026-05-06: case-insensitive — VEHICLE_TYPES en UI usa "Moto"/"Auto"
  // (capital), antes la comparación lowercase saltaba la validación de
  // licencia/SOAT silenciosamente — riesgo legal/operacional crítico.
  const vt = (vehicleType ?? "").toLowerCase();
  const isMotor = vt === "moto" || vt === "auto";
  if (isMotor) {
    if (!kyc.kyc.license?.number) missing.push("Licencia");
    if (!kyc.kyc.license?.category) missing.push("Categoría licencia");
    if (!kyc.kyc.license?.expiresAt || new Date(kyc.kyc.license.expiresAt) < new Date()) {
      missing.push("Licencia vigente");
    }
    if (!kyc.kyc.vehicle?.plate) missing.push("Placa");
    if (!kyc.kyc.vehicle?.soatNumber) missing.push("SOAT");
    if (!kyc.kyc.vehicle?.soatExpiresAt || new Date(kyc.kyc.vehicle.soatExpiresAt) < new Date()) {
      missing.push("SOAT vigente");
    }
  }
  return { ok: missing.length === 0, missing };
}

export const AVAILABILITY_LABELS: Record<string, string> = {
  manana: "Mañana",
  tarde: "Tarde",
  noche: "Noche",
  full: "Todo el día",
  fines: "Fines de semana",
};

export const VEHICLE_LABELS: Record<string, string> = {
  moto: "Moto",
  bicicleta: "Bicicleta",
  auto: "Auto",
  a_pie: "A pie",
};
