/**
 * Cómo se dicen los datos de persona de la ficha del Directorio (ADR-524):
 * estado y condición del RUC, estado civil, y cuándo se muestran los datos
 * personales (socios, dueños de local o cualquiera con DNI).
 */
import type { EstadoCivil, EstadoRuc } from "@/lib/admin/fichas-tramites-alquileres";

export const ESTADO_RUC_UI: Record<EstadoRuc, string> = {
  activo: "Activo",
  baja_oficio: "Baja de oficio",
  baja_definitiva: "Baja definitiva",
  baja_provisional: "Baja provisional",
  suspension_temporal: "Suspensión temporal",
  otro: "Otro",
};

/** La condición de domicilio que dice SUNAT. */
export const CONDICIONES_RUC = ["Habido", "No habido", "No hallado"] as const;

export const ESTADO_CIVIL_UI: Record<EstadoCivil, string> = {
  soltero: "Soltero(a)",
  casado: "Casado(a)",
  conviviente: "Conviviente",
  divorciado: "Divorciado(a)",
  viudo: "Viudo(a)",
  separado: "Separado(a)",
};

/**
 * Los papeles de persona (no de la madera). Literales y no `ROLES_PERSONALES`
 * para que esto compile aunque el directorio todavía no los tenga.
 */
const PAPELES_DE_PERSONA: readonly string[] = ["socio", "arrendador"];

/** Nacimiento, estado civil y parentesco: sólo para socios, dueños de local o fichas con DNI. */
export function muestraDatosPersonales(roles: readonly string[], docTipo: string | null | undefined): boolean {
  return docTipo === "DNI" || roles.some((r) => PAPELES_DE_PERSONA.includes(r));
}
