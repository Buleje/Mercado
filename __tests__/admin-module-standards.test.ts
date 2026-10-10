/**
 * Test de estándares de módulos admin
 * Verifica que TODOS los módulos unified siguen el patrón estándar:
 * - Dibujan su identidad con AdminModuleHeader (vista única) o con
 *   `heading={{…}}` de AdminTabBar (módulo con pestañas: título y pestañas
 *   en una sola banda — patrón acordado con Brandon 2026-09-07)
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
const PROXY_MODULES = [
  "AnalyticsProModule.tsx",
  // Comandos IA (Brandon 2026-10-09): monta components/admin/comandos-ia/ComandosIA.tsx,
  // que trae su AdminTabBar anidado bajo el hub «Asistente IA» (el hub pone el título).
  "AICommandModule.tsx",
];
// Módulos sin tabs (single-view): excluídos del check AdminTabBar y MODULE_ID
const NO_TABS_MODULES = [
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
  // AutomatizacionesModule (ADR-387/388/391): cuatro paneles apilados
  // (salud IA, WhatsApp, Telegram, n8n), sin sub-tabs.
  "AutomatizacionesModule.tsx",
];
// Sub-módulos que viven SIEMPRE dentro de la pestaña de un hub y no pintan
// título propio: la pestaña marcada arriba ya lo dice, y su propia barra de
// pestañas es lo primero que se ve. Ponerles identidad duplicaría el título
// del hub (medido en Análisis: 36px de un segundo encabezado que decía en
// prosa lo que la fila de pestañas dice en botones).
const NESTED_SIN_TITULO = [
  // Análisis → Analytics Pro → (Resumen · Ventas · Productos · Clientes · Predicciones)
  "AnalyticsBIModule.tsx",
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
  // Brandon 2026-07-04 (rework RUM): RendimientoModule usa wrapper space-y-6
  // por el gauge de score + historial RUM (necesita más aire). Mismo opt-out
  // legítimo que LeadsFunnelModule. Usa AdminModuleHeader estándar.
  "RendimientoModule.tsx",
  // Hubs de consolidación (24→7, commit 8f9a3e99): son routers de sub-tabs;
  // cada sub-módulo trae su PROPIO AdminModuleHeader, así que el hub NO pone
  // header para evitar el doble. Tienen AdminTabBar + MODULE_ID propios.
  "AnalisisHubModule.tsx",
  "AsistenteIAHubModule.tsx",
  "DocumentosHubModule.tsx",
  "MiTiendaHubModule.tsx",
  // Hubs de la misma tanda (Brandon 2026-06-20) que nacieron después de la
  // lista y nadie sumó. Son idénticos a los de arriba: AdminBreadcrumb +
  // AdminTabBar + MODULE_ID, montando sub-tabs que YA traen su header
  // (TasksTab, QuickNotesTab…). Ponerles uno propio duplicaría el título,
  // que es justo lo que la excepción de arriba evita.
  "CrecimientoHubModule.tsx",
  "EquipoHubModule.tsx",
  "MensajesHubModule.tsx",
  "SistemaHubModule.tsx",
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

  describe("Identidad del módulo — AdminModuleHeader o heading en la barra", () => {
    for (const file of moduleFiles) {
      if (PROXY_MODULES.includes(file)) continue;
      if (CUSTOM_HEADER_MODULES.includes(file)) continue;
      if (NESTED_SIN_TITULO.includes(file)) continue;

      it(`${file} dibuja su identidad (AdminModuleHeader o AdminTabBar heading=)`, () => {
        const content = readModule(file);
        const conHeader =
          content.includes(
            'import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader"',
          ) && /<AdminModuleHeader[\s\n]/.test(content);
        // `heading={{` dentro del <AdminTabBar …>: título + pestañas en una banda.
        const enBanda = /<AdminTabBar\b[\s\S]*?\bheading=\{\{/.test(content);
        expect(conHeader || enBanda).toBe(true);
      });

      it(`${file} no apila el header viejo ENCIMA de una barra con heading`, () => {
        // Las dos cosas juntas son el apilado que el patrón elimina: título
        // editorial, regla, y otra vez título en la banda de pestañas.
        const content = readModule(file);
        const enBanda = /<AdminTabBar\b[\s\S]*?\bheading=\{\{/.test(content);
        if (!enBanda) return;
        expect(content).not.toMatch(/<AdminModuleHeader[\s\n]/);
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

  // ── REGLA RETIRADA: "no usar clases dark:" ──────────────────────────────
  //
  // Afirmaba lo contrario de la convención vigente. Su propia lista de
  // excepciones lo decía: «la realidad es que TODOS los módulos del unified DS
  // ya soportan dark mode; la convención cambió de force-light a dark mode
  // habilitado por default». Y `.claude/rules/ui-components.md` va más lejos:
  // «gray-* siempre con variante dark:» y «toda UI nueva funciona en light Y
  // dark».
  //
  // Con la regla puesta, agregar soporte dark —lo correcto— rompía el test
  // hasta que alguien sumara el módulo a un allowlist. Fue justo lo que pasó
  // con DocumentosModule y DropshipModule en `f22ef6e5` («el modo oscuro deja
  // de llenarse de manchas claras»): el arreglo bueno fallaba el test.
  //
  // Un test que castiga el trabajo correcto entrena a editar el test. No se
  // reemplaza por "sin hex hardcodeado" —que sería la regla real del repo—
  // porque hoy fallaría en 8 módulos: esa deuda merece su propio trabajo, no
  // un gate rojo permanente que nadie va a mirar.

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

// ── Las pestañas de la barra: la lista sale de TabRouter (contrato de diseño, ADR-489) ──
//
// Lo de arriba mira una carpeta (`unified/*Module.tsx`): una pestaña que vive en
// otra (forestal, cacao, a-medida, OrdersTab, PlanTab…) quedaba fuera del
// control. Acá la lista son los `import()` de app/admin/_components/TabRouter.tsx
// —hoy 34—: una pestaña nueva entra sola. Las reglas son las del contrato:
//   identidad  título de la pestaña: `AdminTabBar heading={{…}}`, `AdminModuleHeader`
//              (vista única) o `LibroChrome` (libros). Un envoltorio sin barra propia
//              (SettingsTab → SettingsModule) vale por el módulo que monta.
//   sinApilar  nunca las dos cosas: header viejo ENCIMA de la barra con título.
//   moduleId   quien dibuja `AdminTabBar` declara (o importa) su MODULE_ID.
// DEUDA_TABROUTER = lo que hoy no cumple (medido 2026-10-09). Sólo puede
// achicarse: si un módulo ya cumple, el test pide sacarlo de la lista.

const RAIZ_REPO = path.resolve(__dirname, "..");
const TAB_ROUTER = "app/admin/_components/TabRouter.tsx";

type ReglaPestana = "identidad" | "sinApilar" | "moduleId";

const DEUDA_TABROUTER: Record<string, ReglaPestana[]> = {
  // Dibuja AdminTabBar (con título) pero no tiene MODULE_ID: su pestaña no se recuerda.
  "components/admin/RecetasModule.tsx": ["moduleId"],
};

const leerRepo = (rel: string) => fs.readFileSync(path.join(RAIZ_REPO, rel), "utf-8");

function resolverModulo(espec: string): string | null {
  if (!espec.startsWith("@/")) return null;
  const base = espec.slice(2);
  for (const c of [`${base}.tsx`, `${base}/index.tsx`, `${base}.ts`]) {
    if (fs.existsSync(path.join(RAIZ_REPO, c))) return c;
  }
  return null;
}

/** Los módulos que TabRouter monta con next/dynamic, en su orden. */
function modulosDeTabRouter(): string[] {
  const out: string[] = [];
  for (const m of leerRepo(TAB_ROUTER).matchAll(/dynamic\(\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']\s*\)/g)) {
    const r = resolverModulo(m[1]);
    if (r && !out.includes(r)) out.push(r);
  }
  return out;
}

const conHeaderViejo = (c: string) => /<AdminModuleHeader[\s\n]/.test(c);
const conTituloEnBanda = (c: string) => /<AdminTabBar\b[\s\S]*?\bheading=\{\{/.test(c);
const esLibro = (c: string) => /<LibroChrome\b|from ["'][^"']*libro-chrome["']/.test(c);
const dibujaIdentidad = (c: string) => conTituloEnBanda(c) || conHeaderViejo(c) || esLibro(c);

const REGLAS_PESTANA: Record<ReglaPestana, (rel: string) => boolean> = {
  identidad: (rel) => {
    const c = leerRepo(rel);
    if (dibujaIdentidad(c)) return true;
    if (/<AdminTabBar\b/.test(c)) return false; // barra propia sin título
    // Envoltorio: vale la identidad del módulo que monta (import estático o dinámico).
    const hijos = [...c.matchAll(/(?:from\s+|import\(\s*)["'](@\/components\/admin\/[^"']+)["']/g)]
      .map((m) => resolverModulo(m[1]))
      .filter((r): r is string => !!r && /Module(\/index)?\.tsx$/.test(r));
    return hijos.some((h) => dibujaIdentidad(leerRepo(h)));
  },
  sinApilar: (rel) => {
    const c = leerRepo(rel);
    return !(conTituloEnBanda(c) && conHeaderViejo(c));
  },
  moduleId: (rel) => {
    const c = leerRepo(rel);
    if (!/<AdminTabBar\b/.test(c)) return true;
    return /const _?MODULE_ID\s*=\s*"/.test(c) || /import\s*\{[^}]*\bMODULE_ID\b[^}]*\}/.test(c);
  },
};

describe("Pestañas de la barra — las 34 de TabRouter (contrato de diseño)", () => {
  const modulos = modulosDeTabRouter();

  it("TabRouter monta al menos 30 pestañas (hoy 34)", () => {
    expect(modulos.length).toBeGreaterThanOrEqual(30);
  });

  for (const rel of modulos) {
    for (const regla of Object.keys(REGLAS_PESTANA) as ReglaPestana[]) {
      const enDeuda = DEUDA_TABROUTER[rel]?.includes(regla) ?? false;
      it(`${rel.replace(/^components\/admin\//, "")} · ${regla}${enDeuda ? " (deuda conocida)" : ""}`, () => {
        const cumple = REGLAS_PESTANA[regla](rel);
        if (enDeuda) {
          expect(cumple, `${rel} ya cumple «${regla}»: sacalo de DEUDA_TABROUTER`).toBe(false);
        } else {
          expect(cumple, `${rel} no cumple «${regla}» (ver la cabecera de este bloque)`).toBe(true);
        }
      });
    }
  }

  it("DEUDA_TABROUTER sólo nombra módulos que TabRouter monta", () => {
    for (const rel of Object.keys(DEUDA_TABROUTER)) expect(modulos).toContain(rel);
  });
});
