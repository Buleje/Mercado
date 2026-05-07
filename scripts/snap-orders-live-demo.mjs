/**
 * Live demo de las mejoras: navega a /admin?tab=marketplace#marketplace,
 * va al sub-tab Órdenes, hace screenshot, después click en una card para
 * abrir el drawer, screenshot otra vez.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("reports/design-system", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
  args: ["--disable-cache", "--disk-cache-size=0", "--disable-application-cache"],
});
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  bypassCSP: true,
});
// Bypass de cache total — fuerza re-download de TODOS los chunks JS/CSS
await ctx.route("**/*", (route) => {
  const headers = { ...route.request().headers(), "cache-control": "no-cache, no-store, must-revalidate", "pragma": "no-cache" };
  route.continue({ headers });
});
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message.slice(0, 150)));
page.on("console", (m) => {
  if (m.type() === "error") {
    const t = m.text();
    if (t.includes("favicon") || t.includes("[Fast Refresh]")) return;
    errors.push("CONSOLE " + t.slice(0, 150));
  }
});

// 1. Pre-setear tenant
await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem("active-tenant-slug", "main");
  localStorage.setItem("active-tenant", "main");
  try { localStorage.setItem("onboarding-completed-main", "1"); } catch {}
  // Marcar el morning summary como ya mostrado para que no bloquee
  const today = new Date().toISOString().slice(0, 10);
  try { localStorage.setItem(`morning-summary-${today}`, "shown"); } catch {}
});

// 2. Login admin
await page.goto("http://localhost:3000/admin/login", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800);
await page.locator("#username").first().pressSequentially("qaadmin", { delay: 25 });
await page.locator("#password").first().pressSequentially("Qa-admin-1234", { delay: 25 });
await page.waitForTimeout(400);
await page.locator("#password").first().press("Enter");
await page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 25000 }).catch(() => {});
await page.waitForTimeout(3500);
console.log("Post-login URL:", page.url());

// Cerrar el modal "Buenos días" hasta 5 veces
for (let i = 0; i < 5; i++) {
  const visible = await page.locator('h1:has-text("Buenos días"), h2:has-text("Buenos días")').first().isVisible().catch(() => false);
  if (!visible) break;
  // Click en X o "Comenzar el día"
  await page.locator('button[aria-label*="Cerrar"], button[aria-label*="cerrar"]').last().click({ force: true, timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Comenzar el día")').click({ force: true, timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(800);
}
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
// Eliminar manualmente el modal del DOM si sigue
await page.evaluate(() => {
  const overlays = Array.from(document.querySelectorAll("div"));
  for (const el of overlays) {
    if ((el.textContent || "").includes("Buenos días") && el.className?.toString().includes("fixed")) {
      el.remove();
    }
  }
});
await page.waitForTimeout(500);

// 3. Navegar a marketplace — varios intentos hasta que listener esté listo
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("admin:navigate", {
      detail: { moduleId: "marketplace", tabId: "marketplace" },
    }));
  });
  await page.waitForTimeout(1500);
  const onMarketplace = await page.evaluate(() => /marketplace/i.test(window.location.search) || /marketplace/i.test(window.location.hash));
  if (onMarketplace) break;
}
await page.waitForTimeout(2500);

// 4. Click sub-tab Órdenes
for (let i = 0; i < 3; i++) {
  const found = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll("button, a, [role='tab']"));
    const ord = items.find((el) => /[óo]rdenes/i.test(el.textContent || ""));
    if (ord) { ord.click(); return true; }
    return false;
  });
  if (found) break;
  await page.waitForTimeout(800);
}
await page.waitForTimeout(3000);

// 5. Screenshot ESTADO ACTUAL del kanban
await page.screenshot({ path: "reports/design-system/demo-1-kanban.png", fullPage: false });
console.log("OK 1 — kanban capturado");

// 6. Click en la primera card visible (debería abrir el drawer)
const clicked = await page.evaluate(() => {
  // Buscar elementos con texto "#XXXXXXXX" (id de orden) y subir al div clickeable
  const all = Array.from(document.querySelectorAll("p, span, div"));
  const idEl = all.find((el) => /^#[A-F0-9]{6,}/i.test((el.textContent || "").trim()));
  if (!idEl) return false;
  // Sube al primer ancestor con cursor-pointer o role apropiado
  let cur = idEl.parentElement;
  let hops = 0;
  while (cur && hops < 6) {
    const cls = (cur.className || "").toString();
    if (/cursor-pointer/.test(cls) || cur.onclick) {
      cur.click();
      return true;
    }
    cur = cur.parentElement;
    hops++;
  }
  // Fallback: click en el idEl directamente
  if (idEl.parentElement) {
    idEl.parentElement.click();
    return true;
  }
  return false;
});
console.log("Click en card:", clicked);
await page.waitForTimeout(3500);

// 7. Screenshot del drawer
await page.screenshot({ path: "reports/design-system/demo-2-drawer.png", fullPage: false });
console.log("OK 2 — drawer capturado");

// 8. Scroll dentro del drawer para ver el contenido completo
await page.evaluate(() => {
  const drawer = document.querySelector('[role="dialog"]');
  if (drawer) {
    const scroller = drawer.querySelector('.overflow-y-auto');
    if (scroller) scroller.scrollTop = scroller.scrollHeight / 2;
  }
});
await page.waitForTimeout(1500);
await page.screenshot({ path: "reports/design-system/demo-3-drawer-scrolled.png", fullPage: false });
console.log("OK 3 — drawer scrolled capturado");

// 9. Cerrar drawer y demostrar drag&drop visualmente con un hover
await page.keyboard.press("Escape");
await page.waitForTimeout(800);

// Probar drag desde primera card "Pendiente" a "Preparando"
const dragTest = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll("div")).filter((el) => {
    const cls = (el.className || "").toString();
    const txt = (el.textContent || "").trim();
    return /cursor-pointer/.test(cls) && /^#[A-F0-9]{8}/.test(txt);
  });
  return cards.length;
});
console.log("Cards encontradas para drag:", dragTest);

// Hover sobre una card en pendiente para ver hover effect
const firstCard = page.locator("div.cursor-pointer").first();
await firstCard.hover().catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: "reports/design-system/demo-4-card-hover.png", fullPage: false });
console.log("OK 4 — card hover capturado");

if (errors.length > 0) {
  console.log("---ERRORS DETECTADOS---");
  errors.slice(0, 5).forEach((e) => console.log(" ·", e));
}

await browser.close();
