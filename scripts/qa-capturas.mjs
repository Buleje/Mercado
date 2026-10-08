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
 *     [--nombre base] [--anchos 1280,400] [--temas claro,oscuro] [--completa] \
 *     [--preset cubicador-lote,resumenes-rolliza]   (recorridos de scripts/qa-pasos/, van antes)
 *
 * Pasos (array JSON, una clave por paso; los selectores son de Playwright,
 * p. ej. `text=Guardar`, `role=button[name="Dueños"]`, `#id`):
 *   {"click": "<sel>"}            {"llenar": ["<sel>", "texto"]}
 *   {"abrir": "<sel>"}            → click sólo si su aria-expanded no es "true" (plegables recordados)
 *   {"tecla": "Enter"}            {"elegir": ["<sel>", "valor o etiqueta"]}
 *   {"rueda": [x, y, dy]}         → rueda REAL del mouse en (x, y): prueba scroll bloqueado/libre detrás de un modal
 *   {"trazar": ["<sel>", [[0.1,0.5],[0.5,0.2],[0.9,0.6]]]} → arrastre REAL del mouse por esos puntos (fracción
 *                                   del elemento): firmar en el lienzo de «Firmar recibo» (08-10)
 *   {"esperar": "<sel>"}          {"esperar": 500}            (ms)
 *   {"eval": "<expresión js>"}    → su resultado sale en el reporte
 *   {"captura": "nombre"}         → la matriz de capturas de ESTE estado
 *   {"subir": ["<sel input[type=file]>", "/ruta/archivo.pdf"]} → elige el archivo (03-10: importar el PDF del croquis)
 *   {"fallar": "/api/settings"}   → ese GET responde 500 (o ["/api/x", 503]); {"fallar": null} lo
 *                                   quita. Para probar «la carga falló» (04-10: sin esto fue un
 *                                   parche de fetch + history.back a mano). Recargá con {"eval": "location.reload()"}.
 *   {"parchear": ["/api/x", {...}, "POST"?]} → ese GET (o el método del 3.º) responde 200 con ESE JSON (05-10: tablas forestales sin datos en
 *                                   main; el barrido parcheaba fetch a mano, 3 intentos). Igual que `fallar`: se quita
 *                                   con {"fallar": null} y rige desde la próxima carga ({"eval": "location.reload()"}).
 *   {"clicTexto": "Rolliza"}      → clic por el DOM en el botón/pestaña/opción cuyo texto
 *                                   EMPIEZA con eso (dentro de main o de un diálogo). Para
 *                                   lo que `click` no alcanza: radios segmentados, botones
 *                                   tapados, títulos repetidos en la barra lateral (02-10:
 *                                   6 pasos a mano en una sesión → paso propio).
 *   {"navegar": "/admin?tab=x&vista=y"} → cambia de ruta DENTRO de la misma sesión, sin recargar
 *                                   (history.pushState + popstate, como el router del panel) y espera a que
 *                                   la red quede quieta (tope ~1,5 s). Ej.: {"navegar": "/admin?tab=camaras&vista=personas"}
 *   {"marcar": "<sel input checkbox>"} → .click() por JS sobre el input (las casillas personalizadas no
 *                                   se dejan clicar con Playwright). Ej.: {"marcar": "input[type=checkbox]"}
 *   {"quien": "<sel>"}            → qué componentes de React dibujan ese elemento (del más cercano hacia
 *                                   afuera), al reporte. 08-10: encontrar el dueño del botón «Gráficos»
 *                                   costó 5 grep (el texto venía de un valor por defecto). Ej.: {"quien": "text=Gráficos"}
 *   (`esperar` con selector espera el elemento VISIBLE: ya no se cuelga con un [role=dialog] oculto.)
 * Sin ningún paso «captura», se captura el estado final con --nombre.
 *
 * Nombres de archivo: sin --nombre, cada corrida antepone la hora (`HHMMSS-`) a TODAS las capturas
 * (ya no se pisan entre corridas); con o sin --nombre, si el archivo existe se escribe `-2`, `-3`…
 * Ayuda: `node scripts/qa-capturas.mjs --help` (o `-h`) imprime esta cabecera y sale.
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
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { resolverChromium } from "./dev-helpers/chromium-path.mjs";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  const fuente = readFileSync(new URL(import.meta.url), "utf8");
  const cab = fuente.slice(fuente.indexOf("/**"), fuente.indexOf("*/") );
  console.log(cab.split("\n").map((l) => l.replace(/^\s?\/?\*+ ?/, "")).join("\n").trim());
  process.exit(0);
}

