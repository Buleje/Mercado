/**
 * e2e/helpers/test-data.ts
 *
 * Constantes compartidas entre todos los specs E2E.
 * Leídas de process.env.E2E_* (definidas en .env.test).
 *
 * Uso en specs:
 *   import { TEST_CUSTOMER_PHONE, TEST_TENANT_SLUG } from "./helpers/test-data";
 */

// ── Credenciales Admin QA ─────────────────────────────────────────────────────
export const ADMIN_USER = process.env.E2E_ADMIN_USER ?? "qaadmin";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "Qa-admin-1234";

// ── Tenants ───────────────────────────────────────────────────────────────────
/** Slug del tenant principal (tenant A en tests de aislamiento). */
export const TEST_TENANT_SLUG = process.env.E2E_TENANT_A_SLUG ?? "main";
/** Slug del segundo tenant (tenant B en tests de aislamiento). */
export const TEST_TENANT_B_SLUG = process.env.E2E_TENANT_B_SLUG ?? "mi-pollo";
/** UUID del tenant "main". Requerido para endpoints de compliance. */
export const TEST_TENANT_ID = process.env.E2E_TENANT_ID ?? "";

// ── Vendor (marketplace) ─────────────────────────────────────────────────────
/** Slug del vendor en /marketplace/[slug]. */
export const TEST_VENDOR_SLUG = process.env.E2E_VENDOR_SLUG ?? "demo";

// ── Cliente E2E ───────────────────────────────────────────────────────────────
/** Teléfono del cliente de prueba creado por seed-e2e.mjs. */
export const TEST_CUSTOMER_PHONE = process.env.E2E_CUSTOMER_PHONE ?? "987654321";
/** DNI del cliente (exportación Ley 29733). */
export const TEST_CUSTOMER_DNI = process.env.E2E_CUSTOMER_DNI ?? "12345678";
/** Token JWT pre-generado (opcional — si está vacío los tests hacen login via API). */
export const TEST_CUSTOMER_TOKEN = process.env.E2E_CUSTOMER_TOKEN ?? "";

// ── Cliente RTBF (descartable) ────────────────────────────────────────────────
/** DNI del cliente que SE ELIMINA en el test RTBF (privacidad-rtbf-l29733.spec.ts). */
export const TEST_RTBF_DNI = process.env.E2E_RTBF_CUSTOMER_DNI ?? "99999999";

// ── Repartidor ────────────────────────────────────────────────────────────────
export const TEST_DELIVERY_USER = process.env.E2E_DELIVERY_USER ?? "";
export const TEST_DELIVERY_PASSWORD = process.env.E2E_DELIVERY_PASSWORD ?? "";
/** ID de la orden asignada al repartidor (seed-e2e.mjs la imprime al final). */
export const TEST_DELIVERY_ORDER_ID = process.env.E2E_DELIVERY_ORDER_ID ?? "";

// ── WhatsApp / Twilio ─────────────────────────────────────────────────────────
export const TEST_TWILIO_AUTH_TOKEN = process.env.E2E_TWILIO_AUTH_TOKEN ?? "";
export const TEST_WA_VERIFY_TOKEN = process.env.E2E_WHATSAPP_VERIFY_TOKEN ?? "";

// ── URLs base ─────────────────────────────────────────────────────────────────
export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// ── Helpers de localStorage ───────────────────────────────────────────────────
/**
 * Script de init que suprime el modal de onboarding y el popup de cupón.
 * Usar con page.addInitScript(suppressModals(slug)).
 */
export function suppressModals(tenantSlug: string): () => void {
  return () => {
    try {
      localStorage.setItem(`onboarding-completed-${tenantSlug}`, "1");
      localStorage.setItem("first-visit-coupon-shown", "true");
    } catch {
      // silent — puede fallar en contextos sin localStorage
    }
  };
}
