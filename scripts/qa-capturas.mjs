#!/usr/bin/env node
/**
 * qa-capturas.mjs — un recorrido conocido del panel en UNA llamada: login,
 * navegar, pasos, y las capturas claro/oscuro × 1280/400 de cada estado.
 *
 * Por qué (medido 2026-09-23): la última prueba de navegador del tester fueron
 * 187 llamadas en 177 tandas y 13 min —39 clics, 28 snapshots, 25 evaluate, 12
 * capturas, 3 resize—, cada una una espera entera del modelo. Un flujo que ya
 * se conoce no necesita que el modelo mire la pantalla entre clic y clic.
 * Para explorar una pantalla nueva sigue estando el MCP de Playwright.
 *
 * Uso:
 *   node scripts/qa-capturas.mjs --tenant <slug> --ruta "/admin?tab=x" \
 *     [--pasos '<json>' | --pasos-archivo pasos.json] [--salida <dir>] \
 *     [--nombre base] [--anchos 1280,400] [--temas claro,oscuro] [--completa]
 *
 * Pasos (array JSON, una clave por paso; los selectores son de Playwright,
 * p. ej. `text=Guardar`, `role=button[name="Dueños"]`, `#id`):
 *   {"click": "<sel>"}            {"llenar": ["<sel>", "texto"]}
 *   {"tecla": "Enter"}            {"elegir": ["<sel>", "valor o etiqueta"]}
 *   {"esperar": "<sel>"}          {"esperar": 500}            (ms)
 *   {"eval": "<expresión js>"}    → su resultado sale en el reporte
 *   {"captura": "nombre"}         → la matriz de capturas de ESTE estado
 * Sin ningún paso «captura», se captura el estado final con --nombre.
 *
 * Cada tema es un recorrido aparte: la clave `buleje-theme-session-v2` se pone
 * ANTES de cargar la página. Cambiar la clase `dark` con la página ya pintada
 * no llega a los modales en portal (medido 23-09: el modal de Dueños salía
 * blanco en la «oscura»). Consecuencia: los pasos corren UNA VEZ POR TEMA — si
 * escriben datos, escriben dos veces (usar QA, o `--temas oscuro`).
 * Cada captura mide el fondo del centro de la pantalla (`fondoCentro`): el
 * tema se mide, no se mira en la miniatura.
 *
 * Sale un JSON: capturas, respuestas ≥400 (con ruta), errores de consola (nº y textos),
 * pageerror, evals y ms.
 * Código 1 si hubo `pageerror` o falló un paso.
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolverChromium } from "./dev-helpers/chromium-path.mjs";

const BASE = process.env.QA_BASE ?? "http://localhost:3000";

function arg(nombre, porDefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : porDefecto;
}
const bandera = (nombre) => process.argv.includes(`--${nombre}`);

const tenant = arg("tenant", "main");
const ruta = arg("ruta", "/admin");
const nombreBase = arg("nombre", "estado");
const hoy = new Date().toISOString().slice(0, 10);
const salida = arg("salida", `reports/visual-verify/${hoy}-qa-capturas`);
const anchos = arg("anchos", "1280,400").split(",").map(Number).filter(Boolean);
const temas = arg("temas", "claro,oscuro").split(",");
const completa = bandera("completa");
const usuario = process.env.QA_USER ?? "qaadmin";
const clave = process.env.QA_PASS ?? "Qa-admin-1234";

let pasos = [];
try {
  const crudo = arg("pasos-archivo") ? readFileSync(arg("pasos-archivo"), "utf8") : arg("pasos", "[]");
  pasos = JSON.parse(crudo);
  if (!Array.isArray(pasos)) throw new Error("los pasos van en un array");
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: `pasos inválidos: ${e.message}` }));
  process.exit(1);
}

const t0 = Date.now();
const chrome = resolverChromium();
if (!chrome) {
  console.log(JSON.stringify({ ok: false, error: "No hay Chromium de Playwright: npx playwright install chromium" }));
  process.exit(1);
}
mkdirSync(salida, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: chrome });
const ctx = await browser.newContext({
  viewport: { width: anchos[0] ?? 1280, height: 900 },
  extraHTTPHeaders: { "x-tenant-id": tenant },
});
// El onboarding tapa el panel y se come los clics. `useOnboardingTrigger` arma
// la clave con `localStorage["active-tenant-slug"] ?? "main"`: en un navegador
// limpio pide la de `main` aunque se entre a otro tenant (medido 23-09).
await ctx.addInitScript((slug) => {
  try {
    if (!localStorage.getItem("active-tenant-slug")) localStorage.setItem("active-tenant-slug", slug);
    localStorage.setItem(`onboarding-completed-${slug}`, "1");
    localStorage.setItem("onboarding-completed-main", "1");
  } catch { /* sin storage */ }
}, tenant);
const page = await ctx.newPage(); // sólo para el login: cada tema abre la suya

const consola = [];
const pageerrors = [];
const evals = [];
const capturas = [];
/** «Failed to load resource: 404» no dice de qué: acá va el método, estado y ruta. */
const respuestas = [];

/** El fondo real del centro: el primer ancestro con fondo casi opaco (un tinte
 *  `bg-primary/10` no dice de qué tema es la superficie de abajo). */
async function fondoCentro(page) {
  return page.evaluate(() => {
    let el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    while (el) {
      const bg = getComputedStyle(el).backgroundColor;
      const alfa = /rgba\([^)]*,\s*([\d.]+)\)$/.exec(bg);
      if (bg && bg !== "transparent" && (!alfa || Number(alfa[1]) >= 0.5)) return bg;
      el = el.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor;
  });
}

