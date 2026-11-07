#!/usr/bin/env node
/**
 * perf-tienda — cuánto tarda en cargar una página pública (Chromium real, CDP).
 *
 *   node scripts/perf-tienda.mjs --ruta /t/main --anchos 400,1280 --veces 2 [--detalle] [--json]
 *   QA_BASE=http://localhost:3001 node scripts/perf-tienda.mjs …     (otro puerto o un `next start`)
 *
 * Por cada ancho y cada vez abre un contexto NUEVO (caché vacía) y carga la ruta dos veces:
 *   · «fría»     = primera visita (nada en la caché del navegador)
 *   · «caliente» = la misma persona vuelve (JS/CSS/fotos ya en caché)
 * La tabla muestra la MEDIANA de las `--veces` corridas (con 4 agentes capturando a la vez, una
 * sola corrida miente: correr con `flock /tmp/bsm-pesado.lock` y comparar medianas).
 *
 * Columnas: TTFB y «HTML fin» (el servidor: primer byte y último byte del HTML) · FCP/LCP (ms) · TBT = suma de (tarea larga − 50 ms) · CLS · peticiones · KB transferidos
 * (total, JS, CSS, fotos) · HTML y payload RSC (`self.__next_f`, KB SIN comprimir) · nodos del DOM.
 * `--detalle`: el elemento del LCP, los 8 JS más pesados y las fotos más pesadas de la 1.ª corrida fría.
 * 400 px se mide con DPR 2 (un celular), 1280 con DPR 1.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(RAIZ, "package.json"));
const { chromium } = require("playwright");
const { resolverChromium } = await import(join(RAIZ, "scripts/dev-helpers/chromium-path.mjs"));

const arg = (n, def) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : def;
};
const flag = (n) => process.argv.includes(`--${n}`);
const RUTA = arg("ruta", "/t/main");
const ANCHOS = arg("anchos", "400,1280").split(",").map(Number);
const VECES = Math.max(1, Number(arg("veces", "2")));
const ESPERA = Number(arg("espera", "4000"));

async function baseQueResponde() {
  for (const b of ["http://localhost:3000", "http://localhost:3001"]) {
    try {
      await fetch(`${b}/login`, { signal: AbortSignal.timeout(20_000), redirect: "manual" });
      return b;
    } catch {
      /* probar el siguiente */
    }
  }
  return "http://localhost:3000";
}
const BASE = process.env.QA_BASE ?? (await baseQueResponde());
const URL_PAGINA = new URL(RUTA, BASE).toString();

function observadores() {
  window.__lcp = 0;
  window.__cls = 0;
  window.__lt = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      window.__lcp = e.startTime;
      window.__lcpEl = `${e.element?.tagName ?? ""} ${(e.url ?? "").slice(0, 110)}`;
    }
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__lt.push(e.duration);
  }).observe({ type: "longtask", buffered: true });
}

async function medir(page, cdp) {
  const reqs = new Map();
  const alRecibir = (e) => reqs.set(e.requestId, { url: e.response.url, type: e.type, bytes: 0 });
  const alTerminar = (e) => {
    const r = reqs.get(e.requestId);
    if (r) r.bytes = e.encodedDataLength;
  };
  cdp.on("Network.responseReceived", alRecibir);
  cdp.on("Network.loadingFinished", alTerminar);
  await page.goto(URL_PAGINA, { waitUntil: "load", timeout: 120_000 });
  await page.waitForTimeout(ESPERA);
  cdp.off("Network.responseReceived", alRecibir);
  cdp.off("Network.loadingFinished", alTerminar);
  const m = await page.evaluate(() => {
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
    const nav = performance.getEntriesByType("navigation")[0];
    const rsc = [...document.scripts].filter((s) => s.textContent.includes("self.__next_f")).reduce((a, s) => a + s.textContent.length, 0);
    return {
      ttfb: Math.round(nav?.responseStart ?? 0),
      htmlFin: Math.round(nav?.responseEnd ?? 0),
      fcp: Math.round(fcp),
      lcp: Math.round(window.__lcp),
      lcpEl: window.__lcpEl,
      cls: +window.__cls.toFixed(3),
      tbt: Math.round(window.__lt.reduce((a, d) => a + Math.max(0, d - 50), 0)),
      dom: document.getElementsByTagName("*").length,
      htmlKB: Math.round(new XMLSerializer().serializeToString(document).length / 1024),
      rscKB: Math.round(rsc / 1024),
    };
  });
  const arr = [...reqs.values()];
  const kb = (f) => Math.round(arr.filter(f).reduce((a, r) => a + r.bytes, 0) / 1024);
  const top = (tipo) =>
    arr
      .filter((r) => r.type === tipo)
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 8)
      .map((r) => `${Math.round(r.bytes / 1024)} KB  ${r.url.replace(BASE, "").slice(0, 110)}`);
  return {
    ...m,
    reqs: arr.length,
    kb: kb(() => true),
    jsN: arr.filter((r) => r.type === "Script").length,
    jsKB: kb((r) => r.type === "Script"),
    cssKB: kb((r) => r.type === "Stylesheet"),
    imgN: arr.filter((r) => r.type === "Image").length,
    imgKB: kb((r) => r.type === "Image"),
    topJS: top("Script"),
    topImg: top("Image"),
  };
}

