/**
 * Test de cobertura completa: aplica un preset y captura cada sección
 * principal del admin del negocio. Repite con un preset diferente para
 * validar visualmente que TODOS los módulos heredan los tokens.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "reports/design-system";
mkdirSync(OUT, { recursive: true });

// Tabs principales del admin (label visible en el sidebar)
const TABS = [
  { id: "vendor-dashboard", label: "Inicio" },
  { id: "ventas-caja", label: "Ventas" },
  { id: "compras", label: "Compras" },
  { id: "productos-inventario", label: "Productos e inventario" },
  { id: "clientes", label: "Clientes" },
];

// Presets a testear (distintos visualmente)
const PRESETS = [
  { slug: "bodega-calida", label: "OrangeAmber" },
  { slug: "pastel-fresh", label: "PinkPastel" },
];

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

// ─── Browser superadmin (para activar presets) ──────────────────────────
const ctxSuper = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const pageSuper = await ctxSuper.newPage();
await pageSuper.goto("http://localhost:3000/superadmin/login", { waitUntil: "domcontentloaded", timeout: 30000 });
await pageSuper.waitForTimeout(500);
await pageSuper.locator('input[autocomplete="username"]').pressSequentially("superadmin", { delay: 30 });
await pageSuper.locator('input[autocomplete="current-password"]').pressSequentially("Super2026!", { delay: 30 });
await pageSuper.waitForTimeout(500);
await pageSuper.locator('button[type="submit"]').first().click({ timeout: 10000, force: true });
await pageSuper.waitForURL((u) => !u.toString().includes("/login"), { timeout: 20000 }).catch(() => {});
await pageSuper.waitForTimeout(800);
console.log("✅ Superadmin logueado");

// ─── Browser admin del negocio ───────────────────────────────────────────
const ctxAdmin = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const pageAdmin = await ctxAdmin.newPage();
const errors = [];
pageAdmin.on("pageerror", (e) => errors.push(`${pageAdmin.url()}: ${e.message}`));
pageAdmin.on("console", (m) => {
  if (m.type() === "error") {
    const t = m.text();
    // Filtra ruidos conocidos
    if (t.includes("Failed to load resource") || t.includes("favicon")) return;
    errors.push(`CONSOLE: ${t.slice(0, 120)}`);
  }
});

// Pre-setear active-tenant-slug ayuda a evitar el step de "elegí tienda"
await pageAdmin.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 30000 });
await pageAdmin.evaluate(() => {
  localStorage.setItem("active-tenant-slug", "main");
  localStorage.setItem("active-tenant", "main");
});
await pageAdmin.goto("http://localhost:3000/admin/login", { waitUntil: "domcontentloaded", timeout: 30000 });
await pageAdmin.waitForTimeout(500);
// IDs únicos en el form (split-view tiene 2 columnas pero un solo formulario)
await pageAdmin.locator("#username").first().pressSequentially("qaadmin", { delay: 30 });
await pageAdmin.locator("#password").first().pressSequentially("Qa-admin-1234", { delay: 30 });
await pageAdmin.waitForTimeout(400);
// Submit con Enter en el password (más fiable que click en split-view)
await pageAdmin.locator("#password").first().press("Enter");
await pageAdmin.waitForURL((u) => !u.toString().includes("/login"), { timeout: 25000 }).catch(() => {});
await pageAdmin.waitForTimeout(2500);
console.log("  Post-login URL:", pageAdmin.url());

// Cerrar onboarding modal si aparece
await pageAdmin.evaluate(() => {
  try {
    localStorage.setItem("onboarding-completed-main", "1");
    localStorage.setItem("onboarding-completed", "1");
  } catch {}
});
console.log("✅ Admin de negocio logueado");

// ─── Loop ────────────────────────────────────────────────────────────────
for (const preset of PRESETS) {
  // Re-login superadmin antes de cada preset (sessión expira rápido)
  await pageSuper.goto("http://localhost:3000/superadmin/login", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  if (pageSuper.url().includes("/login")) {
    await pageSuper.locator('input[autocomplete="username"]').pressSequentially("superadmin", { delay: 30 }).catch(() => {});
    await pageSuper.locator('input[autocomplete="current-password"]').pressSequentially("Super2026!", { delay: 30 }).catch(() => {});
    await pageSuper.waitForTimeout(300);
    await pageSuper.locator('button[type="submit"]:not([disabled])').click({ timeout: 10000 }).catch(() => {});
    await pageSuper.waitForURL((u) => !u.toString().includes("/login"), { timeout: 15000 }).catch(() => {});
    await pageSuper.waitForTimeout(400);
  }

  // Activar via superadmin
  const r = await pageSuper.evaluate(async (s) => {
    const resp = await fetch("/api/superadmin/design-system", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json", "x-csrf-token": "x" },
      body: JSON.stringify({ slug: s }),
    });
    return { status: resp.status, body: await resp.text() };
  }, preset.slug);
  console.log(`\n🎨 Preset ${preset.slug}: ${r.status}`);
  if (r.status !== 200) {
    console.log("body:", r.body.slice(0, 200));
    continue;
  }

  // Empezamos cargando dashboard fresh para que el preset se cargue
  await pageAdmin.goto(`http://localhost:3000/admin?_t=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await pageAdmin.waitForTimeout(3000);

  for (const tab of TABS) {
    try {
      // Click en el item del sidebar por su label visible
      const item = pageAdmin.locator(`button:has-text("${tab.label}"), a:has-text("${tab.label}")`).first();
      await item.click({ timeout: 5000, force: true }).catch(() => {});
      await pageAdmin.waitForTimeout(2800);
      await pageAdmin.keyboard.press("Escape").catch(() => {});
      await pageAdmin.waitForTimeout(300);
      const filename = `cov-${preset.label}-${tab.id}.png`;
      await pageAdmin.screenshot({ path: `${OUT}/${filename}`, fullPage: false });
      console.log(`  ✅ ${tab.label.padEnd(22)} → ${filename}`);
    } catch (err) {
      console.log(`  ❌ ${tab.label.padEnd(22)} → ${err.message.slice(0, 80)}`);
    }
  }
}

console.log("\n--- Errores capturados ---");
if (errors.length === 0) {
  console.log("(ninguno)");
} else {
  errors.slice(0, 20).forEach((e) => console.log("  ·", e));
  console.log(`Total: ${errors.length}`);
}

// Restaurar default
await pageSuper.evaluate(async () => {
  await fetch("/api/superadmin/design-system", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json", "x-csrf-token": "x" },
    body: JSON.stringify({ slug: "buleje-default" }),
  });
});
console.log("\n♻️  Default restaurado");

await browser.close();
