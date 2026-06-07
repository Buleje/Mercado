/**
 * lib/platform-config.ts — esquema de claves del PlatformSettings
 * para la configuración global editable desde /superadmin/configuracion.
 *
 * Brandon mayo 2026: todo lo que antes vivía en env vars (Yape number,
 * Plin number, brand colors, etc) ahora se edita desde el panel del
 * superadmin sin redeploy. Una sola fuente de verdad consultable
 * desde landing, registro, panel admin y storefront.
 *
 * Claves agrupadas por sección. Cada clave guarda un único valor JSON
 * primitivo (string/number/null). Para datos compuestos preferimos
 * varias claves planas — más fácil de auditar quién cambió qué.
 */

export interface PlatformConfig {
  // ── Pagos manuales ────────────────────────────────────────────
  payment: {
    yapeNumber: string | null;
    yapeHolder: string | null;
    yapeQrUrl: string | null;
    plinNumber: string | null;
    plinHolder: string | null;
    plinQrUrl: string | null;
    bankName: string | null;
    bankAccount: string | null;
    bankAccountCCI: string | null;
    bankHolder: string | null;
  };
  // ── Marca ──────────────────────────────────────────────────────
  brand: {
    name: string;
    tagline: string | null;
    logoUrl: string | null;
    faviconUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
  };
  // ── Contacto / Soporte ────────────────────────────────────────
  support: {
    whatsappNumber: string | null;
    supportEmail: string | null;
    supportPhone: string | null;
    addressLine: string | null;
    city: string | null;
  };
  // ── SEO defaults ──────────────────────────────────────────────
  seo: {
    metaDescription: string | null;
    ogImageUrl: string | null;
  };
}

/** Defaults — cualquier clave sin valor en DB usa esto. */
export const PLATFORM_CONFIG_DEFAULTS: PlatformConfig = {
  payment: {
    yapeNumber: null,
    yapeHolder: null,
    yapeQrUrl: null,
    plinNumber: null,
    plinHolder: null,
    plinQrUrl: null,
    bankName: null,
    bankAccount: null,
    bankAccountCCI: null,
    bankHolder: null,
  },
  brand: {
    name: "Buleje",
    tagline: null,
    logoUrl: "/brand/buleje-logo.png",
    faviconUrl: "/brand/buleje-favicon.png",
    primaryColor: "#00A0A0",
    secondaryColor: "#f4a261",
  },
  support: {
    whatsappNumber: null,
    supportEmail: null,
    supportPhone: null,
    addressLine: null,
    city: null,
  },
  seo: {
    metaDescription: null,
    ogImageUrl: null,
  },
};

/**
 * Lista plana de claves DB <-> path en el objeto de config. Usada en
 * los endpoints para serializar/deserializar. Respeta el patrón
 * `seccion.subclave` para que PlatformSetting (key/value único)
 * mapee 1-1.
 */
export const PLATFORM_CONFIG_KEYS = {
  // payment
  "payment.yapeNumber": "payment.yapeNumber",
  "payment.yapeHolder": "payment.yapeHolder",
  "payment.yapeQrUrl": "payment.yapeQrUrl",
  "payment.plinNumber": "payment.plinNumber",
  "payment.plinHolder": "payment.plinHolder",
  "payment.plinQrUrl": "payment.plinQrUrl",
  "payment.bankName": "payment.bankName",
  "payment.bankAccount": "payment.bankAccount",
  "payment.bankAccountCCI": "payment.bankAccountCCI",
  "payment.bankHolder": "payment.bankHolder",
  // brand
  "brand.name": "brand.name",
  "brand.tagline": "brand.tagline",
  "brand.logoUrl": "brand.logoUrl",
  "brand.faviconUrl": "brand.faviconUrl",
  "brand.primaryColor": "brand.primaryColor",
  "brand.secondaryColor": "brand.secondaryColor",
  // support
  "support.whatsappNumber": "support.whatsappNumber",
  "support.supportEmail": "support.supportEmail",
  "support.supportPhone": "support.supportPhone",
  "support.addressLine": "support.addressLine",
  "support.city": "support.city",
  // seo
  "seo.metaDescription": "seo.metaDescription",
  "seo.ogImageUrl": "seo.ogImageUrl",
} as const;

export type PlatformConfigKey = keyof typeof PLATFORM_CONFIG_KEYS;

/**
 * Subset PUBLICO — lo que el storefront/landing pueden leer sin auth.
 * Excluye support email interno y datos sensibles si los hubiera.
 * Hoy todos los campos son públicos (un Yape number es para que el
 * cliente te pague), pero si mañana agregamos secrets, los excluimos
 * de esta función.
 */
export type PublicPlatformConfig = PlatformConfig;

/** Helper: convierte rows planos `{ "payment.yapeNumber": "987..." }`
 *  en el objeto anidado `{ payment: { yapeNumber: "987..." } }`. */
export function flatToNested(flat: Record<string, unknown>): PlatformConfig {
  const out: PlatformConfig = JSON.parse(JSON.stringify(PLATFORM_CONFIG_DEFAULTS));
  for (const fullKey of Object.keys(PLATFORM_CONFIG_KEYS)) {
    const value = flat[fullKey];
    if (value === undefined || value === null) continue;
    const [section, sub] = fullKey.split(".") as [keyof PlatformConfig, string];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (out[section] as any)[sub] = value;
  }
  return out;
}

/** Helper inverso: convierte el objeto anidado a flat para guardar. */
export function nestedToFlat(cfg: Partial<PlatformConfig>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const fullKey of Object.keys(PLATFORM_CONFIG_KEYS)) {
    const [section, sub] = fullKey.split(".") as [keyof PlatformConfig, string];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sectionVal = (cfg as any)[section];
    if (!sectionVal || sectionVal[sub] === undefined) continue;
    out[fullKey] = sectionVal[sub];
  }
  return out;
}