const mediana = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : Math.round(((s[k - 1] + s[k]) / 2) * 1000) / 1000;
};

const browser = await chromium.launch({ executablePath: resolverChromium() ?? undefined });
const filas = [];
let detalle = null;
try {
  for (const ancho of ANCHOS) {
    const corridas = { fria: [], caliente: [] };
    for (let v = 0; v < VECES; v++) {
      const ctx = await browser.newContext({
        viewport: { width: ancho, height: ancho < 600 ? 860 : 900 },
        deviceScaleFactor: ancho < 600 ? 2 : 1,
      });
      await ctx.addInitScript(observadores);
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Network.enable");
      corridas.fria.push(await medir(page, cdp));
      corridas.caliente.push(await medir(page, cdp));
      await ctx.close();
    }
    if (!detalle) detalle = { ancho, ...corridas.fria[0] };
    for (const pasada of ["fria", "caliente"]) {
      const cs = corridas[pasada];
      const col = (k) => mediana(cs.map((c) => c[k]));
      filas.push({
        ancho,
        pasada,
        TTFB: col("ttfb"),
        "HTML fin": col("htmlFin"),
        FCP: col("fcp"),
        LCP: col("lcp"),
        TBT: col("tbt"),
        CLS: col("cls"),
        pet: col("reqs"),
        KB: col("kb"),
        JS: `${col("jsN")}/${col("jsKB")}`,
        CSS: col("cssKB"),
        fotos: `${col("imgN")}/${col("imgKB")}`,
        HTML: col("htmlKB"),
        RSC: col("rscKB"),
        DOM: col("dom"),
        lcpEl: cs[0].lcpEl,
      });
    }
  }
} finally {
  await browser.close();
}

if (flag("json")) {
  console.log(JSON.stringify({ url: URL_PAGINA, veces: VECES, filas, detalle }, null, 1));
} else {
  console.log(`${URL_PAGINA} · mediana de ${VECES} · KB transferidos (JS/fotos = n/KB) · HTML y RSC = KB sin comprimir`);
  const cols = ["ancho", "pasada", "TTFB", "HTML fin", "FCP", "LCP", "TBT", "CLS", "pet", "KB", "JS", "CSS", "fotos", "HTML", "RSC", "DOM"];
  console.log(`| ${cols.join(" | ")} |`);
  console.log(`|${cols.map(() => "---").join("|")}|`);
  for (const f of filas) console.log(`| ${cols.map((c) => f[c]).join(" | ")} |`);
  console.log(`LCP: ${[...new Set(filas.map((f) => `${f.ancho}=${f.lcpEl}`))].join(" · ")}`);
  if (flag("detalle") && detalle) {
    console.log(`\nJS más pesados (${detalle.ancho}, fría):\n  ${detalle.topJS.join("\n  ")}`);
    console.log(`Fotos más pesadas:\n  ${detalle.topImg.join("\n  ")}`);
  }
}
