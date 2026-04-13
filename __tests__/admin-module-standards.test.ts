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
const NO_TABS_MODULES = ["AICommandModule.tsx", "AnalyticsProModule.tsx"];
// Módulos que legítimamente usan dark: classes (dark mode habilitado)
const DARK_MODE_MODULES = [
  "CRMClientesModule.tsx",
  "FinanzasModule.tsx",
  "InventarioAlmacenesModule.tsx",
  // POSCajaModule.tsx removido — ventas-caja eliminado
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

  it("debe tener al menos 30 módulos unified", () => {
    expect(moduleFiles.length).toBeGreaterThanOrEqual(30);
  });

  describe("AdminModuleHeader — presente en todos los módulos", () => {
    for (const file of moduleFiles) {
      if (PROXY_MODULES.includes(file)) continue;

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

      it(`${file} tiene MODULE_ID definido`, () => {
        const content = readModule(file);
        expect(content).toMatch(/const _?MODULE_ID\s*=\s*"/);
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

      it(`${file} usa <div className="space-y-4"> como wrapper`, () => {
        const content = readModule(file);
        expect(content).toContain('className="space-y-4"');
      });
    }
  });
});
