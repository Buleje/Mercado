#!/usr/bin/env node
/**
 * medir-orden-admin.mjs — mide el DESORDEN de cada lugar del panel: cada
 * pestaña (`?tab=`) y cada vista registrada (`?vista=`, `?sub=`).
 *
 * Nació del pedido de Brandon (2026-09-19): «aplicá esa ley en general en
 * admin: sin componentes dispersos que hacen que sea complicado y difícil de
 * usar». No se pueden rediseñar 62 pestañas a ojo; se miden, se ordenan por lo
 * mal que están, y se atacan de la peor a la mejor. La ley vive en
 * `.claude/rules/ui-components.md` («Organización de una vista»).
 *
 * Qué lugares recorre (2026-10-09, plan «panel unificado»): hasta entonces
 * medía sólo la entrada de cada `?tab=` (63 de ~170 lugares). Ahora suma cada
 * vista de `VISTAS_POR_MODULO`, `ANIDADAS_POR_MODULO` y los dos libros
 * (`CTP_VISTAS`, `LOTH_VISTAS`), leídos de `lib/admin/subvistas-modulos.ts` con
 * tsx: registrar una vista allá la mide acá sin tocar este archivo.
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
 *   titulosGemelos  pares de títulos casi iguales en la MISMA vista («El patio,
 *               troza por troza» vs «El patio, pieza por pieza»: el síntoma que
 *               destapó todo esto)
 *   desborde    px que la página se pasa del ancho de la ventana, y cuántos
 *   cortados    elementos se salen por la derecha sin un ancestro que scrollee
 *   tituloCero  el h1 del módulo mide <20 px de ancho (08-10: «Gráficos» + el
 *               rango de fechas lo aplastaban a 0 px en el Inicio a 400 px).
 *               Estas tres no suman al puntaje: son para `ANCHO=400`.
 *   huella      títulos + botones de la vista (sin las barras de pestañas),
 *               normalizados: dos lugares con la misma huella son GEMELOS —el
 *               mismo contenido montado dos veces, lo que la unificación busca—.
 *   llegada     dónde terminó la URL: un lugar que redirige (plan, rubro,
 *               especialización) no mide lo que dice su nombre. El 09-10
 *               «a-medida» midió el Inicio entero porque main no la tiene.
 *
 * Cada medida espera al CONTENIDO —la barra de pestañas (`AdminTabBar`) o el
 * riel del libro, sin ningún cargador a la vista, el DOM quieto y la red sin
 * pedidos— en vez de un tiempo fijo: con 9 s fijos el Libro CTP salió en
 * blanco a las 15:57 del 09-10. Y antes de cada una se borran las claves
 * `admin-*`/`admin_*` del navegador: `useVistaModulo` recuerda la última vista
 * de cada módulo (`admin-last-tab-<módulo>`), y «plata» midió Fiados y
 * «ventas-caja» midió Turnos porque la medida anterior había dejado esa vista.
 *
 * El puntaje suma cuánto se pasa cada cifra del umbral de la ley. 0 = en regla.
 *
 * Uso (dev server arriba, usuario de QA `qaadmin`):
 *   node scripts/medir-orden-admin.mjs                      # todo: pestañas + vistas
 *   node scripts/medir-orden-admin.mjs plata pedidos        # esas pestañas con TODAS sus vistas
 *   node scripts/medir-orden-admin.mjs plata:fiados         # una vista (`tab:vista[:sub]`)
 *   node scripts/medir-orden-admin.mjs --lista [lugares]    # sólo lista los lugares (sin navegador)
 *   SOLO_TABS=1   sólo la entrada de cada pestaña (lo que medía antes), en orden-<ANCHO>.json
 *   SALIDA=reports/orden-admin/ola2.json   otro archivo (por defecto orden-<ANCHO>-vistas.json)
 *   ANCHO=400 · ALTO=900 · TENANT=<slug> · TOPE_MS=30000 (tope de espera por lugar)
 *   LS='{"loth:plan:pestana":"censo"}'   siembra localStorage (lo que no vive en la URL)
 *
 * Con lugares por argumento se MEZCLA con el reporte que había (reemplaza sólo
 * esos lugares). ~3-6 s por lugar: correr en background, no en un turno que espera.
 */