async function matriz(page, nombre, t) {
  for (const ancho of anchos) {
    await page.setViewportSize({ width: ancho, height: 900 });
    await page.waitForTimeout(200);
    const archivo = path.join(salida, `${nombre}-${t}-${ancho}.png`);
    if (completa) {
      /* `fullPage: true` estira la ventana EN el disparo: los gráficos de
         recharts se re-miden, reinician la animación y salen con las barras en
         cero (medido 23-09 en Reportes: 13 barras en el DOM, 0 en la foto). Se
         agranda la ventana ANTES y se espera a que terminen de dibujarse. */
      /* El fondo del CONTENIDO, no `scrollHeight`: volviendo de la ventana
         alta de 1280, a 400 medía 8 900 px con 4 000 de contenido (el resto,
         capturas en blanco). Lo `fixed` (barra de abajo, FAB) no cuenta. Se
         espera a que el cambio de ancho se asiente: medido a los 200 ms, la
         vista todavía tenía el largo de la ventana anterior. */
      await page.waitForTimeout(1000);
      const alto = await page.evaluate(() => {
        const total = document.scrollingElement?.scrollHeight ?? document.body.scrollHeight;
        const raiz = document.querySelector("main") ?? document.body;
        let fondo = 0;
        for (const e of raiz.querySelectorAll("*")) {
          const r = e.getBoundingClientRect();
          if (r.height > 0 && getComputedStyle(e).position !== "fixed") fondo = Math.max(fondo, r.bottom + scrollY);
        }
        return fondo > 0 ? Math.min(total, Math.ceil(fondo) + 32) : total;
      });
      await page.setViewportSize({ width: ancho, height: Math.min(Math.max(alto, 900), 12_000) });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: archivo });
    } else {
      await page.screenshot({ path: archivo });
    }
    capturas.push({ archivo, fondoCentro: await fondoCentro(page) });
  }
  await page.setViewportSize({ width: anchos[0] ?? 1280, height: 900 });
}

async function recorrido(t, primero) {
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") consola.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => pageerrors.push(`[${t}] ${String(e?.message ?? e).slice(0, 300)}`));
  page.on("response", (r) => {
    if (r.status() < 400) return;
    const u = new URL(r.url());
    respuestas.push(`${r.status()} ${r.request().method()} ${u.pathname}${u.search.slice(0, 60)}`);
  });
  await page.addInitScript((o) => {
    try { sessionStorage.setItem("buleje-theme-session-v2", o ? "dark" : "light"); } catch { /* ignore */ }
  }, t === "oscuro");
  try {
    await page.goto(`${BASE}${ruta}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => { /* SSE/polling: no se aquieta */ });
    let huboCaptura = false;
    for (const [i, p] of pasos.entries()) {
      const [tipo, valor] = Object.entries(p)[0] ?? [];
      try {
        if (tipo === "click") await page.locator(valor).first().click({ timeout: 15_000 });
        else if (tipo === "llenar") await page.locator(valor[0]).first().fill(String(valor[1]), { timeout: 15_000 });
        else if (tipo === "elegir") await page.locator(valor[0]).first().selectOption(String(valor[1]), { timeout: 15_000 });
        else if (tipo === "tecla") await page.keyboard.press(valor);
        else if (tipo === "esperar") {
          if (typeof valor === "number") await page.waitForTimeout(valor);
          else await page.locator(valor).first().waitFor({ timeout: 30_000 });
        } else if (tipo === "eval") { const v = await page.evaluate(valor); if (primero) evals.push({ paso: i, valor: v }); }
        else if (tipo === "captura") { await matriz(page, valor, t); huboCaptura = true; }
        else throw new Error(`paso desconocido «${tipo}»`);
      } catch (e) {
        // El estado en el que se trabó se captura: sin eso el reporte sólo
        // dice «timeout» y hay que volver a correr todo para ver qué había.
        const archivo = path.join(salida, `falla-${t}-paso-${i}.png`);
        await page.screenshot({ path: archivo }).catch(() => {});
        capturas.push({ archivo });
        throw new Error(`[${t}] paso ${i} (${tipo}): ${String(e?.message ?? e).split("\n")[0]}`);
      }
    }
    if (!huboCaptura) await matriz(page, nombreBase, t);
  } finally {
    await page.close().catch(() => {});
  }
}

let falla = null;
try {
  // Login como la app: la cookie `csrf-token` sale de cualquier GET, y
  // `tenantSlug` va en el body porque `qaadmin` existe en varios tenants.
  if (!bandera("sin-login")) {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const csrf = (await ctx.cookies()).find((c) => c.name === "csrf-token")?.value ?? "";
    const r = await page.request.post(`${BASE}/api/auth/login`, {
      headers: { "content-type": "application/json", "x-tenant-id": tenant, "x-csrf-token": csrf },
      data: { username: usuario, password: clave, tenantSlug: tenant },
    });
    if (r.status() !== 200) throw new Error(`login ${r.status()}: ${(await r.text()).slice(0, 160)}`);
  }
  await page.close();
  for (const [k, t] of temas.entries()) await recorrido(t, k === 0);
} catch (e) {
  falla = String(e?.message ?? e);
} finally {
  await browser.close().catch(() => {});
}

const ok = !falla && pageerrors.length === 0;
console.log(JSON.stringify({ ok, falla, tenant, ruta, capturas, respuestas: [...new Set(respuestas)], consola: consola.length, consolaTextos: [...new Set(consola)].slice(0, 8), pageerrors, evals, ms: Date.now() - t0 }, null, 1));
process.exit(ok ? 0 : 1);