const BASE = process.env.QA_BASE ?? "http://localhost:3000";

function arg(nombre, porDefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : porDefecto;
}
const bandera = (nombre) => process.argv.includes(`--${nombre}`);

const tenant = arg("tenant", "main");
const ruta = arg("ruta", "/admin");
const nombreBase = arg("nombre", "estado");
const sinNombre = !process.argv.includes("--nombre");
const prefijoHora = sinNombre ? new Date().toTimeString().slice(0, 8).replaceAll(":", "") + "-" : "";
const hoy = new Date().toISOString().slice(0, 10);
const salida = arg("salida", `reports/visual-verify/${hoy}-qa-capturas`);
const anchos = arg("anchos", "1280,400").split(",").map(Number).filter(Boolean);
const temas = arg("temas", "claro,oscuro").split(",");
const completa = bandera("completa");
const usuario = process.env.QA_USER ?? "qaadmin";
const clave = process.env.QA_PASS ?? "Qa-admin-1234";

let pasos = [];
try {
  /* `--preset a,b` antepone recorridos guardados en `scripts/qa-pasos/<nombre>.json`
     (sembrar el cubicador se tipeó a mano 6 veces el 03-10: ahora es un preset). */
  const presets = (arg("preset", "") || "").split(",").map((x) => x.trim()).filter(Boolean);
  const dePresets = presets.flatMap((n) => {
    const lista = JSON.parse(readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "qa-pasos", `${n}.json`), "utf8"));
    if (!Array.isArray(lista)) throw new Error(`el preset ${n} no es un array`);
    return lista;
  });
  const crudo = arg("pasos-archivo") ? readFileSync(arg("pasos-archivo"), "utf8") : arg("pasos", "[]");
  pasos = [...dePresets, ...JSON.parse(crudo)];
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

/* El primer control VISIBLE del selector (05-10): la tabla de trozas monta el mismo
   filtro en la cabecera y en un bloque móvil oculto; con `.first()` el paso esperaba
   al oculto hasta el timeout. `subir` sigue con `.first()`: el input de archivo va oculto. */
function visible(page, sel) {
  return page.locator(sel).filter({ visible: true }).first();
}

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
    const base = path.join(salida, `${prefijoHora}${nombre}-${t}-${ancho}`);
    let archivo = `${base}.png`;
    for (let n = 2; existsSync(archivo); n++) archivo = `${base}-${n}.png`;
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

/**
 * «La red se aquietó», sin contar las conexiones que NO terminan nunca.
 *
 * El panel abre dos SSE (`/api/admin/sse`, `/api/admin/notifications/stream`)
 * que quedan abiertos: `waitForLoadState("networkidle")` no llegaba jamás y
 * cada recorrido quemaba sus 30 s de tope enteros — 60 s por llamada con los
 * dos temas (medido 2026-09-25: la vista montada a los 7,5 s, «networkidle»
 * TIMEOUT a los 30). Acá se cuentan los pedidos en vuelo salvo los
 * `eventsource`/streams, y se sigue cuando van `quieto` ms sin ninguno.
 */
function vigilarRed(page) {
  const enVuelo = new Set();
  let ultimo = Date.now();
  const esStream = (r) => r.resourceType() === "eventsource" || /\/(sse|stream)(\/|\?|$)/.test(new URL(r.url()).pathname);
  page.on("request", (r) => { if (!esStream(r)) { enVuelo.add(r); ultimo = Date.now(); } });
  const fin = (r) => { if (enVuelo.delete(r)) ultimo = Date.now(); };
  page.on("requestfinished", fin);
  page.on("requestfailed", fin);
  return async function esperarQuietud({ quieto = 800, tope = 30_000 } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < tope) {
      if (enVuelo.size === 0 && Date.now() - ultimo >= quieto) return true;
      await page.waitForTimeout(100);
    }
    return false;
  };
}