import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const RAIZ = new URL("../", import.meta.url);
const BASE = process.env.DEV_BASE ?? "http://localhost:3000";
const ANCHO = Number(process.env.ANCHO ?? 1280);
const ALTO = Number(process.env.ALTO ?? 900);
const TENANT = process.env.TENANT ?? "main";
const TOPE_MS = Number(process.env.TOPE_MS ?? 30_000);
const SOLO_TABS = process.env.SOLO_TABS === "1";
/* SOLO_TABS escribe en el reporte de sólo pestañas: una corrida corta no pisa el de 214 lugares. */
const SALIDA = new URL(process.env.SALIDA ?? `reports/orden-admin/orden-${ANCHO}${SOLO_TABS ? "" : "-vistas"}.json`, RAIZ);
/** Sin pedidos en vuelo durante este rato = la red se aquietó. */
const QUIETO_MS = 700;
/** Lugares sin barra ni riel ni títulos (OrdersTab…): se dan por listos tras este rato quietos. */
const SIN_ANCLA_MS = 6_000;

/* Los umbrales de la ley (ui-components.md). Un número por regla, para que
   cambiar la ley sea cambiar una línea y no buscarla en el código. */
const LEY = { pantallas: 2.5, botones: 25, tablas: 3, titulosSinJerarquia: 5, ayuda: 60 };

/** Los libros forestales: sus vistas viven en listas propias del registro. */
const LIBROS = { "ctp-libro-operaciones": "CTP_VISTAS", "loth-libro-operaciones": "LOTH_VISTAS" };

/** Las pestañas que resuelve el router del admin — la fuente es el propio código,
 *  no una lista escrita a mano que se desactualiza. */
