/**
 * lib/superadmin-api-routes.ts
 *
 * Constantes ÚNICAS de rutas API `/api/superadmin/*` consumidas desde el cliente.
 *
 * Por qué existe esto:
 *  - Cambiar una URL hoy requiere grep manual en ~25 archivos cliente.
 *  - Las llamadas literales `"/api/superadmin/payment-proofs"` dispersas
 *    impiden refactor seguro y verificación con find-all-references.
 *  - Una sola fuente de verdad hace evidente el contrato cliente/servidor.
 *
 * Convención:
 *  - Verbos como funciones cuando hay `:id` (`PAYMENT_PROOFS.byId(id)`).
 *  - Strings planos para colecciones (`PAYMENT_PROOFS.list`).
 *
 * Uso:
 *   import { SA_API } from "@/lib/superadmin-api-routes";
 *   fetch(SA_API.PAYMENT_PROOFS.byId(id), { ... });
 */

export const SA_API = {
  // ── Marca / branding ─────────────────────────────────────────────────────
  BRAND: "/api/superadmin/brand" as const,
  PLATFORM_BRAND: "/api/superadmin/platform-brand" as const,
  PLATFORM_CONFIG_UPLOAD: "/api/superadmin/platform-config/upload" as const,

  // ── Marketplace ──────────────────────────────────────────────────────────
  VENDOR_APPLICATIONS: {
    list: "/api/superadmin/vendor-applications" as const,
    stats: "/api/superadmin/vendor-applications/stats" as const,
    review: (id: string) =>
      `/api/superadmin/vendor-applications/${id}/review` as const,
  },
  VENDOR_HEALTH: {
    summary: "/api/superadmin/vendor-health" as const,
    trigger: "/api/superadmin/vendor-health/trigger" as const,
    grace: "/api/superadmin/vendor-grace" as const,
  },
  SUPPLIERS: {
    approve: (id: string) =>
      `/api/superadmin/marketplace/suppliers/${id}/approve` as const,
    reject: (id: string) =>
      `/api/superadmin/marketplace/suppliers/${id}/reject` as const,
  },

  // ── Billing / pagos ──────────────────────────────────────────────────────
  BILLING_SUMMARY: "/api/superadmin/billing-summary" as const,
  PAYMENT_PROOFS: {
    list: "/api/superadmin/payment-proofs" as const,
    approve: (id: string) =>
      `/api/superadmin/payment-proofs/${id}/approve` as const,
    reject: (id: string) =>
      `/api/superadmin/payment-proofs/${id}/reject` as const,
  },
  PAYMENT_APPROVALS: {
    list: "/api/superadmin/payment-approvals" as const,
    approve: (id: string) =>
      `/api/superadmin/payment-approvals/${id}/approve` as const,
    reject: (id: string) =>
      `/api/superadmin/payment-approvals/${id}/reject` as const,
  },

  // ── Tenants ──────────────────────────────────────────────────────────────
  TENANTS: {
    list: "/api/superadmin/tenants" as const,
    bySlug: (slug: string) => `/api/superadmin/tenants/${slug}` as const,
    products: (slug: string) =>
      `/api/superadmin/tenants/${slug}/products` as const,
    purgeSlug: (slug: string) =>
      `/api/superadmin/tenants/${slug}/purge` as const,
  },
  IMPERSONATE: "/api/superadmin/impersonate" as const,
  IMPERSONATE_EXIT: "/api/superadmin/impersonate/exit" as const,
  REPARTIDORES_IMPERSONATE: "/api/superadmin/repartidores/impersonate" as const,

  // ── Sistema / destructivos ───────────────────────────────────────────────
  PURGE: "/api/superadmin/purge" as const,
  DESIGN_SYSTEM: "/api/superadmin/design-system" as const,
  UPLOAD: "/api/superadmin/upload" as const,

  // ── Auth (sin csrf — flujo de login) ─────────────────────────────────────
  AUTH: "/api/superadmin/auth" as const,
} as const;
