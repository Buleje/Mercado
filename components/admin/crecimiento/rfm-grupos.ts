/**
 * Los grupos de /api/analytics/rfm dichos en su idioma. Los nombres NO chocan
 * con los segmentos de Mis clientes (Frecuente, Ocasional, Nuevo, Perdido):
 * son otra regla, y dos «Perdidos» con cifras distintas se leían como un bug.
 * El color va por token (el endpoint manda hex y una acción en inglés:
 * «Upselling», «Onboarding»; acá no se usan).
 */
export type RFMCustomer = {
  phone: string;
  name: string;
  recencyDays: number;
  frequency: number;
  monetary: number;
  rScore: number;
  fScore: number;
  mScore: number;
  segment: string;
};

export type RFMSegment = {
  segment: string;
  count: number;
  avgMonetary: number;
  avgFrequency: number;
  color: string;
  action: string;
};

export interface GrupoRfm {
  rotulo: string;
  accion: string;
  /** Clase del punto de color (token, no el hex del endpoint). */
  punto: string;
}

export const GRUPO_RFM: Record<string, GrupoRfm> = {
  Champions: { rotulo: "Los mejores", accion: "Prémialos: un detalle, o que se enteren antes que nadie de lo nuevo.", punto: "bg-[var(--accent)]" },
  Loyal: { rotulo: "Fieles", accion: "Ofréceles algo más (un combo, una marca mejor) y pídeles que te recomienden.", punto: "bg-[var(--data-success-500)]" },
  New: { rotulo: "Recién llegados", accion: "Que la segunda compra sea fácil: un saludo y una oferta de bienvenida.", punto: "bg-[var(--data-info-500)]" },
  AtRisk: { rotulo: "En riesgo", accion: "Escríbeles ya: compraban seguido y dejaron de venir.", punto: "bg-[var(--data-warning-500)]" },
  Lost: { rotulo: "Dormidos", accion: "Un descuento fuerte para que vuelvan, o déjalos ir.", punto: "bg-[var(--data-error-500)]" },
  Regular: { rotulo: "Regulares", accion: "Anímalos a venir más seguido con una promo por frecuencia.", punto: "bg-[var(--text-tertiary)]" },
};

export const grupoRfm = (s: string): GrupoRfm =>
  GRUPO_RFM[s] ?? { rotulo: s, accion: "", punto: "bg-[var(--text-tertiary)]" };

export const PERIODOS_RFM = [
  { days: 30, label: "30 días" },
  { days: 90, label: "90 días" },
  { days: 180, label: "6 meses" },
  { days: 365, label: "1 año" },
] as const;
