import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const BASE = "http://localhost:3000";
const SLUG = "main";
const USER = "qaadmin";
const PASS = "Qa-admin-1234";
const OUT = "/tmp/claude-1000/-home-usuario-proyectos-Mercado/8290df84-5850-4d86-a9a5-0c47237c172f/scratchpad/sidebar-collapse";

const MODE = process.argv[2] || "after"; // "before" | "after"

async function dismissModal(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem("onboarding-completed-main", "1");
      localStorage.setItem("onboarding-completed-luis", "1");
      localStorage.setItem("onboarding-completed-buleje", "1");
      localStorage.setItem("onboarding-completed-tienda-3", "1");
      localStorage.setItem("buleje-tour-marketplace-2026-04", "1");
    } catch {}
  });
  await page.evaluate(() => {
    document.querySelectorAll('[role="dialog"]').forEach((el) => {
      if ((el.textContent ?? "").includes("Configura tu bodega")) el.remove();
    });
    document.body.style.overflow = "";
  });
  await page.waitForTimeout(300);
}

async function main() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    extraHTTPHeaders: { "x-tenant-id": SLUG },
  });
  const page = await context.newPage();

  const loginResp = await page.request.post(`${BASE}/api/auth/login`, {
    headers: { "content-type": "application/json", "x-tenant-id": SLUG },
    data: { username: USER, password: PASS, tenantSlug: SLUG },
  });
  if (loginResp.status() !== 200) {
    console.error("Login fail", loginResp.status());
    process.exit(1);
  }

  await page.goto(`${BASE}/t/${SLUG}/admin?tab=vendor-dashboard`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(2000);
  await dismissModal(page);
  await page.waitForTimeout(1500);

  // Count top-level sidebar entries (category buttons, single-tab or group headers)
  const navButtons = await page.$$eval("nav button[data-tour-tab]", (els) =>
    els.map((e) => e.getAttribute("data-tour-tab"))
  );
  console.log(`[${MODE}] SIDEBAR_TOPLEVEL_COUNT:`, navButtons.length);
  console.log(`[${MODE}] SIDEBAR_TOPLEVEL:`, JSON.stringify(navButtons));

  await page.screenshot({ path: `${OUT}/${MODE}-sidebar.png`, fullPage: true });

  if (MODE.startsWith("after")) {
    // ── Verify 4 representative hubs still reach the collapsed sub-view ──
    const cases = [
      { tab: "plata", clickText: "Fiados", shot: "finanzas-fiados" },
      { tab: "campanas", clickText: "Puntos", shot: "crecimiento-puntos" },
      { tab: "rendimiento", clickText: "Auditor", shot: "sistema-auditoria" },
      { tab: "pagina-inicio", clickText: "Identidad y tema", shot: "mitienda-identidad" },
    ];
    for (const c of cases) {
      await page.goto(`${BASE}/t/${SLUG}/admin?tab=${c.tab}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(1800);
      await dismissModal(page);
      await page.waitForTimeout(1000);
      const target = page.locator(`text=${c.clickText}`).first();
      const found = await target.count();
      console.log(`[hub-check] tab=${c.tab} clickText="${c.clickText}" found=${found}`);
      if (found > 0) {
        await target.click({ timeout: 5000 }).catch((e) => console.log("click err", String(e)));
        await page.waitForTimeout(1500);
      }
      await page.screenshot({ path: `${OUT}/${c.shot}.png`, fullPage: false });
    }

    // ── Verify old deep-link still resolves (id removed from sidebar list, not from ALL_TABS/TabRouter) ──
    await page.goto(`${BASE}/t/${SLUG}/admin?tab=adelantos`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(2000);
    await dismissModal(page);
    await page.waitForTimeout(1000);
    const bodyText = await page.locator("body").innerText();
    const hasAdelantos = /Adelantos/i.test(bodyText);
    console.log("[deep-link] /admin?tab=adelantos loads Adelantos content:", hasAdelantos);
    await page.screenshot({ path: `${OUT}/deep-link-adelantos.png`, fullPage: false });
  }

  await browser.close();
  console.log("\nDONE", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
