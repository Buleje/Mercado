#!/usr/bin/env node
/**
 * audit-contraste-admin — mide el contraste REAL de los textos del panel admin.
 *
 * Por qué un script y no una regla de lint: el contraste de un texto no está en
 * su clase, está en el píxel. `--text-tertiary` cumple sobre una superficie y
 * falla sobre otra; un token con alfa depende de todo lo que tenga debajo. La
 * única medición honesta es abrir la página y leer el color pintado.
 *
 * Dos cosas que este script hace y un cálculo a mano no puede:
 *   1. `oklch()` — resolverlo a mano da ratios falsos (medido: 1.2 donde había
 *      4.27). Acá se pinta en un canvas 1×1 y se lee el píxel.
 *   2. Los ALFAS — un `bg-x/12` sobre otro `bg-y/50` sobre el body no es
 *      ninguno de los tres: se apilan todas las capas en orden y se lee el
 *      resultado.
 *
 * Uso:
 *   node scripts/audit-contraste-admin.mjs                  # tabs por defecto
 *   node scripts/audit-contraste-admin.mjs ctp-libro-operaciones inventario
 *
 * Requiere el dev server arriba y el admin de QA (`qaadmin` / `Qa-admin-1234`).
 * NO corrige nada: reporta para decidir.
 */

import { chromium } from "playwright";

const BASE = process.env.BSM_BASE_URL ?? "http://localhost:3000";
const USER = process.env.BSM_QA_USER ?? "qaadmin";
const PASS = process.env.BSM_QA_PASS ?? "Qa-admin-1234";
const TENANT = process.env.BSM_QA_TENANT ?? "main";

/** Los tabs que más texto denso tienen: es donde el contraste importa. */
const TABS_DEFAULT = [
  "ctp-libro-operaciones",
  "inventario",
  "ventas-caja",
  "adelantos",
  "pedidos",
];

const TEMAS = ["light", "dark"];

/** Se inyecta en la página: mide todo nodo con texto propio dentro del <main>. */
function medirEnPagina() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  const pintar = (colores) => {
    ctx.clearRect(0, 0, 1, 1);
    for (const c of colores) { ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); }
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
    return +((l1 + 0.05) / (l2 + 0.05)).toFixed(2);
  };

  const base = getComputedStyle(document.body).backgroundColor || "rgb(255,255,255)";
  /**
   * Todas las capas de fondo, de la más lejana a la más cercana: los alfas se
   * apilan. Devuelve además si el resultado es CONFIABLE: un degradado o una
   * imagen de fondo no se puede leer con `backgroundColor` —queda
   * `transparent`— y la medición terminaría usando el fondo del padre, que
   * reporta blanco sobre blanco en un botón que en pantalla es teal. Un solo
   * rojo falso enseña a ignorar la lista entera.
   */
  const fondoDe = (el) => {
    const capas = [];
    let pintado = false;
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none") pintado = true;
      const bg = cs.backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") capas.unshift(bg);
    }
    return { color: pintar([base, ...capas]), confiable: !pintado };
  };

  const raiz = document.querySelector("main") ?? document.body;
  const vistos = new Map();
  for (const el of raiz.querySelectorAll("*")) {
    const texto = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    if (!texto) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.1) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;

    const size = parseFloat(cs.fontSize);
    const peso = parseInt(cs.fontWeight, 10) || 400;
    // WCAG: "large text" = 24px, o 18.66px en negrita. Umbral 3:1 en vez de 4.5:1.
    const grande = size >= 24 || (size >= 18.66 && peso >= 700);
    const umbral = grande ? 3 : 4.5;
    const fondo = fondoDe(el);
    const valor = ratio(pintar([cs.color]), fondo.color);
    if (valor >= umbral) continue;

    /* Se agrupa por (color, tamaño, clase): 200 filas de tabla con el mismo
       token son UN problema, no doscientos. */
    const clave = `${cs.color}|${size}|${peso}|${String(el.className).slice(0, 60)}`;
    const y = vistos.get(clave);
    if (y) {
      y.veces += 1;
      // Se guarda el PEOR de los casos: es el que hay que arreglar.
      if (valor < y.ratio) { y.ratio = valor; y.muestra = texto.slice(0, 48); }
    } else {
      vistos.set(clave, {
        veces: 1, ratio: valor, umbral, size: +size.toFixed(1), peso,
        color: cs.color, clase: String(el.className).slice(0, 70),
        muestra: texto.slice(0, 48), confiable: fondo.confiable,
      });
    }
  }
  return [...vistos.values()].sort((a, b) => a.ratio - b.ratio);
}

