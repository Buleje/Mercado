/**
 * a11y.spec.ts — Accessibility regression tests con axe-core.
 *
 * Cubre las 5 paginas publicas top con foco en regression a11y:
 *   1. /                       (landing)
 *   2. /marketplace            (home)
 *   3. /marketplace/explorar   (hub descubrimiento)
 *   4. /marketplace/ofertas    (ofertas estandarizadas)
 *   5. /marketplace/recetas    (recetario con hero editorial)
 *
 * Reglas WCAG 2.1 AA evaluadas. Falla el test si hay violaciones serious/critical.
 * minor/moderate quedan como warnings (logged pero no fail).
 *
 * Run: npx playwright test e2e/a11y.spec.ts
 */

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES_TO_AUDIT = [
  { path: "/", name: "Landing" },
  { path: "/marketplace", name: "Marketplace home" },
  { path: "/marketplace/explorar", name: "Explorar hub" },
  { path: "/marketplace/ofertas", name: "Ofertas" },
  { path: "/marketplace/recetas", name: "Recetario" },
];

for (const page of PAGES_TO_AUDIT) {
  test(`a11y: ${page.name} (${page.path}) — sin violaciones serious/critical WCAG 2.1 AA`, async ({
    page: browser,
  }) => {
    await browser.goto(page.path);

    // Esperar a que el contenido principal este renderizado
    // (evita falsos positivos por elementos en mid-render)
    await browser.waitForLoadState("domcontentloaded");
    await browser.waitForTimeout(500); // settle reveal-on-scroll animations

    // Cast: la version de @axe-core/playwright en npm puede tener mismatch
    // de tipos con la version local de @playwright/test (alpha 1.59).
    // El runtime es 100% compatible — solo el typecheck lo nota.
    const results = await new AxeBuilder({ page: browser as never })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    const minor = results.violations.filter(
      (v) => v.impact === "minor" || v.impact === "moderate",
    );

    if (minor.length > 0) {
      console.warn(
        `[a11y warnings: ${page.name}] ${minor.length} minor/moderate:`,
        minor.map((v) => `${v.id} (${v.nodes.length} nodes)`).join(", "),
      );
    }

    if (serious.length > 0) {
      console.error(
        `[a11y FAIL: ${page.name}] ${serious.length} serious/critical violations:`,
      );
      for (const v of serious) {
        console.error(`  - ${v.id} (${v.impact}): ${v.help}`);
        console.error(`    Help: ${v.helpUrl}`);
        console.error(`    Affected nodes: ${v.nodes.length}`);
      }
    }

    expect(serious, `Found ${serious.length} serious/critical a11y violations`).toEqual([]);
  });
}