async function pestanasDelRouter() {
  const src = await readFile(new URL("app/admin/_components/TabRouter.tsx", RAIZ), "utf8");
  return [...new Set([...src.matchAll(/tab === ['"]([a-z0-9-]+)['"]/g)].map((m) => m[1]))].sort();
}

/** El registro de vistas, importado tal cual (tsx entiende TS y los alias `@/`). */
async function registroDeVistas() {
  const { tsImport } = await import("tsx/esm/api");
  const mod = await tsImport("../lib/admin/subvistas-modulos.ts", import.meta.url);
  const r = mod.VISTAS_POR_MODULO ? mod : mod.default;
  if (!r?.VISTAS_POR_MODULO) throw new Error("lib/admin/subvistas-modulos.ts no exporta VISTAS_POR_MODULO");
  const libros = Object.fromEntries(Object.entries(LIBROS).map(([tab, nombre]) => [tab, r[nombre] ?? []]));
  return { vistas: r.VISTAS_POR_MODULO, anidadas: r.ANIDADAS_POR_MODULO ?? {}, libros };
}

function idDe({ tab, vista, sub }) {
  return [tab, vista, sub].filter(Boolean).join(":");
}

/** La entrada de una pestaña y, salvo SOLO_TABS, todas sus vistas registradas. */
function lugaresDe(tab, reg) {
  const lugares = [{ tab }];
  if (SOLO_TABS) return lugares;
  for (const v of [...(reg.vistas[tab] ?? []), ...(reg.libros[tab] ?? [])]) {
    lugares.push({ tab, vista: v.key, label: v.label, ...(v.origen ? { origen: v.origen } : {}) });
  }
  for (const a of reg.anidadas[tab] ?? []) {
    lugares.push({ tab, vista: a.vista, sub: a.key, label: a.label, ...(a.origen ? { origen: a.origen } : {}) });
  }
  return lugares;
}

/** `plata` = la pestaña con sus vistas; `plata:fiados` o `documentos:contratos:crear` = ese lugar solo. */
function lugarPedido(arg, reg) {
  const [tab, vista, sub] = arg.split(":");
  if (!vista) return lugaresDe(tab, reg);
  const lista = sub ? reg.anidadas[tab] ?? [] : [...(reg.vistas[tab] ?? []), ...(reg.libros[tab] ?? [])];
  const v = lista.find((x) => (sub ? x.vista === vista && x.key === sub : x.key === vista));
  if (!v) console.warn(`⚠️  ${arg} no está en lib/admin/subvistas-modulos.ts: se mide igual`);
  return [{ tab, vista, ...(sub ? { sub } : {}), ...(v ? { label: v.label } : {}), ...(v?.origen ? { origen: v.origen } : {}) }];
}

/** Similitud de Jaccard sobre palabras: dos títulos que comparten casi todo. */
function titulosGemelos(titulos) {
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
  p += m.titulosGemelos.length * 8;
  return Math.round(p * 10) / 10;
}

/** Títulos + botones sin cifras ni tildes: «Quién te debe · 1» y «Quién te debe · 3» son lo mismo. */
function itemsDeHuella(fila) {
  const norm = (t) =>
    t.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\d+(?:[.,]\d+)*/g, "#")
      .replace(/[^\p{L}#\s]/gu, " ").replace(/\s+/g, " ").trim();
  return [...new Set([...(fila.titulos ?? []), ...(fila.botonesTexto ?? [])].map(norm).filter((s) => s.length >= 3))].sort();
}

function huellaDe(fila) {
  const items = itemsDeHuella(fila);
  return items.length ? createHash("sha1").update(items.join("\n")).digest("hex").slice(0, 10) : null;
}

/**
 * Gemelos entre lugares. Primero se juntan los pedidos que cayeron en el MISMO
 * lugar (la entrada de un hub abre su vista por defecto: no es un duplicado, es
 * la misma pantalla); sobre un representante por lugar, misma huella = gemelos
 * y huellas que comparten ≥ 80 % = parecidos (el mismo contenido con otra
 * cabecera alrededor).
 */
function cruzar(filas) {
  const validas = filas.filter((f) => !f.error && f.llegadaId);
  const porLlegada = new Map();
  for (const f of validas) porLlegada.set(f.llegadaId, [...(porLlegada.get(f.llegadaId) ?? []), f]);
  const mismoLugar = [...porLlegada]
    .filter(([, fs]) => fs.length > 1)
    .map(([llegada, fs]) => ({ llegada, pedidos: fs.map((f) => f.lugar) }));
  const reps = [...porLlegada.values()].map((fs) => fs.find((f) => f.lugar === f.llegadaId) ?? fs[0]);
  const vacias = reps.filter((f) => !f.huella).map((f) => f.lugar);
  const porHuella = new Map();
  for (const f of reps) if (f.huella) porHuella.set(f.huella, [...(porHuella.get(f.huella) ?? []), f]);
  const gemelos = [...porHuella]
    .filter(([, fs]) => fs.length > 1)
    .map(([huella, fs]) => ({ huella, lugares: fs.map((f) => f.lugar), muestra: [...fs[0].titulos, ...fs[0].botonesTexto].slice(0, 5) }));
  const conItems = reps.filter((f) => f.huella).map((f) => ({ f, items: new Set(itemsDeHuella(f)) }));
  const parecidos = [];
  for (let i = 0; i < conItems.length; i++) {
    for (let j = i + 1; j < conItems.length; j++) {
      const a = conItems[i];
      const b = conItems[j];
      if (a.f.huella === b.f.huella || Math.min(a.items.size, b.items.size) < 4) continue;
      const inter = [...a.items].filter((x) => b.items.has(x)).length;
      const similitud = inter / (a.items.size + b.items.size - inter);
      if (similitud >= 0.8) parecidos.push({ a: a.f.lugar, b: b.f.lugar, similitud: Math.round(similitud * 100) / 100 });
    }
  }
  parecidos.sort((x, y) => y.similitud - x.similitud);
  return { gemelos, parecidos, mismoLugar, vacias };
}

/**
 * «La red se aquietó», sin contar las conexiones que no terminan nunca: el
 * panel abre dos SSE (`/api/admin/sse`, `/api/admin/notifications/stream`) y
 * `networkidle` no llegaba jamás (mismo criterio que `qa-capturas.mjs`).
 */
function vigilarRed(page) {
  const enVuelo = new Set();
  let ultimo = Date.now();
  const esStream = (r) => r.resourceType() === "eventsource" || /\/(sse|stream)(\/|\?|$)/.test(new URL(r.url()).pathname);
  page.on("request", (r) => {
    if (esStream(r)) return;
    enVuelo.add(r);
    ultimo = Date.now();
  });
  const fin = (r) => {
    if (enVuelo.delete(r)) ultimo = Date.now();
  };
  page.on("requestfinished", fin);
  page.on("requestfailed", fin);
  return {
    quieta: () => enVuelo.size === 0 && Date.now() - ultimo >= QUIETO_MS,
    pendientes: () => [...enVuelo].slice(0, 4).map((r) => new URL(r.url()).pathname),
    /* Lo que quedó colgado de la página anterior no es de esta medida. */
    olvidar: () => {
      enVuelo.clear();
      ultimo = Date.now();
    },
  };
}

/** Estado del contenido, para decidir si ya se puede medir. Corre en la página. */
function estadoEnPagina() {
  const main = document.querySelector("main#main-content") ?? document.querySelector("main");
  if (!main) return null;
  const seVe = (e) => {
    const r = e.getBoundingClientRect();
    return r.width >= 4 && r.height >= 4 && (!e.checkVisibility || e.checkVisibility({ visibilityProperty: true, opacityProperty: true }));
  };
  const ancla = main.querySelector("[data-admin-tabbar]") ? "barra" : main.querySelector("section[data-module] [role=tablist]") ? "riel" : null;
  const describir = (e) => `${e.tagName.toLowerCase()}.${String(e.className?.baseVal ?? e.className ?? "").split(/\s+/).find((c) => c.startsWith("animate-")) ?? (e.getAttribute("role") ?? "")}`;
  const cargadores = [];
  for (const e of main.querySelectorAll("[role=status],[aria-busy=true],.animate-spin,.animate-pulse,.animate-cargando")) {
    if (!seVe(e)) continue;
    if (e.matches("[role=status]") && !e.matches("[aria-busy=true],.animate-spin,.animate-pulse,.animate-cargando")) {
      /* Un role=status es cargador sólo si lo dice: los avisos en vivo también lo usan. */
      if (!/cargando|loading/i.test(`${e.getAttribute("aria-label") ?? ""} ${e.textContent ?? ""}`)) continue;
    }
    if (e.matches(".animate-pulse")) {
      /* El esqueleto es una caja sin texto; el punto «en vivo» es chico y el aviso que late tiene texto. */
      const r = e.getBoundingClientRect();
      if (r.width < 24 || r.height < 8 || (e.innerText ?? "").trim()) continue;
    }
    cargadores.push(describir(e));
  }
  for (const e of main.querySelectorAll("p,span,div,td")) {
    if (e.childElementCount > 0) continue;
    const t = (e.textContent ?? "").trim();
    if (t.length < 60 && /^cargando\b/i.test(t) && seVe(e)) cargadores.push(`«${t}»`);
  }
  const titulos = [...main.querySelectorAll("h1,h2,h3,h4")].filter(seVe).length;
  return { ancla, cargadores: cargadores.slice(0, 5), titulos, firma: `${main.getElementsByTagName("*").length}:${(main.innerText ?? "").length}` };
}

/**
 * Espera al contenido: ancla (barra o riel; títulos, o un rato quieto en los
 * lugares que no tienen ninguna de las dos), ningún cargador, el DOM igual en
 * 3 lecturas seguidas y la red quieta. Al tope se mide igual y queda anotado
 * qué faltaba (`espera.listo = false`).
 */
async function esperarContenido(page, red, tope) {
  const t0 = Date.now();
  let firmaPrevia = null;
  let iguales = 0;
  let e = null;
  while (Date.now() - t0 < tope) {
    e = await page.evaluate(estadoEnPagina).catch(() => null);
    if (e) {
      iguales = e.firma === firmaPrevia ? iguales + 1 : 0;
      firmaPrevia = e.firma;
      const hayContenido = e.ancla || e.titulos > 0 || Date.now() - t0 > SIN_ANCLA_MS;
      if (hayContenido && e.cargadores.length === 0 && iguales >= 2 && red.quieta()) {
        return { ms: Date.now() - t0, listo: true, ancla: e.ancla };
      }
    }
    await page.waitForTimeout(200);
  }
  return { ms: Date.now() - t0, listo: false, ancla: e?.ancla ?? null, cargadores: e?.cargadores ?? ["sin <main>"], pedidos: red.pendientes() };
}

/** Las cifras de la ley, la huella y a dónde llegó la URL. Corre en la página. */
function medirEnPagina() {
  const main = document.querySelector("main#main-content") ?? document.querySelector("main") ?? document.body;
  const visibles = (sel) => [...main.querySelectorAll(sel)].filter((e) => e.offsetParent !== null);
  const heads = visibles("h2,h3,h4");
  const texto = (e, n) => (e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, n);
  const conTexto = visibles("button").filter((b) => (b.textContent ?? "").trim().length > 2);
  const q = new URLSearchParams(location.search);
  return {
    llegada: { ruta: location.pathname, tab: q.get("tab"), vista: q.get("vista"), sub: q.get("sub") },
    pestanasActivas: visibles("[role=tab][aria-selected=true]").map((t) => texto(t, 40)).filter(Boolean),
    pantallas: +(document.documentElement.scrollHeight / window.innerHeight).toFixed(2),
    h2: heads.filter((h) => h.tagName === "H2").length,
    h3: heads.filter((h) => h.tagName === "H3").length,
    h4: heads.filter((h) => h.tagName === "H4").length,
    titulos: heads.map((h) => texto(h, 60)).filter(Boolean),
    botones: conTexto.length,
    /* Para la huella: sin las barras de pestañas ni la navegación, que comparten
       todas las vistas de un mismo hub y harían «gemelos» a hermanas distintas. */
    botonesTexto: [...new Set(conTexto.filter((b) => !b.closest("[role=tablist],nav")).map((b) => texto(b, 40)))].slice(0, 60),
    tablas: visibles("table").length,
    desborde: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    /* Se sale por la derecha y nada lo contiene: ni un ancestro que
       scrollee en x ni uno que lo recorte. El primero de cada rama. */
    cortados: (() => {
      const W = window.innerWidth;
      const contiene = (e) => {
        for (let a = e.parentElement; a && a !== main; a = a.parentElement) {
          if (getComputedStyle(a).overflowX !== "visible") return true;
        }
        return false;
      };
      const fuera = [...main.querySelectorAll("*")].filter((e) => {
        if (e.offsetParent === null) return false;
        /* Montado pero no se ve: menú de filtro dentro de un <details>
           cerrado, invisible u opaco 0 (08-10: los 3 «cortados» de la
           primera corrida eran filtros de un <details> cerrado). */
        if (e.checkVisibility && !e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.right > W + 1 && !contiene(e);
      });
      const raices = fuera.filter((e) => !fuera.includes(e.parentElement));
      return raices
        .slice(0, 5)
        .map((e) => {
          const t = (e.innerText ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
          return `${e.tagName.toLowerCase()}${t ? ` «${t}»` : ""} +${Math.round(e.getBoundingClientRect().right - W)}px`;
        })
        .concat(raices.length > 5 ? [`… y ${raices.length - 5} más`] : []);
    })(),
    tituloCero: (() => {
      const h1 = main.querySelector("h1");
      return h1 ? h1.getBoundingClientRect().width < 20 : false;
    })(),
    /* Texto corrido a la vista: lo que debería vivir en un ⓘ. */
    ayuda: visibles("p")
      .filter((e) => !e.closest("table,button,[role=tooltip],[role=dialog],[role=menu],label,nav,[role=tablist]"))
      .map((e) => (e.innerText ?? "").trim().split(/\s+/).filter(Boolean).length)
      .filter((n) => n >= 6)
      .reduce((a, n) => a + n, 0),
  };
}

async function entrar(page) {
  /* Pedido de la ola 1 (09-10): si el login no contesta en 60 s, esperar 1 min
     y reintentar UNA vez; el dev server no se reinicia desde acá. */
  for (let intento = 1; intento <= 2; intento++) {
    try {
      const r = await page.request.post(`${BASE}/api/auth/login`, {
        data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: TENANT },
        timeout: 60_000,
      });
      if (r.ok()) return true;
      console.error(`login respondió ${r.status()}`);
    } catch (err) {
      console.error(`login sin respuesta: ${String(err).slice(0, 100)}`);
    }
    if (intento === 1) await page.waitForTimeout(60_000);
  }
  return false;
}

async function medirLugar(page, red, lugar, tope) {
  const q = new URLSearchParams({ tab: lugar.tab, ...(lugar.vista ? { vista: lugar.vista } : {}), ...(lugar.sub ? { sub: lugar.sub } : {}) });
  red.olvidar();
  await page.goto(`${BASE}/admin?${q}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const espera = await esperarContenido(page, red, tope);
  const m = await page.evaluate(medirEnPagina);
  const { llegada } = m;
  const llegadaId = llegada.ruta === "/admin" && llegada.tab ? idDe(llegada) : llegada.ruta;
  const redirigida = llegada.tab !== lugar.tab || (lugar.vista ? llegada.vista !== lugar.vista : false) || (lugar.sub ? llegada.sub !== lugar.sub : false);
  const fila = { lugar: idDe(lugar), ...lugar, llegadaId, redirigida, espera, ...m, titulosGemelos: titulosGemelos(m.titulos) };
  fila.huella = huellaDe(fila);
  fila.puntaje = puntaje(fila);
  return fila;
}

function lineaDe(f) {
  const marca = f.puntaje === 0 ? "✅" : f.puntaje < 10 ? "🟡" : "🔴";
  const extra = [
    f.titulosGemelos.length ? `${f.titulosGemelos.length} títulos gemelos` : "",
    f.redirigida ? `→ ${f.llegadaId}` : "",
    f.espera.listo ? "" : `⏱ tope (${[...(f.espera.cargadores ?? []), ...(f.espera.pedidos ?? [])].join(", ")})`,
    f.desborde ? `desborde ${f.desborde}px` : "",
    f.cortados.length ? `cortados: ${f.cortados.join(", ")}` : "",
    f.tituloCero ? "TÍTULO APLASTADO" : "",
  ].filter(Boolean);
  return `${marca} ${String(f.puntaje).padStart(5)}  ${f.lugar.padEnd(38)} ${String(f.pantallas).padStart(5)} pant · ${String(f.botones).padStart(3)} bot · ${f.tablas} tab · ${String(f.ayuda).padStart(4)} pal. ayuda · h2/h3/h4 ${f.h2}/${f.h3}/${f.h4} · ${(f.espera.ms / 1000).toFixed(1)} s${extra.length ? ` · ${extra.join(" · ")}` : ""}`;
}

async function main() {
  const argv = process.argv.slice(2);
  const pedidos = argv.filter((a) => !a.startsWith("--"));
  const reg = await registroDeVistas();
  const delRouter = await pestanasDelRouter();
  /* Un hub registrado con una clave que no es pestaña del router también se mide:
     su `?tab=` cae en otro lado y la columna `llegada` lo deja a la vista. */
  const todas = [...new Set([...delRouter, ...Object.keys(reg.vistas), ...Object.keys(reg.anidadas)])];
  const lugares = (pedidos.length > 0 ? pedidos.flatMap((p) => lugarPedido(p, reg)) : todas.flatMap((t) => lugaresDe(t, reg)))
    .filter((l, i, arr) => arr.findIndex((x) => idDe(x) === idDe(l)) === i);

  if (argv.includes("--lista")) {
    for (const l of lugares) console.log(`${idDe(l).padEnd(40)} ${l.label ?? ""}${delRouter.includes(l.tab) ? "" : "  (no es pestaña del router)"}`);
    const vistas = lugares.filter((l) => l.vista).length;
    console.log(`\n${lugares.length} lugares: ${lugares.length - vistas} pestañas + ${vistas} vistas`);
    return;
  }

  console.log(`📐 midiendo el orden de ${lugares.length} lugares a ${ANCHO}×${ALTO} (tenant ${TENANT})\n`);
  const t0 = Date.now();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: ANCHO, height: ALTO }, extraHTTPHeaders: { "x-tenant-id": TENANT } });
  const page = await ctx.newPage();
  /* Un formulario con «¿salir sin guardar?» colgaría el `goto` siguiente: se sale.
     Cualquier otro diálogo al cargar (alert de error) se cierra sin aceptar nada. */
  page.on("dialog", (d) => {
    (d.type() === "beforeunload" ? d.accept() : d.dismiss()).catch((err) => console.error(`diálogo: ${String(err).slice(0, 80)}`));
  });
  if (!(await entrar(page))) {
    console.error("❌ login falló: ¿dev server arriba? ¿existe qaadmin en el tenant?");
    await browser.close();
    process.exit(1);
  }
  /* `LS='{"loth:plan:pestana":"censo"}'` siembra lo recordado (JSON.stringify de
     cada valor): así se mide una pestaña interna que no vive en la URL. */
  const sembrar = process.env.LS ? JSON.parse(process.env.LS) : {};
  await ctx.addInitScript(
    ({ slug, extra }) => {
      try {
        /* Cada carga arranca sin la memoria del panel (vista recordada, recientes,
           atajos): sin esto cada medida heredaba la vista que dejó la anterior. */
        for (const k of Object.keys(localStorage)) if (/^admin[-_]/.test(k)) localStorage.removeItem(k);
        if (!localStorage.getItem("active-tenant-slug")) localStorage.setItem("active-tenant-slug", slug);
        localStorage.setItem(`onboarding-completed-${slug}`, "1");
        localStorage.setItem("onboarding-completed-main", "1");
        for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, JSON.stringify(v));
      } catch {
        /* sin storage: el onboarding puede tapar la pantalla, pero se mide igual */
      }
    },
    { slug: TENANT, extra: sembrar },
  );
  const red = vigilarRed(page);

  const filas = [];
  /* 09-10: con el dev server colgado, cada lugar quemaba su tope (y el candado) sin
     medir nada. Tres seguidos sin respuesta → se corta SIN escribir: un reporte de
     errores pisaría la línea base buena. */
  let sinRespuesta = 0;
  for (const [i, lugar] of lugares.entries()) {
    /* El primero paga la compilación en frío del panel (10-60 s). */
    const tope = i === 0 ? Math.max(TOPE_MS, 120_000) : TOPE_MS;
    try {
      let fila = await medirLugar(page, red, lugar, tope);
      if (fila.llegada.ruta.startsWith("/login") && (await entrar(page))) fila = await medirLugar(page, red, lugar, tope);
      filas.push(fila);
      console.log(lineaDe(fila));
      sinRespuesta = !fila.espera.listo && (fila.espera.cargadores ?? []).includes("sin <main>") ? sinRespuesta + 1 : 0;
    } catch (err) {
      filas.push({ lugar: idDe(lugar), ...lugar, error: String(err).slice(0, 160), puntaje: -1 });
      console.log(`❌   err  ${idDe(lugar).padEnd(38)} ${String(err).slice(0, 80)}`);
      sinRespuesta += 1;
    }
    if (sinRespuesta >= 3) {
      console.error("❌ 3 lugares seguidos sin respuesta del dev server: corto sin escribir el reporte");
      await browser.close();
      process.exit(1);
    }
  }
  await browser.close();

  /* Con lugares por argumento se MEZCLA con el reporte que había (reemplaza
     sólo esos): antes lo pisaba entero y cada agente lo respaldaba y
     restauraba a mano (4 veces la noche del 08-10). Sin argumentos, completo. */
  let todasLasFilas = filas;
  if (pedidos.length > 0) {
    try {
      const previo = JSON.parse(await readFile(SALIDA, "utf8"));
      const nuevas = new Set(filas.map((f) => f.lugar));
      /* Las filas de antes de la ola 1 no traen `lugar`: su `tab` es el mismo id. */
      todasLasFilas = [...(previo.filas ?? []).filter((f) => !nuevas.has(f.lugar ?? f.tab)), ...filas];
    } catch {
      /* sin reporte previo: sólo lo medido */
    }
  }
  todasLasFilas.sort((a, b) => b.puntaje - a.puntaje);
  const cruce = cruzar(todasLasFilas);
  const ok = todasLasFilas.filter((f) => !f.error);
  const resumen = {
    lugares: todasLasFilas.length,
    pestanas: todasLasFilas.filter((f) => !f.vista).length,
    vistas: todasLasFilas.filter((f) => f.vista).length,
    fueraDeLey: ok.filter((f) => f.puntaje > 0).length,
    enRegla: ok.filter((f) => f.puntaje === 0).length,
    errores: todasLasFilas.length - ok.length,
    sinListo: ok.filter((f) => !f.espera?.listo).map((f) => f.lugar),
    redirigidas: ok.filter((f) => f.redirigida).map((f) => `${f.lugar} → ${f.llegadaId}`),
  };
  await mkdir(new URL(".", SALIDA), { recursive: true });
  await writeFile(
    SALIDA,
    JSON.stringify({ medido: new Date().toISOString(), ancho: ANCHO, alto: ALTO, tenant: TENANT, ley: LEY, resumen, ...cruce, filas: todasLasFilas }, null, 2),
  );

  const medidas = filas.filter((f) => !f.error).sort((a, b) => b.puntaje - a.puntaje);
  const mal = medidas.filter((f) => f.puntaje > 0);
  console.log(`\n─────────────────────────────────`);
  console.log(`${filas.length} lugares en ${Math.round((Date.now() - t0) / 1000)} s · ${mal.length} fuera de la ley · ${medidas.length - mal.length} en regla · ${filas.length - medidas.length} con error`);
  if (mal.length) console.log(`Los 10 peores: ${mal.slice(0, 10).map((f) => `${f.lugar} (${f.puntaje})`).join(", ")}`);
  const sinListo = medidas.filter((f) => !f.espera.listo);
  if (sinListo.length) console.log(`Medidos al tope, sin terminar de cargar (${sinListo.length}): ${sinListo.map((f) => f.lugar).join(", ")}`);
  const redir = medidas.filter((f) => f.redirigida);
  if (redir.length) console.log(`Redirigidos (${redir.length}): ${redir.map((f) => `${f.lugar} → ${f.llegadaId}`).join(", ")}`);
  const rotas = medidas.filter((f) => f.desborde || f.cortados?.length || f.tituloCero);
  if (rotas.length) console.log(`Se salen del ancho o aplastan el título (${rotas.length}): ${rotas.map((f) => f.lugar).join(", ")}`);
  console.log(`Gemelos (misma huella, ${cruce.gemelos.length} grupos)${cruce.gemelos.length ? ":" : ""}`);
  for (const g of cruce.gemelos.slice(0, 15)) console.log(`   ${g.lugares.join(" = ")}`);
  if (cruce.parecidos.length) console.log(`Parecidos ≥ 80 % (${cruce.parecidos.length}): ${cruce.parecidos.slice(0, 8).map((p) => `${p.a} ~ ${p.b} ${Math.round(p.similitud * 100)} %`).join(", ")}`);
  if (cruce.vacias.length) console.log(`Sin títulos ni botones (${cruce.vacias.length}): ${cruce.vacias.join(", ")}`);
  console.log(`Detalle: ${SALIDA.pathname}`);
}

/* Importable: el cruce de gemelos se puede rehacer sobre un reporte guardado
   sin abrir el navegador (`import { cruzar, huellaDe } from "./medir-orden-admin.mjs"`). */
export { cruzar, huellaDe };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