async function main() {
  const tabs = process.argv.slice(2).length ? process.argv.slice(2) : TABS_DEFAULT;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();

  // Login una vez: la sesión vale para todos los tabs.
  await page.goto(`${BASE}/t/${TENANT}/admin/login`, { waitUntil: "domcontentloaded" });
  const usuario = page.getByRole("textbox", { name: "Usuario" });
  await usuario.waitFor({ state: "visible" });
  /* ⚠️ `fill()` antes de que React hidrate escribe en un input que todavía no
     es controlado: el DOM muestra el texto, el estado del form queda vacío y el
     submit no se habilita NUNCA. Escribir tecla por tecla dispara los eventos
     que React sí escucha, y el `click` previo asegura que ya haya listener. */
  await page.waitForTimeout(1200);
  await usuario.click();
  await usuario.pressSequentially(USER, { delay: 15 });
  const clave = page.getByRole("textbox", { name: "Contraseña" });
  await clave.click();
  await clave.pressSequentially(PASS, { delay: 15 });

  const entrar = page.getByRole("button", { name: "Entrar al panel" });
  await page.waitForFunction(
    () => ![...document.querySelectorAll("button[type=submit]")].every((b) => b.disabled),
    { timeout: 15_000 },
  );
  await entrar.click();
  /* Una cuenta puede existir en varias tiendas: entonces el login no navega,
     muestra un selector. Se espera lo que pase primero. */
  const elegirTienda = page.getByRole("button", { name: new RegExp(`\\b${TENANT}\\b`) }).first();
  await Promise.race([
    elegirTienda.waitFor({ state: "visible", timeout: 20_000 }).then(() => elegirTienda.click()),
    page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20_000, waitUntil: "commit" }),
  ]).catch(() => { /* la que pierda la carrera SIEMPRE rechaza: el error real lo da el waitForURL de abajo */ });

  /* ⚠️ `/\/admin/` matchea TAMBIÉN `/admin/login`: con esa espera el script daba
     el login por exitoso, seguía navegando y terminaba midiendo la landing
     pública con el nombre de un tab del panel. Excluir login es la diferencia
     entre auditar el panel y auditar otra página con el nombre del panel. */
  await page.waitForURL((u) => /\/admin/.test(u.pathname) && !/\/login/.test(u.pathname), {
    timeout: 30_000, waitUntil: "commit",
  });
  console.log(`✓ sesión iniciada — ${page.url()}`);

  /* Sin esto el shell abre el tour de bienvenida y se queda en la portada: el
     script mediría Inicio creyendo que abrió el tab pedido. */
  await page.evaluate((slug) => {
    localStorage.setItem(`onboarding-completed-${slug}`, "1");
    localStorage.setItem("onboarding-completed", "1");
  }, TENANT);

  const informe = [];
  for (const tema of TEMAS) {
    await page.evaluate((t) => {
      sessionStorage.setItem("buleje-theme-session-v2", t);
      localStorage.setItem("theme", t);
    }, tema);
    const huellas = new Map();
    for (const tab of tabs) {
      /* El `#hash` no es decorativo: sin él el shell puede quedarse en la
         portada, y entonces se estaría midiendo Inicio con el nombre de otro
         tab —un informe que dice haber auditado algo que no abrió—. */
      await page.goto(`${BASE}/t/${TENANT}/admin?tab=${tab}#${tab}`, { waitUntil: "domcontentloaded" });
      // El admin monta por partes (`next/dynamic`): se espera contenido real.
      await page.waitForFunction(() => (document.querySelector("main")?.innerText ?? "").length > 400, { timeout: 45_000 })
        .catch(() => { /* un tab con poco texto se mide igual; la huella de abajo detecta si no cargó */ });
      await page.waitForTimeout(4000);

      /* Huella del contenido: si dos tabs miden lo MISMO, el segundo nunca
         cargó. Se avisa en vez de publicar dos informes idénticos. */
      const huella = await page.evaluate(() => {
        const t = (document.querySelector("main")?.innerText ?? "").slice(0, 3000);
        let h = 0;
        for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
        return `${h}:${t.length}`;
      });
      const gemelo = huellas.get(huella);
      if (gemelo) console.log(`\n⚠️  ${tab} · ${tema} — mide IGUAL que «${gemelo}»: el tab no cargó, se omite`);
      huellas.set(huella, tab);

      if (gemelo) continue;
      const todos = await page.evaluate(medirEnPagina);
      const fallos = todos.filter((f) => f.confiable);
      const dudosos = todos.filter((f) => !f.confiable);
      informe.push({ tema, tab, fallos, dudosos });
      const total = fallos.reduce((a, f) => a + f.veces, 0);
      console.log(`\n── ${tab} · ${tema} — ${fallos.length} casos medidos (${total} nodos)` +
        (dudosos.length ? ` · ${dudosos.length} sobre degradado, no medibles` : ""));
      for (const f of fallos.slice(0, 8)) {
        console.log(`   ${String(f.ratio).padStart(5)}:1  (mín ${f.umbral})  ${String(f.size).padStart(4)}px  ×${f.veces}  «${f.muestra}»`);
        console.log(`          ${f.color}  ${f.clase}`);
      }
      if (fallos.length > 8) console.log(`   … y ${fallos.length - 8} casos más`);
    }
  }

  const totalCasos = informe.reduce((a, i) => a + i.fallos.length, 0);
  const totalDudosos = informe.reduce((a, i) => a + i.dudosos.length, 0);
  console.log(`\n═══ ${totalCasos} casos medidos por debajo del umbral WCAG AA en ${informe.length} pantallas`);
  if (totalDudosos) {
    console.log(`    (${totalDudosos} más caen sobre un degradado o imagen: el fondo real no se puede leer con`);
    console.log(`     getComputedStyle, así que NO se cuentan — habría que mirarlos a ojo)`);
  }

  /* Lo que más pesa, junto: un mismo token fallando en cinco pantallas es UNA
     decisión de diseño, no cinco bugs sueltos. */
  const porToken = new Map();
  for (const i of informe) for (const f of i.fallos) {
    const k = `${f.color} @${f.size}px`;
    const y = porToken.get(k) ?? { nodos: 0, peor: 99, ejemplo: f.muestra };
    y.nodos += f.veces;
    if (f.ratio < y.peor) { y.peor = f.ratio; y.ejemplo = f.muestra; }
    porToken.set(k, y);
  }
  console.log("\n── Por color y tamaño, lo que más aparece:");
  for (const [k, v] of [...porToken.entries()].sort((a, b) => b[1].nodos - a[1].nodos).slice(0, 10)) {
    console.log(`   ×${String(v.nodos).padStart(4)} nodos  peor ${v.peor}:1   ${k}   «${v.ejemplo}»`);
  }
  await browser.close();
  /* Exit 0 siempre: es un diagnóstico, no un gate. Que rompa el pipeline sería
     convertir una deuda conocida del DS en un bloqueo diario. */
}

main().catch((e) => { console.error(e); process.exit(1); });
