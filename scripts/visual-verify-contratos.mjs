/**
 * Verificación visual de la pestaña Contratos (ADR-307).
 *
 * Captura, en claro y en oscuro: el tablero, el listado y la ficha de un
 * contrato con los paneles nuevos (revisor de cláusulas, firmantes, renovar).
 *
 *   node scripts/visual-verify-contratos.mjs
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BSM_BASE ?? "http://localhost:3000";
const SLUG = "main";
const USER = "qaadmin";
const PASS = "Qa-admin-1234";
const OUT = "reports/contratos";

async function prepararPagina(page, tema) {
  await page.addInitScript(
    ({ slug, tema }) => {
      try {
        localStorage.setItem(`onboarding-completed-${slug}`, "1");
        if (tema === "dark") sessionStorage.setItem("buleje-theme-session-v2", "dark");
      } catch {
        /* el storage puede estar bloqueado; el screenshot igual sirve */
      }
    },
    { slug: SLUG, tema },
  );
}

async function limpiarOverlays(page) {
  await page.evaluate(() => {
    document.querySelectorAll("[data-nextjs-toast], [data-nextjs-dev-tools-button]").forEach((el) => el.remove());
    document.body.style.overflow = "";
  });
}

async function main() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const capturas = [];

  for (const tema of ["light", "dark"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      extraHTTPHeaders: { "x-tenant-id": SLUG },
      colorScheme: tema,
    });
    const page = await context.newPage();
    await prepararPagina(page, tema);

    const login = await page.request.post(`${BASE}/api/auth/login`, {
      headers: { "content-type": "application/json", "x-tenant-id": SLUG },
      data: { username: USER, password: PASS, tenantSlug: SLUG },
    });
    if (login.status() !== 200) {
      console.error("Login falló:", login.status());
      process.exit(1);
    }

    await page.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(3500);
    await limpiarOverlays(page);

    // Sub-tab Contratos dentro del hub de Documentos.
    const subtab = page.getByRole("button", { name: /^Contratos$/i }).first();
    await subtab.click({ timeout: 20_000 });
    await page.waitForTimeout(3000);
    await limpiarOverlays(page);

    await page.screenshot({ path: `${OUT}/contratos-tablero-${tema}.png`, fullPage: true });
    capturas.push(`contratos-tablero-${tema}.png`);

    // Listado
    const tabLista = page.getByRole("button", { name: /Mis Contratos/i }).first();
    await tabLista.click({ timeout: 20_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/contratos-listado-${tema}.png`, fullPage: true });
    capturas.push(`contratos-listado-${tema}.png`);

    // Ficha del primer contrato → paneles nuevos
    const primera = page.locator("[class*='cursor-pointer']").filter({ hasText: /CONT-2026/ }).first();
    if (await primera.count()) {
      await primera.click({ timeout: 20_000 });
      await page.waitForTimeout(3500);
      await limpiarOverlays(page);
      await page.screenshot({ path: `${OUT}/contratos-ficha-${tema}.png`, fullPage: true });
      capturas.push(`contratos-ficha-${tema}.png`);
    } else {
      console.warn("No se encontró ninguna ficha de contrato para abrir.");
    }

    await context.close();
  }

  await browser.close();
  console.log("Capturas en", OUT);
  capturas.forEach((c) => console.log("  ·", c));
}

main().catch((err) => {
  console.error("Falló la verificación visual:", err);
  process.exitCode = 1;
});
