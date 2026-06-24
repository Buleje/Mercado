/**
 * Test de estándares de módulos admin
 * Verifica que TODOS los módulos unified siguen el patrón estándar:
 * - Importan AdminModuleHeader
 * - Importan AdminTabBar (excepto AICommandModule que no tiene tabs)
 * - Tienen MODULE_ID definido (excepto AnalyticsProModule que es proxy)
 * - No usan clases dark: de Tailwind (forced light mode)
 *
 * Ejecutar: npx vitest run __tests__/admin-module-standards.test.ts
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const UNIFIED_DIR = path.resolve(
  __dirname,
  "..",
  "components",
  "admin",
  "unified",
);

// Módulos que son proxies o tienen excepciones documentadas
const PROXY_MODULES = ["AnalyticsProModule.tsx"];
// Módulos sin tabs (single-view): excluídos del check AdminTabBar y MODULE_ID
const NO_TABS_MODULES = [
  "AICommandModule.tsx",
  "AnalyticsProModule.tsx",
  "ChatIAModule.tsx",
  // GiftCards y Lives son single-view — no tienen sub-tabs, no necesitan AdminTabBar
  "GiftCardsAdminModule.tsx",
  "LivesAdminModule.tsx",
  // Brandon 2026-05-17: drive de archivos (DocumentosModule) y funnel de leads
  // dashboard (LeadsFunnelModule) son single-view sin sub-tabs internos.
  // Añadidos en commits posteriores al estándar — opt-out documentado.
  "DocumentosModule.tsx",
  "LeadsFunnelModule.tsx",
  // DropshipModule (ADR-298): vista única (tabla de fulfillments al proveedor),
  // sin sub-tabs → no necesita AdminTabBar/MODULE_ID.
  "DropshipModule.tsx",
];
// Módulos con header custom (no usan AdminModuleHeader, patrón legítimo documentado)
const CUSTOM_HEADER_MODULES = [
  // FinanzasModule usa PageTitle + AdminTabBar como estructura alternativa (ADR-074 Phase 3)
  "FinanzasModule.tsx",
  // POSCajaModule usa layout custom con CardTitle + AdminTabBar — es el modulo
  // de ventas/caja con UI especializada que no encaja en el header estandar.
  "POSCajaModule.tsx",
  // CRMClientesModule (round 15): wrapper custom con CardTitle + tabs propios.
  "CRMClientesModule.tsx",
  // Brandon 2026-05-17: LeadsFunnelModule usa wrapper space-y-6 (más spacing
  // por densidad de KPIs + filtros + tabla). Patrón legítimo opt-out.
  "LeadsFunnelModule.tsx",
  // Hubs de consolidación (24→7, commit 8f9a3e99): son routers de sub-tabs;
  // cada sub-módulo trae su PROPIO AdminModuleHeader, así que el hub NO pone
  // header para evitar el doble. Tienen AdminTabBar + MODULE_ID propios.
  "AnalisisHubModule.tsx",
  "AsistenteIAHubModule.tsx",
  "DocumentosHubModule.tsx",
  "MiTiendaHubModule.tsx",
];
// Módulos que legítimamente usan dark: classes (dark mode habilitado).
// Round 15 (2026-05-09): expandida tras audit. La regla era restrictiva pero
// la realidad es que TODOS los módulos del unified DS ya soportan dark mode.
// Esta lista refleja el estado actual; la convención cambió de "force light"
// a "dark mode habilitado por default" tras ADR-076 (Bodega al Mes UI).
const DARK_MODE_MODULES = [
  "AnalyticsBIModule.tsx",
  "AsistenteIAModule.tsx",
  "CRMClientesModule.tsx",
  "CatalogoTiendaModule.tsx",
  "ChatIAModule.tsx",
  "ComprasModule.tsx",
  "DeliveryPartnersModule.tsx",
  "FinanzasModule.tsx",
  "GiftCardsAdminModule.tsx",
  "InventarioAlmacenesModule.tsx",
  "LeadsFunnelModule.tsx",
  "LivesAdminModule.tsx",
  "MarketplaceModule.tsx",
  "MetasLogrosModule.tsx",
  "POSCajaModule.tsx",
  "RendimientoModule.tsx",
  "SocioMembersAdminModule.tsx",
  "SubscriptionsModule.tsx",
  "VendorDashboardModule.tsx",
];

function getModuleFiles(): string[] {
  if (!fs.existsSync(UNIFIED_DIR)) return [];
  return fs
    .readdirSync(UNIFIED_DIR)
    .filter((f) => f.endsWith("Module.tsx"));
}

function readModule(filename: string): string {
  return fs.readFileSync(path.join(UNIFIED_DIR, filename), "utf-8");
}

describe("Admin Modules — Estándares de estructura", () => {
  const moduleFiles = getModuleFiles();

  it("debe tener al menos 15 módulos unified", () => {
    expect(moduleFiles.length).toBeGreaterThanOrEqual(15);
  });

  describe("AdminModuleHeader — presente en todos los módulos", () => {
    for (const file of moduleFiles) {
      if (PROXY_MODULES.includes(file)) continue;
      if (CUSTOM_HEADER_MODULES.includes(file)) continue;

      it(`${file} importa AdminModuleHeader`, () => {
        const content = readModule(file);
        expect(content).toContain(
          'import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader"',
        );
      });

      it(`${file} usa <AdminModuleHeader en el JSX`, () => {
        const content = readModule(file);
        expect(content).toMatch(/<AdminModuleHeader[\s\n]/);
      });
    }
  });

  describe("AdminTabBar — presente en módulos con tabs", () => {
    for (const file of moduleFiles) {
      if (NO_TABS_MODULES.includes(file) || PROXY_MODULES.includes(file))
        continue;

      it(`${file} importa AdminTabBar`, () => {
        const content = readModule(file);
        expect(content).toContain(
          'import AdminTabBar from "@/components/admin/shared/AdminTabBar"',
        );
      });
    }
  });

  describe("MODULE_ID — definido en cada módulo", () => {
    for (const file of moduleFiles) {
      if (PROXY_MODULES.includes(file)) continue;
      // Single-view modules (no tabs) no necesitan MODULE_ID (sin persistencia de tab)
      if (NO_TABS_MODULES.includes(file)) continue;

      it(`${file} tiene MODULE_ID definido`, () => {
        const content = readModule(file);
        // Acepta declaración local `const MODULE_ID = "..."` o MODULE_ID
        // importado desde el shared del módulo (patrón tras descomposición,
        // ej. MarketplaceModule importa MODULE_ID de marketplace/shared).
        const hasLocal = /const _?MODULE_ID\s*=\s*"/.test(content);
        const hasImported = /import\s*\{[^}]*\bMODULE_ID\b[^}]*\}/.test(content);
        expect(hasLocal || hasImported).toBe(true);
      });
    }
  });

  describe("No dark: classes — modo claro forzado (excepto módulos con dark mode habilitado)", () => {
    for (const file of moduleFiles) {
      if (DARK_MODE_MODULES.includes(file)) continue;

      it(`${file} no contiene clases dark: de Tailwind`, () => {
        const content = readModule(file);
        // Busca dark: seguido de caracteres de clase CSS (patrón Tailwind)
        const darkMatches = content.match(/\bdark:[a-zA-Z0-9[\]_/.-]+/g);
        expect(darkMatches ?? []).toEqual([]);
      });
    }
  });

  describe("Estructura wrapper consistente", () => {
    for (const file of moduleFiles) {
      if (PROXY_MODULES.includes(file)) continue;
      // Módulos con header custom pueden usar space-y-6 u otra variante
      if (CUSTOM_HEADER_MODULES.includes(file)) continue;

      it(`${file} usa <div className="space-y-4"> como wrapper`, () => {
        const content = readModule(file);
        expect(content).toContain('className="space-y-4"');
      });
    }
  });
});
