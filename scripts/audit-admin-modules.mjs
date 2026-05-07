/**
 * Audit sistemática módulo por módulo del admin del negocio.
 *
 * Para cada sección del sidebar:
 *   1. Click + wait
 *   2. Capture: screenshot, console errors, network 4xx/5xx
 *   3. Verify: que var(--accent) del preset esté siendo aplicado en algún elemento visible
 *   4. Detect: hardcoded teal (#00B4A6) o regs sospechosos
 *
 * Output: reports/design-system/audit-modules.md con tabla de resultados.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = "reports/design-system";
mkdirSync(`${OUT}/audit-shots`, { recursive: true });

// Sidebar items principales — los labels visibles
const MODULES = [
  { label: "Inicio", id: "inicio" },
  { label: "Ventas", id: "ventas", expandable: true },
  { label: "Compras", id: "compras" },
  { label: "Productos e inventario", id: "productos-inv", expandable: true },
  { label: "Clientes", id: "clientes", expandable: true },
  { label: "Gráficos", id: "graficos", expandable: true },
  { label: "Página de Inicio", id: "pagina-inicio" },
];

// Helper para sanitizar nombre de archivo
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

// 1. Login superadmin para activar preset
const ctxSuper = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const pageSuper = await ctxSuper.newPage();
await pageSuper.goto("http://localhost:3000/superadmin/login", { waitUntil: "domcontentloaded" });
await pageSuper.waitForTimeout(500);
await pageSuper.locator('input[autocomplete="username"]').pressSequentially("superadmin", { delay: 30 });
await pageSuper.locator('input[autocomplete="current-password"]').pressSequentially("Super2026!", { delay: 30 });
await pageSuper.waitForTimeout(400);
await pageSuper.locator('button[type="submit"]').first().click({ force: true });
await pageSuper.waitForURL((u) => !u.toString().includes("/login"), { timeout: 20000 }).catch(() => {});
await pageSuper.waitForTimeout(700);

// Activar preset distintivo
const PRESET = process.env.PRESET || "bodega-calida"; // orange por default
const PRESET_ACCENT_HUE = process.env.PRESET_HUE ? parseInt(process.env.PRESET_HUE, 10) : 50;

const r = await pageSuper.evaluate(async (s) => {
  const resp = await fetch("/api/superadmin/design-system", {
    method: "PUT", credentials: "include",
    headers: { "Content-Type": "application/json", "x-csrf-token": "x" },
    body: JSON.stringify({ slug: s }),
  });
  return resp.status;
}, PRESET);
console.log(`Activated ${PRESET}: ${r}`);

// 2. Login admin
const ctxAdmin = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const pageAdmin = await ctxAdmin.newPage();

await pageAdmin.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await pageAdmin.evaluate(() => {
  localStorage.setItem("active-tenant-slug", "main");
  localStorage.setItem("active-tenant", "main");
});
await pageAdmin.goto("http://localhost:3000/admin/login", { waitUntil: "domcontentloaded" });
await pageAdmin.waitForTimeout(500);
await pageAdmin.locator("#username").first().pressSequentially("qaadmin", { delay: 30 });
await pageAdmin.locator("#password").first().pressSequentially("Qa-admin-1234", { delay: 30 });
await pageAdmin.waitForTimeout(400);
await pageAdmin.locator("#password").first().press("Enter");
await pageAdmin.waitForURL((u) => !u.toString().includes("/login"), { timeout: 25000 }).catch(() => {});
await pageAdmin.waitForTimeout(3500);
await pageAdmin.evaluate(() => {
  try { localStorage.setItem("onboarding-completed-main", "1"); } catch {}
});
console.log("✅ Admin logueado");

// 3. Auditar cada módulo
const results = [];

for (const mod of MODULES) {
  const errors = [];
  const networkErrors = [];

  // Listeners temporales por tab
  const onPageError = (e) => errors.push(`PAGEERROR: ${e.message.slice(0, 120)}`);
  const onConsole = (m) => {
    if (m.type() === "error") {
      const t = m.text();
      if (t.includes("Failed to load resource") || t.includes("favicon") || t.includes("[Fast Refresh]")) return;
      errors.push(`CONSOLE: ${t.slice(0, 120)}`);
    }
  };
  const onResponse = (resp) => {
    if (resp.status() >= 400 && !resp.url().includes("favicon")) {
      networkErrors.push(`${resp.status()} ${resp.url().split("/").slice(-2).join("/")}`);
    }
  };
  pageAdmin.on("pageerror", onPageError);
  pageAdmin.on("console", onConsole);
  pageAdmin.on("response", onResponse);

  try {
    // Click on sidebar item
    const item = pageAdmin.locator(`button:has-text("${mod.label}"), a:has-text("${mod.label}")`).first();
    await item.click({ timeout: 5000, force: true }).catch(() => {});
    await pageAdmin.waitForTimeout(3000);
    // Cerrar tooltips
    await pageAdmin.keyboard.press("Escape").catch(() => {});
    await pageAdmin.waitForTimeout(300);

    // Screenshot
    const filename = `audit-shots/${slug(mod.label)}.png`;
    await pageAdmin.screenshot({ path: `${OUT}/${filename}`, fullPage: false });

    // Verify accent token aplicado y detectar hardcodes
    const checks = await pageAdmin.evaluate((expectedHue) => {
      const wrapper = document.querySelector("[data-design-preset]");
      if (!wrapper) return { error: "no wrapper" };
      const wrapperAccent = getComputedStyle(wrapper).getPropertyValue("--accent").trim();

      // Detectar elementos visibles con --accent en su tree y validar inheritance
      const main = document.querySelector("main, [role='main']") || document.body;
      const mainCS = getComputedStyle(main);
      const mainAccent = mainCS.getPropertyValue("--accent").trim();

      // Buscar HARDCODES residuales en el HTML actualmente renderizado
      const html = document.documentElement.outerHTML;
      const hardcodeMatches = [];
      const patterns = [
        /\b#00B4A6\b/gi,
        /\b#34d4be\b/gi,
        /\b#5eead4\b/gi,
        /rgba\(\s*0\s*,\s*180\s*,\s*166/gi,
        /rgba\(\s*52\s*,\s*212\s*,\s*190/gi,
      ];
      for (const re of patterns) {
        const matches = html.match(re);
        if (matches) hardcodeMatches.push({ pattern: re.source, count: matches.length });
      }

      // Cuenta elementos con bg/border/color usando --accent
      const sample = Array.from(document.querySelectorAll("button, a, [role='tab']")).slice(0, 30);
      let usingAccent = 0;
      for (const el of sample) {
        const cs = getComputedStyle(el);
        const inherits = cs.getPropertyValue("--accent").trim() === wrapperAccent;
        if (inherits) usingAccent++;
      }

      return {
        wrapperAccent,
        mainAccent,
        accentHueOK: wrapperAccent.includes(`${expectedHue}`),
        hardcodes: hardcodeMatches,
        usingAccentSample: `${usingAccent}/${sample.length}`,
        hasMain: !!main,
        mainEmpty: main.textContent.trim().length < 50,
      };
    }, PRESET_ACCENT_HUE);

    results.push({
      module: mod.label,
      status: errors.length === 0 && (!checks.hardcodes || checks.hardcodes.length === 0) ? "✅" : "⚠️",
      checks,
      errors: errors.slice(0, 5),
      networkErrors: networkErrors.slice(0, 5),
      screenshot: filename,
    });
    console.log(`  ${mod.label}: ${errors.length === 0 ? "✅" : "⚠️"} errors=${errors.length} hardcodes=${(checks.hardcodes||[]).length} mainEmpty=${checks.mainEmpty}`);
  } catch (err) {
    results.push({
      module: mod.label,
      status: "❌",
      error: err.message.slice(0, 200),
      errors,
      networkErrors,
    });
    console.log(`  ${mod.label}: ❌ ${err.message.slice(0, 80)}`);
  } finally {
    pageAdmin.off("pageerror", onPageError);
    pageAdmin.off("console", onConsole);
    pageAdmin.off("response", onResponse);
  }
}

// Restore default
await pageSuper.evaluate(async () => {
  await fetch("/api/superadmin/design-system", {
    method: "PUT", credentials: "include",
    headers: { "Content-Type": "application/json", "x-csrf-token": "x" },
    body: JSON.stringify({ slug: "buleje-default" }),
  });
});

// 4. Generar report markdown
const lines = [
  `# Audit Admin Modules — preset ${PRESET}`,
  ``,
  `Fecha: ${new Date().toISOString()}`,
  `Preset activo durante audit: \`${PRESET}\` (accent hue=${PRESET_ACCENT_HUE})`,
  ``,
  `## Resumen por módulo`,
  ``,
  `| Módulo | Status | Hardcodes | Errores | Network 4xx/5xx | Main vacío | Inherit accent |`,
  `|---|---|---|---|---|---|---|`,
];
for (const r of results) {
  const c = r.checks || {};
  const hardcodeStr = (c.hardcodes || []).length === 0 ? "0" : (c.hardcodes || []).map(h => `${h.pattern.slice(0,12)}=${h.count}`).join(", ");
  lines.push(
    `| ${r.module} | ${r.status} | ${hardcodeStr} | ${r.errors?.length ?? 0} | ${r.networkErrors?.length ?? 0} | ${c.mainEmpty ? "⚠️" : "—"} | ${c.usingAccentSample ?? "n/a"} |`
  );
}
lines.push("", "## Detalle por módulo", "");
for (const r of results) {
  lines.push(`### ${r.module} ${r.status}`);
  lines.push(``);
  if (r.checks?.wrapperAccent) lines.push(`- wrapper.accent: \`${r.checks.wrapperAccent}\``);
  if (r.checks?.usingAccentSample) lines.push(`- elementos con accent heredado: ${r.checks.usingAccentSample}`);
  if (r.checks?.hardcodes && r.checks.hardcodes.length > 0) {
    lines.push(`- **HARDCODES detectados**:`);
    r.checks.hardcodes.forEach((h) => lines.push(`  - \`${h.pattern}\`: ${h.count}`));
  }
  if (r.errors && r.errors.length > 0) {
    lines.push(`- **Errores consola**:`);
    r.errors.forEach((e) => lines.push(`  - ${e}`));
  }
  if (r.networkErrors && r.networkErrors.length > 0) {
    lines.push(`- **Network errors**:`);
    r.networkErrors.forEach((e) => lines.push(`  - ${e}`));
  }
  if (r.screenshot) lines.push(`- screenshot: \`${r.screenshot}\``);
  lines.push(``);
}

const report = lines.join("\n");
writeFileSync(`${OUT}/audit-modules.md`, report);
console.log(`\n📄 Report: ${OUT}/audit-modules.md`);
console.log(`Total modules: ${results.length}`);
console.log(`✅ OK: ${results.filter((r) => r.status === "✅").length}`);
console.log(`⚠️  Warnings: ${results.filter((r) => r.status === "⚠️").length}`);
console.log(`❌ Failed: ${results.filter((r) => r.status === "❌").length}`);

await browser.close();
