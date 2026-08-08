#!/usr/bin/env node
/**
 * Barrido de errores de RUNTIME sobre el panel admin y las rutas públicas.
 *
 * Existe porque hay una familia de bugs que los gates estáticos no ven:
 * `tsc`, `eslint` y `vitest` pasaron los tres en verde mientras la consola del
 * panel escupía cuatro errores de hidratación por un `<ul>` dentro de un `<p>`
 * (2026-08-08). El tipo no modela el HTML, y el test no abre el navegador.
 *
 * Carga cada ruta de verdad, con sesión, y mira DOS cosas:
 *   1. Anidado HTML inválido en el DOM ya renderizado — la contraparte en vivo
 *      de `scripts/check-html-nesting.mjs`, que lo detecta en el código.
 *   2. Errores y warnings de consola que no sean ruido conocido.
 *
 * Uso:
 *   node scripts/check-runtime-errors.mjs              # 56 tabs del admin
 *   node scripts/check-runtime-errors.mjs --rutas      # rutas públicas
 *   node scripts/check-runtime-errors.mjs --todo       # las dos cosas
 *   node scripts/check-runtime-errors.mjs --tabs ctp-libro-operaciones,pedidos
 *   node scripts/check-runtime-errors.mjs --json out.json
 *
 * OJO: no corras esto mientras editás. Un archivo a medio guardar hace que
 * Turbopack reporte su error de compilación como si fuera del tab que tocaba
 * en ese momento — pasó, y al re-correrlo estaba limpio.
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const BASE = process.env.BSM_BASE_URL ?? "http://localhost:3000";
const SLUG = process.env.BSM_TENANT ?? "main";
const USER = process.env.BSM_QA_USER ?? "qaadmin";
const PASS = process.env.BSM_QA_PASS ?? "Qa-admin-1234";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const valor = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : null;
};

const RUTAS_PUBLICAS = [
  "/marketplace",
  "/marketplace/explorar",
  `/marketplace/${SLUG}`,
  "/marketplace/como-pagar",
  "/checkout",
  "/checkout/entrega",
  "/superadmin",
  "/superadmin/control-center",
  `/t/${SLUG}`,
  "/marketplace/repartidor",
  "/ayuda",
];

/**
 * Ruido que no es un bug del código: recursos de terceros, PWA, HMR y los
 * fetch que el propio barrido aborta al navegar a la ruta siguiente.
 */
const RUIDO =
  /Failed to load resource|beforeinstallprompt|React DevTools|Fast Refresh|Instrumentation Hook|\[HMR\]|Download the React|Failed to fetch|net::ERR_ABORTED|was detected as the Largest Contentful Paint/;

/** Corre en el navegador: devuelve el anidado inválido que quedó en el DOM. */
const SONDA = () => {
  const fallas = [];
  document.querySelectorAll("p").forEach((p) => {
    p.querySelectorAll("div,ul,ol,li,details,table,section,form,pre,h1,h2,h3,h4,h5,h6,p").forEach((b) => {
      fallas.push(`<${b.tagName.toLowerCase()}> dentro de <p class="${p.className.slice(0, 40)}">`);
    });
  });
  document
    .querySelectorAll("button button, button a, a a, a button, button input, button select, button textarea")
    .forEach((el) => {
      const padre = el.parentElement?.closest("button,a");
      fallas.push(`<${el.tagName.toLowerCase()}> dentro de <${padre?.tagName.toLowerCase() ?? "?"}>`);
    });
  return [...new Set(fallas)];
};

function tabsDelRepo() {
  const src = readFileSync("app/admin/_lib/tabs.types.ts", "utf8");
  const m = src.match(/export const VALID_TABS[^=]*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!m) throw new Error("No pude leer VALID_TABS de app/admin/_lib/tabs.types.ts");
  return [...m[1].matchAll(/"([a-z0-9-]+)"/g)].map((x) => x[1]);
}

