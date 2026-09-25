#!/usr/bin/env node
/**
 * medir-orden-admin.mjs — mide el DESORDEN de cada pestaña del panel.
 *
 * Nació del pedido de Brandon (2026-09-19): «aplicá esa ley en general en
 * admin: sin componentes dispersos que hacen que sea complicado y difícil de
 * usar». No se pueden rediseñar 62 pestañas a ojo; se miden, se ordenan por lo
 * mal que están, y se atacan de la peor a la mejor. La ley vive en
 * `.claude/rules/ui-components.md` («Organización de una vista»).
 *
 * Qué mide, dentro del contenido (el shell —barra lateral y superior— no cuenta):
 *   pantallas   scrollHeight / alto de ventana, con todo en su estado por defecto
 *   titulos     cuántos h2/h3/h4 hay y si alguno MANDA (sin h2, ninguno manda)
 *   botones     botones visibles con texto (los de sólo ícono no suman ruido)
 *   tablas      cuántas <table> visibles hay en la misma pantalla
 *   ayuda       palabras de texto corrido a la vista (párrafos de 6+ palabras
 *               fuera de tablas, botones y popovers): subtítulos, consejos y
 *               notas que van en un ⓘ (`InfoTip`) — Brandon 2026-09-24,
 *               «mucho texto por todos lados».
 *   gemelos     pares de títulos casi iguales («El patio, troza por troza» vs
 *               «El patio, pieza por pieza»: el síntoma que destapó todo esto)
 *
 * El puntaje suma cuánto se pasa cada cifra del umbral de la ley. 0 = en regla.
 *
 * Uso:
 *   node scripts/medir-orden-admin.mjs                 # las 62 pestañas del router
 *   node scripts/medir-orden-admin.mjs pedidos plata   # sólo esas
 *   ANCHO=1650 node scripts/medir-orden-admin.mjs      # otra resolución
 *
 * Necesita el dev server arriba y el usuario de QA (`qaadmin`, tenant `main`).
 * Tarda ~12 s por pestaña: correr en background, no en un turno que espera.
 */

import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const BASE = process.env.DEV_BASE ?? "http://localhost:3000";
const ANCHO = Number(process.env.ANCHO ?? 1280);
const ALTO = Number(process.env.ALTO ?? 900);
const ESPERA_MS = Number(process.env.ESPERA_MS ?? 9000);

/* Los umbrales de la ley (ui-components.md). Un número por regla, para que
   cambiar la ley sea cambiar una línea y no buscarla en el código. */
const LEY = { pantallas: 2.5, botones: 25, tablas: 3, titulosSinJerarquia: 5, ayuda: 60 };

/** Las pestañas que resuelve el router del admin — la fuente es el propio código,
 *  no una lista escrita a mano que se desactualiza. */
