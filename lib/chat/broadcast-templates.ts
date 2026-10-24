/**
 * lib/chat/broadcast-templates.ts
 *
 * Plantillas + interpolación de variables para el broadcast de la plataforma
 * (superadmin → tenants). Lógica PURA y testeable: el route renderiza el body
 * por-tenant antes de enviar, así `{{tienda}}` / `{{plan}}` / `{{dias_trial}}`
 * salen personalizados para cada negocio.
 *
 * Copy en tuteo peruano (Activa/Entra/"por ti"), nunca voseo.
 */

export interface BroadcastVar {
  key: string;
  label: string;
  sample: string;
}

/** Variables soportadas — se muestran como chips de ayuda en el composer. */
export const BROADCAST_VARS: BroadcastVar[] = [
  { key: "tienda", label: "Nombre del negocio", sample: "Bodega Don José" },
  { key: "plan", label: "Plan actual", sample: "Pro" },
  { key: "dias_trial", label: "Días de trial restantes", sample: "5" },
];

export interface BroadcastTemplate {
  id: string;
  label: string;
  subject: string;
  body: string;
}

/** Catálogo de plantillas predefinidas. */
export const BROADCAST_TEMPLATES: BroadcastTemplate[] = [
  {
    id: "trial_expiring",
    label: "Trial por vencer",
    subject: "Tu prueba termina pronto",
    body:
      "Hola {{tienda}} 👋 Tu prueba gratis termina en {{dias_trial}} días. " +
      "Activa tu plan {{plan}} para no perder tus datos ni tus ventas.",
  },
  {
    id: "welcome",
    label: "Bienvenida",
    subject: "Bienvenido a Buleje",
    body:
      "¡Bienvenido {{tienda}}! Ya puedes cargar tus productos y empezar a " +
      "vender. Cualquier duda, responde este mensaje y te ayudamos.",
  },
  {
    id: "payment_reminder",
    label: "Recordatorio de pago",
    subject: "Renueva tu plan",
    body:
      "Hola {{tienda}}, tu plan {{plan}} está por renovarse. Asegúrate de " +
      "tener tu método de pago al día para no cortar el servicio.",
  },
  {
    id: "new_feature",
    label: "Nueva función",
    subject: "Novedad en tu panel",
    body:
      "Hola {{tienda}} 🚀 Lanzamos una nueva función en tu panel. Entra y " +
      "pruébala — ya está incluida en tu plan {{plan}}.",
  },
];

const VAR_RE = /\{\{(\w+)\}\}/g;

export type BroadcastVarValues = Record<string, string | number | null | undefined>;

/**
 * Reemplaza `{{var}}` por su valor. Las variables sin valor (null/undefined/"")
 * se dejan literales `{{var}}` para que el operador vea qué no se completó.
 */
export function renderBroadcastBody(body: string, vars: BroadcastVarValues): string {
  return body.replace(VAR_RE, (literal, key: string) => {
    const v = vars[key];
    return v === null || v === undefined || v === "" ? literal : String(v);
  });
}

/** Lista las variables únicas usadas en un body (para validar/avisar). */
export function extractTemplateVars(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(VAR_RE)) found.add(m[1]);
  return [...found];
}

/** Construye los valores de variables para un tenant concreto. */
export function buildBroadcastVars(
  tenant: { name: string; plan: string; trialEndsAt: Date | string | null },
  now: number,
): BroadcastVarValues {
  let diasTrial: number | "" = "";
  if (tenant.trialEndsAt) {
    const end = new Date(tenant.trialEndsAt).getTime();
    diasTrial = Math.max(0, Math.ceil((end - now) / 86_400_000));
  }
  return {
    tienda: tenant.name,
    plan: tenant.plan,
    dias_trial: diasTrial,
  };
}
