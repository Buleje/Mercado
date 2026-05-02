import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "reports/sidebar-buleje";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// Login admin tenant main
await page.goto("http://localhost:3000/admin", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(800);

// Si redirige a login, hace login
if (page.url().includes("/login") || page.url().includes("/admin")) {
  // Try to find login form
  const hasLogin = await page.locator('input[type="password"]').count() > 0;
  if (hasLogin) {
    await page.fill('input[type="text"], input[name="username"]', "qaadmin").catch(() => {});
    await page.fill('input[type="password"]', "Qa-admin-1234").catch(() => {});
    await page.waitForTimeout(300);
    await Promise.all([
      page.locator('button[type="submit"]').first().click(),
      page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
    ]);
    await page.waitForTimeout(2000);
  }
}

// Aplicar preset Buleje vía localStorage (mismas keys que AdminSidebar lee)
const PRESETS = [
  // Caso Brandon real: ya tenía "cristal" guardado de antes — verificar que ahora renderiza editorial
  { id: "cristal-legacy", theme: "cristal", accent: "teal", density: "normal", iconStyle: "colored", applyToHeader: false },
  { id: "buleje",    theme: "buleje",  accent: "teal",   density: "normal",  iconStyle: "monochrome", applyToHeader: true  },
  { id: "ejecutivo", theme: "dark",    accent: "amber",  density: "compact", iconStyle: "monochrome", applyToHeader: true  },
];

// Cerrar onboarding modal si aparece
await page.evaluate(() => {
  const slug = location.pathname.match(/^\/admin\/([^\/]+)/)?.[1] ?? "main";
  localStorage.setItem(`onboarding-completed-${slug}`, "1");
  localStorage.setItem("onboarding-completed-main", "1");
});

for (const p of PRESETS) {
  await page.evaluate((cfg) => {
    localStorage.setItem("admin-sidebar-theme", cfg.theme);
    localStorage.setItem("admin-sidebar-accent", cfg.accent);
    localStorage.setItem("admin-sidebar-density", cfg.density);
    localStorage.setItem("admin-sidebar-icon-style", cfg.iconStyle);
    localStorage.setItem("admin-sidebar-apply-to-header", String(cfg.applyToHeader));
  }, p);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/admin-${p.id}-light.png`, clip: { x: 0, y: 0, width: 320, height: 900 } });
  await page.screenshot({ path: `${OUT}/admin-${p.id}-full.png`, clip: { x: 0, y: 0, width: 1280, height: 200 } });
  console.log("OK admin light:", p.id);
}

await browser.close();
console.log("DONE →", OUT);