async function pestanasDelRouter() {
  const src = await readFile(new URL("../app/admin/_components/TabRouter.tsx", import.meta.url), "utf8");
  return [...new Set([...src.matchAll(/tab === ['"]([a-z0-9-]+)['"]/g)].map((m) => m[1]))].sort();
}

/** Similitud de Jaccard sobre palabras: dos títulos que comparten casi todo. */
function gemelos(titulos) {
  const norm = (t) => new Set(t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2));
  const pares = [];
  for (let i = 0; i < titulos.length; i++) {
    for (let j = i + 1; j < titulos.length; j++) {
      const a = norm(titulos[i]);
      const b = norm(titulos[j]);
      if (a.size < 2 || b.size < 2) continue;
      const inter = [...a].filter((w) => b.has(w)).length;
      const jac = inter / new Set([...a, ...b]).size;
      if (jac >= 0.6 && titulos[i] !== titulos[j]) pares.push([titulos[i], titulos[j]]);
    }
  }
  return pares;
}

function puntaje(m) {
  let p = 0;
  if (m.pantallas > LEY.pantallas) p += (m.pantallas - LEY.pantallas) * 10;
  if (m.botones > LEY.botones) p += (m.botones - LEY.botones) * 0.5;
  if (m.tablas > LEY.tablas) p += (m.tablas - LEY.tablas) * 5;
  if ((m.ayuda ?? 0) > LEY.ayuda) p += (m.ayuda - LEY.ayuda) * 0.1;
  const planos = m.h3 + m.h4;
  if (m.h2 === 0 && planos > LEY.titulosSinJerarquia) p += (planos - LEY.titulosSinJerarquia) * 2;
  p += m.gemelos.length * 8;
  return Math.round(p * 10) / 10;
}

async function main() {
  const pedidas = process.argv.slice(2);
  const pestanas = pedidas.length > 0 ? pedidas : await pestanasDelRouter();
  console.log(`📐 midiendo el orden de ${pestanas.length} pestañas a ${ANCHO}×${ALTO}\n`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: ANCHO, height: ALTO } });
  const page = await ctx.newPage();
  const login = await page.request.post(`${BASE}/api/auth/login`, {
    data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: "main" },
  });
  if (!login.ok()) {
    console.error(`❌ login falló (${login.status()}): ¿dev server arriba? ¿existe qaadmin?`);
    process.exit(1);
  }
  await page.addInitScript(() => {
    try {
      localStorage.setItem("onboarding-completed-main", "1");
    } catch {
      /* sin storage: el onboarding puede tapar la pantalla, pero se mide igual */
    }
  });

  const filas = [];
  for (const tab of pestanas) {
    try {
      await page.goto(`${BASE}/admin?tab=${tab}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.waitForTimeout(ESPERA_MS);
      const m = await page.evaluate(() => {
        const main = document.querySelector("main") ?? document.body;
        const visibles = (sel) => [...main.querySelectorAll(sel)].filter((e) => e.offsetParent !== null);
        const heads = visibles("h2,h3,h4");
        return {
          pantallas: +(document.documentElement.scrollHeight / window.innerHeight).toFixed(2),
          h2: heads.filter((h) => h.tagName === "H2").length,
          h3: heads.filter((h) => h.tagName === "H3").length,
          h4: heads.filter((h) => h.tagName === "H4").length,
          titulos: heads.map((h) => (h.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60)).filter(Boolean),
          botones: visibles("button").filter((b) => (b.textContent ?? "").trim().length > 2).length,
          tablas: visibles("table").length,
          /* Texto corrido a la vista: lo que debería vivir en un ⓘ. */
          ayuda: visibles("p")
            .filter((e) => !e.closest("table,button,[role=tooltip],[role=dialog],[role=menu],label,nav,[role=tablist]"))
            .map((e) => (e.innerText ?? "").trim().split(/\s+/).filter(Boolean).length)
            .filter((n) => n >= 6)
            .reduce((a, n) => a + n, 0),
        };
      });
      const fila = { tab, ...m, gemelos: gemelos(m.titulos) };
      fila.puntaje = puntaje(fila);
      filas.push(fila);
      const marca = fila.puntaje === 0 ? "✅" : fila.puntaje < 10 ? "🟡" : "🔴";
      console.log(
        `${marca} ${String(fila.puntaje).padStart(5)}  ${tab.padEnd(26)} ${String(m.pantallas).padStart(5)} pant · ${String(m.botones).padStart(3)} bot · ${m.tablas} tab · ${String(m.ayuda).padStart(4)} pal. ayuda · h2/h3/h4 ${m.h2}/${m.h3}/${m.h4}${fila.gemelos.length ? ` · ${fila.gemelos.length} gemelos` : ""}`,
      );
    } catch (err) {
      filas.push({ tab, error: String(err).slice(0, 160), puntaje: -1 });
      console.log(`❌   err  ${tab.padEnd(26)} ${String(err).slice(0, 80)}`);
    }
  }
  await browser.close();

  filas.sort((a, b) => b.puntaje - a.puntaje);
  await mkdir(new URL("../reports/orden-admin/", import.meta.url), { recursive: true });
  const salida = new URL(`../reports/orden-admin/orden-${ANCHO}.json`, import.meta.url);
  await writeFile(salida, JSON.stringify({ medido: new Date().toISOString(), ancho: ANCHO, ley: LEY, filas }, null, 2));

  const mal = filas.filter((f) => f.puntaje > 0);
  console.log(`\n─────────────────────────────────`);
  console.log(`${filas.length} pestañas · ${mal.length} fuera de la ley · ${filas.filter((f) => f.puntaje === 0).length} en regla`);
  console.log(`Las 10 peores: ${mal.slice(0, 10).map((f) => f.tab).join(", ")}`);
  console.log(`Detalle: ${salida.pathname}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
