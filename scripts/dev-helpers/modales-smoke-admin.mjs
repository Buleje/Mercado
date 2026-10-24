// Smoke de modales del panel, por el camino del usuario: en cada pestaña abre
// los modales de alta («Nuevo…», «Agregar…», «Crear…», «Registrar…») y mide lo
// que un teclado y un lector de pantalla necesitan:
//
//   · aparece un [role=dialog|alertdialog] con nombre accesible
//   · el foco entra al diálogo
//   · 6 Tab seguidos no se escapan a la pantalla de atrás
//   · Escape lo cierra (o pide confirmación, que también cuenta)
//   · la consola no tira errores de React/runtime al abrir y cerrar
//
// Uso (desde el repo, dev server en :3000):
//   node scripts/dev-helpers/modales-smoke-admin.mjs <out.json> <tab1,tab2,…> [maxPorTab]
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = "http://localhost:3000", SLUG = process.env.SLUG || "main";
const OUT = process.argv[2] || "reports/a11y/modales-smoke.json";
const TABS = (process.argv[3] || "clientes,inventario").split(",");
const MAX = Number(process.argv[4] || 3);
const NOMBRE = /^(\+\s*)?(nuev[oa]|agregar|crear|registrar|añadir|abrir|emitir|programar)\b/i;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
const page = await ctx.newPage();
const errores = [];
page.on("console", (m) => { if (m.type() === "error") errores.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errores.push(`pageerror: ${String(e.message).slice(0, 200)}`));
const login = await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});
if (login.status() !== 200) { console.error("login", login.status()); process.exit(1); }

const filas = [];
for (const tab of TABS) {
  await page.goto(`${BASE}/t/${SLUG}/admin?tab=${tab}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.evaluate((slug) => { try { localStorage.setItem(`onboarding-completed-${slug}`, "1"); } catch {} }, SLUG);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector("main h1, [data-admin-tabbar], [role=\"tabpanel\"]", { timeout: 45_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  try { await page.waitForLoadState("networkidle", { timeout: 10_000 }); } catch {}
  await page.waitForTimeout(800);
  const botones = await page.locator("main button:visible").evaluateAll((els, src) => {
    const re = new RegExp(src, "i");
    return els.map((el, i) => ({ i, nombre: (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40) }))
      .filter((b) => re.test(b.nombre));
  }, NOMBRE.source);

  for (const b of botones.slice(0, MAX)) {
    const antesErr = errores.length;
    const fila = { tab, boton: b.nombre };
    try {
      await page.locator("main button:visible").nth(b.i).click({ timeout: 5000 });
      const dlg = page.locator('[role="dialog"], [role="alertdialog"]').last();
      /* Un botón de alta que no abre diálogo (form en línea, fila nueva) no es
         una falla: se anota y se sigue. */
      if (!(await dlg.waitFor({ timeout: 6000 }).then(() => true).catch(() => false))) {
        fila.noModal = true;
        console.log(`·  ${tab.padEnd(18)} ${b.nombre.padEnd(28)} (no abre diálogo — se omite)`);
        continue;
      }
      await page.waitForTimeout(400);
      Object.assign(fila, await dlg.evaluate((d) => {
        const id = d.getAttribute("aria-labelledby");
        const nombre = d.getAttribute("aria-label") || (id && document.getElementById(id)?.textContent) || "";
        return { nombre: nombre.trim().slice(0, 40), modal: d.getAttribute("aria-modal") === "true" || d.hasAttribute("data-state"), focoDentro: d.contains(document.activeElement) };
      }));
      let escapes = 0;
      for (let k = 0; k < 6; k++) {
        await page.keyboard.press("Tab");
        if (!(await dlg.evaluate((d) => d.contains(document.activeElement)).catch(() => false))) escapes++;
      }
      fila.tabEscapa = escapes;
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      /* Si pidió «¿cerrar sin guardar?», confirmar también es un cierre correcto. */
      const confirmacion = page.locator('[role="alertdialog"]');
      if (await confirmacion.isVisible().catch(() => false)) { fila.pidioConfirmar = true; await page.keyboard.press("Escape"); await page.waitForTimeout(300); }
      fila.escapeCierra = !(await dlg.isVisible().catch(() => false));
      if (!fila.escapeCierra) { await page.goto(`${BASE}/t/${SLUG}/admin?tab=${tab}`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(2000); }
    } catch (e) {
      fila.error = String(e.message).split("\n")[0].slice(0, 90);
    }
    fila.erroresConsola = errores.slice(antesErr).filter((t) => !/Download the React DevTools|favicon|\[HMR\]|Fast Refresh/.test(t));
    const ok = !fila.error && fila.nombre && fila.focoDentro && fila.tabEscapa === 0 && fila.escapeCierra && fila.erroresConsola.length === 0;
    fila.ok = Boolean(ok);
    filas.push(fila);
    console.log(`${ok ? "✅" : "❌"} ${tab.padEnd(18)} ${b.nombre.padEnd(28)} nombre=«${fila.nombre ?? ""}» foco=${fila.focoDentro} tabEscapa=${fila.tabEscapa} esc=${fila.escapeCierra} errores=${fila.erroresConsola.length}${fila.error ? " ERROR " + fila.error : ""}`);
  }
  if (botones.length === 0) console.log(`·  ${tab.padEnd(18)} (sin botones de alta visibles)`);
}
await browser.close();
writeFileSync(OUT, JSON.stringify(filas, null, 2));
const medidos = filas.filter((f) => !f.noModal);
console.log(`\n${medidos.filter((f) => f.ok).length}/${medidos.length} modales OK → ${OUT}`);
