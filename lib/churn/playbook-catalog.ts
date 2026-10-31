/**
 * Catálogo de las reglas de retención (ChurnPlaybook): qué señales existen, qué
 * umbrales y qué canales, con su nombre en castellano. Sin `server-only`: lo leen
 * la pantalla de reglas (cliente), el endpoint (Zod) y el motor (plantillas).
 *
 * Una sola fuente: si se agrega una plantilla aquí y no en `intervention-engine`,
 * el motor manda el mensaje genérico (no rompe).
 */

export const SENALES = [
  "login_drop",
  "order_drop",
  "trial_expiring",
  "support_unresolved",
  "plan_downgrade_intent",
] as const;
export type Senal = (typeof SENALES)[number];

export const SEVERIDADES = ["low", "medium", "high", "critical"] as const;
export type Severidad = (typeof SEVERIDADES)[number];

export const ACCIONES = ["email", "whatsapp", "discount", "call"] as const;
export type Accion = (typeof ACCIONES)[number];

export const SENAL_LABEL: Record<Senal, string> = {
  login_drop: "Dejó de entrar al panel",
  order_drop: "Cayeron sus pedidos",
  trial_expiring: "Su prueba gratis vence",
  support_unresolved: "Soporte sin resolver",
  plan_downgrade_intent: "Quiere bajar de plan",
};

export const SEVERIDAD_LABEL: Record<Severidad, string> = {
  low: "Bajo",
  medium: "Atención",
  high: "Alto",
  critical: "Crítico",
};

export const ACCION_LABEL: Record<Accion, string> = {
  email: "Correo",
  whatsapp: "WhatsApp",
  discount: "Descuento",
  call: "Llamada del equipo",
};

/** Plantillas que el motor sabe armar, por canal. */
export const PLANTILLAS: Record<Accion, { id: string; label: string }[]> = {
  email: [
    { id: "trial_expiring_cta", label: "Tu prueba termina pronto" },
    { id: "order_drop_tips", label: "Consejos para reactivar ventas" },
  ],
  whatsapp: [{ id: "login_drop_wa", label: "Te extrañamos en el panel" }],
  discount: [],
  call: [],
};

export const ORDEN_SEVERIDAD: Record<Severidad, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function etiquetaPlantilla(accion: string, plantilla: string | null): string | null {
  if (!plantilla) return null;
  const lista = PLANTILLAS[accion as Accion] ?? [];
  return lista.find((p) => p.id === plantilla)?.label ?? plantilla;
}
