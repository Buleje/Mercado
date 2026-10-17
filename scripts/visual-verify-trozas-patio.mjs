/**
 * Mide y fotografía la vista Trozas del Libro CTP (ADR-336 / rediseño 2026-09-18).
 *
 * Qué comprueba, además de las fotos light/dark a 1280 y 400:
 *   · el alto total de la página en pantallas de scroll;
 *   · que el panorama y la lista cuenten el MISMO conjunto al filtrar por una
 *     especie (`data-conteo="patio"` vs `data-conteo="lista"`);
 *   · que la consola no tenga errores.
 *
 *   node scripts/visual-verify-trozas-patio.mjs [etiqueta]
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BSM_BASE ?? "http://localhost:3000";
const SLUG = "main";
const ETIQUETA = process.argv[2] ?? "despues";
const OUT = `reports/visual-verify/trozas-${ETIQUETA}`;
mkdirSync(OUT, { recursive: true });

const URL_VISTA = `${BASE}/admin?tab=ctp-libro-operaciones&vista=trozas`;

async function nuevaPagina(browser, { tema, width, height }) {
  const context = await browser.newContext({
    viewport: { width, height },
    extraHTTPHeaders: { "x-tenant-id": SLUG },
    colorScheme: tema,
  });
  const page = await context.newPage();
  const errores = [];
  page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
  await page.addInitScript(({ slug, tema }) => {
    try {
      localStorage.setItem(`onboarding-completed-${slug}`, "1");
      if (tema === "dark") sessionStorage.setItem("buleje-theme-session-v2", "dark");
    } catch { /* storage bloqueado */ }
  }, { slug: SLUG, tema });
  const login = await page.request.post(`${BASE}/api/auth/login`, {
    headers: { "content-type": "application/json", "x-tenant-id": SLUG },
    data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
  });
  if (login.status() !== 200) { console.error("Login falló:", login.status(), await login.text()); process.exit(1); }
  return { context, page, errores };
}

async function irYEsperar(page) {
  await page.goto(URL_VISTA, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForFunction(
    () => /piezas/.test(document.body.innerText) && !/Leyendo el patio/.test(document.body.innerText),
    null,
    { timeout: 90_000 },
  ).catch(() => {});
  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    document.querySelectorAll("[data-nextjs-toast], [data-nextjs-dev-tools-button], nextjs-portal").forEach((el) => el.remove());
  });
}

async function medir(page) {
  return page.evaluate(() => {
    const raiz = document.querySelector("[data-vista-trozas]") ?? document.querySelector("main") ?? document.body;
    const txt = (el) => (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    const leer = (q) => document.querySelector(q)?.textContent?.replace(/\s+/g, " ").trim() ?? null;
    return {
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      pantallas: +(document.documentElement.scrollHeight / window.innerHeight).toFixed(2),
      botones: raiz.querySelectorAll("button").length,
      h2: [...raiz.querySelectorAll("h2")].map(txt),
      h3: [...raiz.querySelectorAll("h3")].map(txt),
      h4: [...raiz.querySelectorAll("h4")].map(txt),
      filasTabla: raiz.querySelectorAll("tbody tr").length,
      conteoPatio: leer('[data-conteo="patio"]'),
      conteoLista: leer('[data-conteo="lista"]'),
    };
  });
}

/** Elige la primera especie desde la cabecera de su columna y cruza las cifras. */
async function cruzarFiltroDeEspecie(page) {
  /* Scope al `<thead>`: el MISMO filtro existe dos veces —la cabecera de la
     columna y el campo compacto del teléfono— y el primero del DOM es el del
     teléfono, invisible a 1280 (el clic esperaba 30 s y moría). */
  const summary = page.locator('thead summary[aria-label^="Filtrar por Especie"]').first();
  await summary.click();
  const grupo = page.locator('thead [role="group"][aria-label="Valores de Especie"]').first();
  await grupo.waitFor({ state: "visible", timeout: 10_000 });
  const primera = grupo.locator("label").first();
  const especie = (await primera.textContent())?.replace(/\s+/g, " ").trim() ?? "";
  await primera.locator('input[type="checkbox"]').check();
  await page.waitForTimeout(700);
  await page.keyboard.press("Escape").catch(() => {});
  await page.mouse.click(5, 5);
  await page.waitForTimeout(400);
  const cifras = await page.evaluate(() => ({
    patio: document.querySelector('[data-conteo="patio"]')?.textContent?.trim() ?? null,
    lista: document.querySelector('[data-conteo="lista"]')?.textContent?.replace(/\s+/g, " ").trim() ?? null,
    filas: document.querySelectorAll("tbody tr").length,
  }));
  return { especie, ...cifras };
}

/** Colores reales del bloque héroe: `--accent-soft` pintaba claro en oscuro. */
async function coloresDelHeroe(page) {
  return page.evaluate(() => {
    const kicker = [...document.querySelectorAll("p")].find((p) => /EN PATIO|PARADAS EN PATIO/i.test(p.textContent ?? ""));
    const caja = kicker?.closest("div");
    if (!caja) return null;
    const cs = getComputedStyle(caja);
    return { fondo: cs.backgroundColor, borde: cs.borderColor, textoKicker: getComputedStyle(kicker).color };
  });
}

const browser = await chromium.launch({ headless: true });
const resultados = {};
for (const [tema, width, height] of [["light", 1280, 900], ["dark", 1280, 900], ["light", 400, 900], ["dark", 400, 900]]) {
  const clave = `${tema}-${width}`;
  const { context, page, errores } = await nuevaPagina(browser, { tema, width, height });
  await irYEsperar(page);
  resultados[clave] = { ...(await medir(page)), heroe: await coloresDelHeroe(page), errores };
  await page.screenshot({ path: `${OUT}/trozas-${clave}.png`, fullPage: true });
  if (width === 1280) {
    resultados[clave].filtroEspecie = await cruzarFiltroDeEspecie(page).catch((e) => ({ error: String(e).slice(0, 200) }));
    await page.screenshot({ path: `${OUT}/trozas-${clave}-filtrado.png`, fullPage: true });
  }
  await context.close();
}
await browser.close();
console.log(JSON.stringify(resultados, null, 2));