async function recorrido(t, primero) {
  const page = await ctx.newPage();
  const esperarQuietud = vigilarRed(page);
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
    await esperarQuietud();
    let huboCaptura = false;
    for (const [i, p] of pasos.entries()) {
      const [tipo, valor] = Object.entries(p)[0] ?? [];
      try {
        if (tipo === "click") await visible(page, valor).click({ timeout: 15_000 });
        else if (tipo === "abrir") {
          /* Como click, pero sólo si está cerrado (aria-expanded ≠ true): un plegable que se
             recuerda abierto se cerraba con el click del segundo tema (05-10, indicadores). */
          const el = visible(page, valor);
          if ((await el.getAttribute("aria-expanded", { timeout: 15_000 })) !== "true") await el.click({ timeout: 15_000 });
        }
        else if (tipo === "clicTexto") {
          /* Espera como `click` (hasta 15 s): las vistas del panel cargan por partes. Sólo
             MARCA el botón; el clic lo hace Playwright, porque el .click() del DOM no dispara
             el mousedown con que se activan las pestañas (Radix). */
          const marcado = await page
            .waitForFunction(
              (t) => {
                const raiz = [...document.querySelectorAll("main, [role=dialog], [role=alertdialog], [role=menu], [role=listbox]")];
                const cands = raiz.flatMap((r) => [...r.querySelectorAll("button, [role=tab], [role=radio], [role=option], [role=menuitem], a, label")]);
                const b = cands.find((x) => (x.innerText ?? "").trim() === t) ?? cands.find((x) => (x.innerText ?? "").trim().startsWith(t));
                if (!b) return false;
                document.querySelectorAll("[data-qa-clic]").forEach((x) => x.removeAttribute("data-qa-clic"));
                b.setAttribute("data-qa-clic", "1");
                return true;
              },
              String(valor),
              { timeout: 15_000 },
            )
            .then(() => true)
            .catch(() => false);
          if (!marcado) throw new Error(`clicTexto: no hay botón que empiece con «${valor}»`);
          /* Clic normal (espera a que nada lo tape); sólo si no puede, el del DOM —
             con `force` el clic caía en lo que estuviera encima y la pestaña no cambiaba. */
          const objetivo = page.locator('[data-qa-clic="1"]').first();
          await objetivo.click({ timeout: 10_000 }).catch(() => objetivo.evaluate((el) => el.click()));
        }
        else if (tipo === "llenar") await visible(page, valor[0]).fill(String(valor[1]), { timeout: 15_000 });
        else if (tipo === "elegir") await visible(page, valor[0]).selectOption(String(valor[1]), { timeout: 15_000 });
        else if (tipo === "subir") await page.locator(valor[0]).first().setInputFiles(String(valor[1]), { timeout: 15_000 });
        else if (tipo === "fallar") {
          if (valor == null) await page.unrouteAll({ behavior: "ignoreErrors" });
          else {
            const [ruta, status = 500] = Array.isArray(valor) ? valor : [valor, 500];
            await page.route((u) => u.pathname === ruta, (r) =>
              r.request().method() === "GET"
                ? r.fulfill({ status, contentType: "application/json", body: "{}" })
                : r.fallback());
          }
        }
        else if (tipo === "parchear") {
          const [ruta, json, metodo = "GET"] = valor;
          await page.route((u) => u.pathname === ruta, (r) =>
            r.request().method() === metodo
              ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(json) })
              : r.fallback());
        }
        else if (tipo === "tecla") await page.keyboard.press(valor);
        else if (tipo === "rueda") {
          /* `window.scrollTo` mueve la página aunque un modal bloquee el scroll (overflow
             hidden lo permite por programa): sólo la rueda de verdad dice si el usuario puede. */
          const [x, y, dy] = valor;
          await page.mouse.move(x, y);
          await page.mouse.wheel(0, dy);
          await page.waitForTimeout(500);
        }
        else if (tipo === "trazar") {
          /* Mouse REAL (down → moves → up) sobre un lienzo: firmar en `LienzoFirma`.
             Los puntos van en fracción del elemento (0-1), así sirve en 1280 y en 400.
             Pointer events sintéticos no alcanzan: `setPointerCapture` los rechaza (08-10). */
          const [sel, puntos] = valor;
          const caja = await page.locator(sel).first().boundingBox();
          if (!caja) throw new Error(`trazar: no se ve ${sel}`);
          const xy = ([fx, fy]) => [caja.x + fx * caja.width, caja.y + fy * caja.height];
          await page.mouse.move(...xy(puntos[0]));
          await page.mouse.down();
          for (const pt of puntos.slice(1)) await page.mouse.move(...xy(pt), { steps: 6 });
          await page.mouse.up();
        }
        else if (tipo === "esperar") {
          if (typeof valor === "number") await page.waitForTimeout(valor);
          else await visible(page, valor).waitFor({ state: "visible", timeout: 30_000 });
        }
        else if (tipo === "navegar") {
          await page.evaluate((r) => { history.pushState({}, "", r); dispatchEvent(new PopStateEvent("popstate")); }, String(valor));
          await esperarQuietud({ quieto: 500, tope: 1500 });
        }
        else if (tipo === "marcar") await visible(page, valor).evaluate((el) => el.click()); else if (tipo === "eval") { const v = await page.evaluate(valor); if (primero) evals.push({ paso: i, valor: v }); }
        else if (tipo === "quien") {
          const v = await visible(page, valor).evaluate((el) => {
            const clave = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
            const nombres = [];
            for (let f = clave ? el[clave] : null; f && nombres.length < 8; f = f.return) {
              const ty = f.type;
              if (!ty || typeof ty === "string") continue;
              const n = ty.displayName || ty.name || ty.render?.name || ty.type?.displayName || ty.type?.name;
              if (n && n !== nombres[nombres.length - 1]) nombres.push(n);
            }
            return nombres.length ? nombres.join(" ← ") : "sin fiber de React (¿build de producción?)";
          });
          if (primero) evals.push({ paso: i, valor: v });
        }
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
    // La cookie sale de `/api/health` (0,7 s) y no de cargar la portada: `/`
    // compila y pinta el marketplace entero (5-6 s en el navegador, medido
    // 2026-09-25) sólo para sembrar una cookie. Mismo `ctx`: el Set-Cookie de
    // `page.request` queda en el contexto.
    /* Hasta 3 intentos (05-10): con varios agentes compilando, el dev tarda >60 s o se está
       reiniciando tras earlyoom; cortar al primer timeout tiraba la corrida entera. */
    for (let intento = 1; ; intento++) {
      try { await page.request.get(`${BASE}/api/health`, { timeout: 60_000 }); break; }
      catch (e) { if (intento >= 3) throw e; await page.waitForTimeout(10_000); }
    }
    const csrf = (await ctx.cookies()).find((c) => c.name === "csrf-token")?.value ?? "";
    const r = await page.request.post(`${BASE}/api/auth/login`, {
      headers: { "content-type": "application/json", "x-tenant-id": tenant, "x-csrf-token": csrf },
      data: { username: usuario, password: clave, tenantSlug: tenant },
    });
    if (r.status() !== 200) throw new Error(`login ${r.status()}: ${(await r.text()).slice(0, 160)}`);
  }
  await page.close();
  // Los temas van en serie a propósito: en paralelo (probado 2026-09-25)
  // bajaba sólo 42 → 37 s — el cuello es el dev server, no el navegador — y
  // con pasos que guardan escribirían dos veces a la vez.
  for (const [k, t] of temas.entries()) await recorrido(t, k === 0);
} catch (e) {
  falla = String(e?.message ?? e);
} finally {
  await browser.close().catch(() => {});
}

const ok = !falla && pageerrors.length === 0;
console.log(JSON.stringify({ ok, falla, tenant, ruta, capturas, respuestas: [...new Set(respuestas)], consola: consola.length, consolaTextos: [...new Set(consola)].slice(0, 8), pageerrors, evals, ms: Date.now() - t0 }, null, 1));
process.exit(ok ? 0 : 1);
