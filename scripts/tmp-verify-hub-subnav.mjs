import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "/tmp/claude-1000/-home-usuario-proyectos-Mercado/8290df84-5850-4d86-a9a5-0c47237c172f/scratchpad/sidebar-collapse";

async function dismissModal(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem("onboarding-completed-main", "1");
    } catch {}
    document.querySelectorAll('[role="dialog"]').forEach((el) => {
      if ((el.textContent ?? "").includes("Configura tu bodega")) el.remove();
    });
    document.body.style.overflow = "";
  });
  await page.waitForTimeout(300);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
const page = await context.newPage();
await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});

// 1. Finanzas: plata -> click "Por cobrar" tab -> should reveal Fiados/Prestamos/Adelantos/Scoring
await page.goto(`${BASE}/t/${SLUG}/admin?tab=plata`, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2000);
await dismissModal(page);
await page.getByRole("tab", { name: /Por cobrar/i }).first().click({ timeout: 8000 }).catch(async (e) => {
  console.log("tab click fallback", String(e));
  await page.getByText("Por cobrar", { exact: false }).first().click({ timeout: 8000 });
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/finanzas-porcobrar-expanded.png`, fullPage: false });
const t1 = await page.locator("body").innerText();
console.log("[finanzas] shows Fiados:", /Fiados/.test(t1), "| Préstamos:", /Pr[eé]stamos/.test(t1), "| Adelantos:", /Adelantos/.test(t1), "| Scoring:", /Scoring/.test(t1));

// 2. Crecimiento: campanas -> AdminTabBar should show Puntos/Gift Cards/Socio/etc
await page.goto(`${BASE}/t/${SLUG}/admin?tab=campanas`, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2500);
await dismissModal(page);
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/crecimiento-tabbar.png`, fullPage: false });
const t2 = await page.locator("body").innerText();
console.log("[crecimiento] shows Puntos:", /Puntos/.test(t2), "| Gift Cards:", /Gift Cards/.test(t2), "| Socio:", /Socio/.test(t2));

// 3. Sistema: rendimiento -> AdminTabBar should show Auditoría/Colas
await page.goto(`${BASE}/t/${SLUG}/admin?tab=rendimiento`, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2500);
await dismissModal(page);
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/sistema-tabbar.png`, fullPage: false });
const t3 = await page.locator("body").innerText();
console.log("[sistema] shows Auditoría:", /Auditor[ií]a/.test(t3), "| Colas:", /Colas/.test(t3));

// 4. Mi Tienda: pagina-inicio -> AdminTabBar should show Identidad y tema
await page.goto(`${BASE}/t/${SLUG}/admin?tab=pagina-inicio`, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2500);
await dismissModal(page);
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/mitienda-tabbar.png`, fullPage: false });
const t4 = await page.locator("body").innerText();
console.log("[mi-tienda] shows Identidad y tema:", /Identidad y tema/.test(t4));

await browser.close();
