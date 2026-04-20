import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { openapiRegistry } from "./registry";

// Importar todas las registrations — cada módulo llama registerEndpoint() al cargar
// ── Originales (5) ────────────────────────────────────────────────────────────
import "./registrations/coupons-validate";
import "./registrations/reviews";
import "./registrations/recommendations";
import "./registrations/stores-register";
import "./registrations/drivers-apply";

// ── Nuevas (10) ───────────────────────────────────────────────────────────────
import "./registrations/qa-product";
import "./registrations/live-viewers";
import "./registrations/store-phone";
import "./registrations/coupons-admin";
import "./registrations/dashboard-aggregates";
import "./registrations/admin-stats";
import "./registrations/today-summary";
import "./registrations/analytics-kpis";
import "./registrations/analytics-rfm";
import "./registrations/ai-status";

export function generateOpenAPIDoc() {
  const generator = new OpenApiGeneratorV31(openapiRegistry.definitions);

  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title:       "Buleje / Bodega San Martín API",
      version:     "0.1.0",
      description:
        "ERP/e-commerce multi-tenant API para Buleje — Pucallpa, Perú. " +
        "Endpoints de /admin requieren autenticación JWT con rol válido.",
    },
    servers: [{ url: "/api", description: "API Server" }],
  });
}