async function main() {
  const tabsArg = valor("--tabs");
  const hacerTabs = !flag("--rutas") || flag("--todo");
  const hacerRutas = flag("--rutas") || flag("--todo");

  const destinos = [];
  if (hacerTabs) {
    const tabs = tabsArg ? tabsArg.split(",") : tabsDelRepo();
    destinos.push(...tabs.map((t) => ({ nombre: `tab:${t}`, url: `/t/${SLUG}/admin?tab=${t}` })));
  }
  if (hacerRutas) {
    destinos.push(...RUTAS_PUBLICAS.map((r) => ({ nombre: r, url: r })));
  }

  const browser = await chromium.launch({ headless: true });
  /**
   * SIN `extraHTTPHeaders` a nivel contexto. Playwright los manda en TODAS las
   * requests, también las cross-origin: `x-tenant-id` viajaba a
   * fonts.gstatic.com, Google rechazaba el preflight y el barrido reportaba
   * "fuentes bloqueadas por CORS" como si fuera un bug del sitio. Era la
   * herramienta mintiendo. El tenant ya viaja en la URL (`/t/<slug>/…`) y en
   * el login de abajo, que es el único request que de verdad lo necesita.
   */
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const login = await page.request.post(`${BASE}/api/auth/login`, {
    headers: { "content-type": "application/json", "x-tenant-id": SLUG },
    // tenantSlug explícito: qaadmin existe en varios tenants y sin scope el
    // login devuelve el selector de tienda, no la sesión.
    data: { username: USER, password: PASS, tenantSlug: SLUG },
  });
  if (login.status() !== 200) {
    console.error(`✖ Login falló (${login.status()}). ¿Está levantado el dev server en ${BASE}?`);
    process.exit(2);
  }

  const resultados = [];
  for (let i = 0; i < destinos.length; i++) {
    const { nombre, url } = destinos[i];
    const consola = [];
    const onMsg = (m) => {
      const t = m.type();
      if (t !== "error" && t !== "warning") return;
      const txt = m.text().replace(/\[\d+m/g, "").slice(0, 200);
      if (!RUIDO.test(txt)) consola.push(`[${t}] ${txt}`);
    };
    const onErr = (e) => consola.push(`[pageerror] ${String(e).slice(0, 200)}`);
    page.on("console", onMsg);
    page.on("pageerror", onErr);

    let fallas = [];
    try {
      await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.evaluate(
        (slug) => {
          try {
            localStorage.setItem(`onboarding-completed-${slug}`, "1");
          } catch {}
        },
        SLUG,
      );
      await page.waitForTimeout(4500);
      fallas = await page.evaluate(SONDA);
    } catch (e) {
      consola.push(`[nav] ${String(e).slice(0, 150)}`);
    }

    page.off("console", onMsg);
    page.off("pageerror", onErr);

    const sucio = fallas.length > 0 || consola.length > 0;
    resultados.push({ destino: nombre, fallas, consola });
    console.log(
      `${sucio ? "SUCIO" : "  ok "} ${String(i + 1).padStart(3)}/${destinos.length} ${nombre}` +
        (sucio ? ` — ${fallas.length} anidado, ${consola.length} consola` : ""),
    );
  }

  await browser.close();

  const salida = valor("--json");
  if (salida) writeFileSync(salida, JSON.stringify(resultados, null, 1));

  const sucios = resultados.filter((r) => r.fallas.length || r.consola.length);
  console.log(`\n===== ${sucios.length} de ${destinos.length} con hallazgos =====`);
  for (const r of sucios) {
    console.log(`\n### ${r.destino}`);
    r.fallas.forEach((f) => console.log(`   ANIDADO  ${f}`));
    r.consola.forEach((c) => console.log(`   CONSOLA  ${c}`));
  }
  // Informativo, no bloqueante: hay ruido de entorno (red, terceros) que no se
  // puede filtrar del todo, y un gate que grita en falso se empieza a ignorar.
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
