#!/usr/bin/env node
/**
 * mapa-pestana.mjs — de una pestaña del panel a sus archivos y sus endpoints,
 * en una sola llamada.
 *
 * Nació con el plan «panel unificado» (2026-10-09): cada carril que mueve una
 * pestaña dentro de otra gastaba 12-15 llamadas en lo mismo —qué componente
 * monta el router, qué importa, dónde más está montado, a qué `/api/` pega—
 * antes de tocar una línea.
 *
 * Recorre:
 *   1. el montaje en `app/admin/_components/TabRouter.tsx` (componente + `initialTab`);
 *      un id que ya no es pestaña se sigue por `TAB_MIGRATION`;
 *   2. la vista, si se pide (o si el router la fija con `initialTab`): el
 *      componente que el hub dibuja para esa clave;
 *   3. el árbol de imports (estáticos y `import()`), sin bajar a lo compartido
 *      —design system, `components/ui`, `components/admin/shared` y todo archivo
 *      con 6+ importadores—;
 *   4. por archivo: LOC, cantidad de `<p>` y de `<InfoTip>`, endpoints `/api/…`
 *      y quién más lo importa fuera del árbol (el mismo bloque montado en otra
 *      pestaña: lo que la unificación busca);
 *   5. cada endpoint con su `route.ts` y los roles de `requireAdmin` por método.
 *
 * Uso:
 *   node scripts/mapa-pestana.mjs plata             # el hub entero
 *   node scripts/mapa-pestana.mjs plata fiados      # desde el componente de la vista «fiados»
 *   node scripts/mapa-pestana.mjs fiados            # alias del router: sigue su initialTab
 *   node scripts/mapa-pestana.mjs plata --todo      # todos los archivos (por defecto los 30 más grandes)
 *   node scripts/mapa-pestana.mjs plata --json      # todo, en JSON
 *
 * Sólo lee el repo (≈1-2 s): no necesita el dev server ni la base.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../", import.meta.url));
const DIRS = ["app", "components", "hooks", "lib", "contexts", "extensiones"];
const EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
const ROUTER = "app/admin/_components/TabRouter.tsx";
const MIGRACION = "app/admin/_lib/tab-migration.ts";
/** El router y su precarga montan TODO: no cuentan como «también montado en». */
const PRECARGA = "app/admin/_lib/tab-preload.ts";
/** Importadores a partir de los cuales un archivo es infraestructura común y no «de la pestaña». */
const COMPARTIDO = 6;
const SIEMPRE_COMPARTIDO = /^(components\/ui-system|components\/ui|components\/admin\/shared|packages)\//;

const leer = (rel) => readFileSync(path.join(RAIZ, rel), "utf8");
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function listar(dir, out) {
  for (const e of readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "__tests__" || e.name.startsWith(".")) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) listar(rel, out);
    else if (EXT.includes(path.extname(e.name)) && !/\.(test|spec|stories)\.|\.d\.ts$/.test(e.name)) out.push(rel);
  }
  return out;
}

const archivos = new Set(DIRS.flatMap((d) => listar(d, [])));

function resolver(desde, spec) {
  if (!spec) return null;
  let base;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = path.join(path.dirname(desde), spec);
  else return null; /* paquete de node_modules o del monorepo: fuera del mapa */
  for (const c of [base, ...EXT.map((x) => base + x), ...EXT.map((x) => path.join(base, `index${x}`))]) {
    if (archivos.has(c)) return c;
  }
  return null;
}

/* Imports con código (los `import type` no montan nada ni pegan a la API). */
const RE_IMPORT = /(?:import|export)\s[^'"`;]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const deps = new Map();
const importadores = new Map();
for (const f of archivos) {
  const ds = new Set();
  for (const m of leer(f).matchAll(RE_IMPORT)) {
    if (/^(import|export)\s+type\s/.test(m[0])) continue;
    const r = resolver(f, m[1] ?? m[2] ?? m[3]);
    if (r && r !== f) ds.add(r);
  }
  deps.set(f, ds);
  for (const d of ds) importadores.set(d, (importadores.get(d) ?? new Set()).add(f));
}
const esCompartido = (f) => SIEMPRE_COMPARTIDO.test(f) || (importadores.get(f)?.size ?? 0) >= COMPARTIDO;

/** De dónde sale un identificador en un archivo: `dynamic(() => import(…))` o
 *  `lazy(…)`, default o nombrado. */
function archivoDeIdentificador(f, src, nombre) {
  const n = escapar(nombre);
  const spec =
    new RegExp(`const\\s+${n}\\s*=\\s*[\\w.]+\\(\\s*(?:async\\s*)?\\(\\)\\s*=>\\s*import\\(\\s*["']([^"']+)["']`).exec(src)?.[1] ??
    new RegExp(`import\\s+${n}\\s*(?:,\\s*\\{[^}]*\\})?\\s*from\\s*["']([^"']+)["']`).exec(src)?.[1] ??
    new RegExp(`import\\s*(?:\\w+\\s*,\\s*)?\\{[^}]*\\b${n}\\b[^}]*\\}\\s*from\\s*["']([^"']+)["']`).exec(src)?.[1];
  return resolver(f, spec);
}

/** La rama del router: `if (tab === "x") return <Comp … initialTab="y" />`. */
function montajeDe(tab) {
  const src = leer(ROUTER);
  const i = src.search(new RegExp(`tab === ["']${escapar(tab)}["']`));
  if (i < 0) return null;
  const tramo = src.slice(i, i + 800);
  const comp = /return\s*\(?\s*<([A-Z][A-Za-z0-9]*)/.exec(tramo)?.[1];
  if (!comp) return null;
  const jsx = tramo.slice(tramo.indexOf(`<${comp}`));
  const initialTab = /initialTab=["']([^"']+)["']/.exec(jsx.slice(0, jsx.indexOf("/>") + 2))?.[1];
  return { comp, initialTab, archivo: archivoDeIdentificador(ROUTER, src, comp) };
}

/** `TAB_MIGRATION`: `id: "tab"` o, desde la ola 1, `id: { tab, vista }`. */
function aliasDe(id) {
  const src = leer(MIGRACION);
  const m = new RegExp(`(?:^|[\\s,{])["']?${escapar(id)}["']?\\s*:\\s*(?:["']([a-z0-9-]+)["']|\\{([^}]*)\\})`, "m").exec(src);
  if (!m) return null;
  if (m[1]) return { tab: m[1] };
  const tab = /tab:\s*["']([^"']+)["']/.exec(m[2])?.[1];
  return tab ? { tab, vista: /vista:\s*["']([^"']+)["']/.exec(m[2])?.[1] } : null;
}

/**
 * El componente que el hub dibuja para una clave de vista: el primer
 * componente propio después de una comparación (`vista === "fiados" &&
 * <FiadosModule />`), un `case "fiados":` o un mapa (`fiados: FiadosModule`).
 * Se busca en el hub y en sus imports directos. Una clave suelta entre
 * comillas NO alcanza: `setSub("bot")` dentro de la vista «whatsapp» daba el
 * componente de la vista de al lado. Sin coincidencia fuerte → null (mejor
 * «no lo encontré» que un componente equivocado).
 */
function componenteDeVista(hub, vista) {
  const k = escapar(vista);
  const patrones = [
    new RegExp(`===?\\s*["']${k}["']`, "g"),
    new RegExp(`case\\s+["']${k}["']\\s*:`, "g"),
    new RegExp(`(?:^|[\\s{,])["']?${k}["']?\\s*:\\s*(?=(?:\\(\\s*\\)\\s*=>\\s*)?<?[A-Z])`, "gm"),
  ];
  const enDonde = [hub, ...[...(deps.get(hub) ?? [])].filter((f) => !esCompartido(f))];
  for (const re of patrones) {
    for (const f of enDonde) {
      const src = leer(f);
      for (const m of src.matchAll(re)) {
        /* Hasta el próximo bloque `{x === …` o `case`: lo que sigue es de otra vista
           (`sub === "ganado" && nivel === "completo" && <GanadoView />` sigue siendo una). */
        const resto = src.slice(m.index + m[0].length, m.index + m[0].length + 200);
        const corte = resto.search(/\{\s*[\w.]+\s*===|\bcase\s/);
        const tramo = corte >= 0 ? resto.slice(0, corte) : resto;
        for (const c of tramo.matchAll(/<([A-Z][A-Za-z0-9]*)|^\s*(?:\(\s*\)\s*=>\s*)?([A-Z][A-Za-z0-9]*)\b/g)) {
          const nombre = c[1] ?? c[2];
          const archivo = archivoDeIdentificador(f, src, nombre);
          if (archivo && archivo !== f && !esCompartido(archivo)) return { nombre, archivo, en: f };
        }
      }
    }
  }
  return null;
}

/** Los `route.ts` de app/api como segmentos, para ubicar cada endpoint. */
const RUTAS = [...archivos]
  .filter((f) => f.startsWith("app/api/") && /\/route\.(ts|js)$/.test(f))
  .map((f) => ({ archivo: f, segs: path.dirname(f).split("/").slice(1).filter((s) => !/^\(.*\)$/.test(s)) }));

function rutaDe(endpoint) {
  const segs = endpoint.split("/").filter(Boolean);
  let mejor = null;
  for (const r of RUTAS) {
    const resto = r.segs.some((s) => s.includes("..."));
    if (!resto && r.segs.length !== segs.length) continue;
    /* Puntaje por segmento: igual = 3, `${id}` contra `[id]` = 3, texto contra
       `[id]` = 1, `${id}` contra texto = 0 (puede ser, pero es la peor lectura:
       `/api/fiados/${id}` no es `/api/fiados/cobrar`). */
    let puntos = 0;
    let calza = true;
    for (const [i, s] of segs.entries()) {
      const rs = r.segs[i];
      if (rs === undefined || rs.includes("...")) {
        calza = resto;
        break;
      }
      if (s === rs || (s === ":x" && rs.startsWith("["))) puntos += 3;
      else if (rs.startsWith("[")) puntos += 1;
      else if (s !== ":x") {
        calza = false;
        break;
      }
    }
    if (calza && (!mejor || puntos > mejor.puntos)) mejor = { puntos, archivo: r.archivo };
  }
  return mejor?.archivo ?? null;
}

/** Roles de `requireAdmin` por método del route (una ayuda para RBAC, no un gate). */
function rolesDe(rutaArchivo) {
  const partes = leer(rutaArchivo).split(/export\s+(?:async\s+function\s+|const\s+)(GET|POST|PUT|PATCH|DELETE)\b/);
  const out = {};
  for (let i = 1; i < partes.length; i += 2) {
    const cuerpo = partes[i + 1] ?? "";
    const m = /requireAdmin\(\s*[\w.]+\s*,\s*([^)]*?)\s*\)/.exec(cuerpo);
    out[partes[i]] = m
      ? m[1].startsWith("[")
        ? m[1].replace(/[[\]"'\s]/g, "")
        : m[1]
      : /requireAdmin\(/.test(cuerpo)
        ? "requireAdmin"
        : "sin requireAdmin";
  }
  return out;
}

function analizar(f) {
  const src = leer(f);
  const endpoints = [
    ...new Set(
      [...src.matchAll(/["'`](\/api\/[^"'`\s]*)/g)].map((m) =>
        m[1].replace(/\$\{[^}]*\}/g, ":x").replace(/[?#].*$/, "").replace(/\/+$/, ""),
      ),
    ),
  ].filter((e) => e.length > "/api/".length);
  return {
    archivo: f,
    loc: src.split("\n").length,
    p: (src.match(/<p[\s>]/g) ?? []).length,
    infoTip: (src.match(/<InfoTip\b/g) ?? []).length,
    endpoints,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const [pedido, vistaPedida] = argv.filter((a) => !a.startsWith("--"));
  if (!pedido) {
    console.error("uso: node scripts/mapa-pestana.mjs <tab> [vista] [--todo] [--json]");
    process.exit(1);
  }
  let tab = pedido;
  let vista = vistaPedida;
  let alias = null;
  let montaje = montajeDe(tab);
  if (!montaje) {
    alias = aliasDe(pedido);
    if (!alias) {
      console.error(`❌ «${pedido}» no es pestaña del router (${ROUTER}) ni alias de ${MIGRACION}`);
      process.exit(1);
    }
    tab = alias.tab;
    vista ??= alias.vista;
    montaje = montajeDe(tab);
  }
  if (!montaje?.archivo) {
    console.error(`❌ no encontré el archivo del componente que monta «${tab}» en ${ROUTER}`);
    process.exit(1);
  }
  vista ??= montaje.initialTab;
  const deVista = vista ? componenteDeVista(montaje.archivo, vista) : null;
  const raiz = deVista?.archivo ?? montaje.archivo;

  /* El árbol: se baja por lo propio; lo compartido se nombra y no se recorre. */
  const arbol = new Map([[raiz, null]]);
  const compartidos = new Set();
  for (const f of arbol.keys()) {
    for (const d of deps.get(f) ?? []) {
      if (arbol.has(d) || d.startsWith("app/api/")) continue;
      if (esCompartido(d)) compartidos.add(d);
      else arbol.set(d, f);
    }
  }
  const filas = [...arbol.keys()].map((f) => ({
    ...analizar(f),
    desde: arbol.get(f),
    tambienEn: [...(importadores.get(f) ?? [])].filter((x) => !arbol.has(x)).sort(),
  }));
  filas.sort((a, b) => b.loc - a.loc);

  const porEndpoint = new Map();
  for (const f of filas) for (const e of f.endpoints) porEndpoint.set(e, [...(porEndpoint.get(e) ?? []), f.archivo]);
  const endpoints = [...porEndpoint]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([endpoint, usan]) => {
      const ruta = rutaDe(endpoint);
      return { endpoint, ruta, roles: ruta ? rolesDe(ruta) : null, usan };
    });
  const totales = {
    archivos: filas.length,
    loc: filas.reduce((n, f) => n + f.loc, 0),
    p: filas.reduce((n, f) => n + f.p, 0),
    infoTip: filas.reduce((n, f) => n + f.infoTip, 0),
    endpoints: endpoints.length,
    compartidos: compartidos.size,
  };
  const resultado = {
    pedido,
    ...(alias ? { alias } : {}),
    tab,
    montaje,
    ...(vista ? { vista, componenteDeVista: deVista } : {}),
    raiz,
    tambienMontadoEn: [...(importadores.get(raiz) ?? [])].filter((x) => x !== montaje.archivo && x !== deVista?.en && x !== ROUTER && x !== PRECARGA).sort(),
    totales,
    archivos: filas,
    endpoints,
    compartidos: [...compartidos].sort(),
  };

  if (argv.includes("--json")) {
    console.log(JSON.stringify(resultado, null, 2));
    return;
  }
  const corto = (f) => f.replace(/^components\/admin\//, "c/a/");
  console.log(`🗺️  ${pedido}${alias ? ` (alias → ${tab}${alias.vista ? `:${alias.vista}` : ""})` : ""} → ${montaje.comp}${montaje.initialTab ? ` initialTab="${montaje.initialTab}"` : ""} · ${montaje.archivo}`);
  if (vista) console.log(deVista ? `   vista «${vista}» → ${deVista.nombre} · ${deVista.archivo}` : `   vista «${vista}»: no encontré su componente; el árbol es el del hub entero`);
  if (resultado.tambienMontadoEn.length) console.log(`   también lo importan: ${resultado.tambienMontadoEn.join(", ")}`);
  console.log(`\n${totales.archivos} archivos propios · ${totales.loc} LOC · ${totales.p} <p> · ${totales.infoTip} InfoTip · ${totales.endpoints} endpoints · ${totales.compartidos} compartidos sin recorrer`);
  const mostrar = argv.includes("--todo") ? filas : filas.slice(0, 30);
  console.log(`\n  LOC   <p>   ⓘ  api  archivo${" ".repeat(52)}también lo importan`);
  for (const f of mostrar) {
    console.log(
      `${String(f.loc).padStart(5)} ${String(f.p).padStart(5)} ${String(f.infoTip).padStart(3)} ${String(f.endpoints.length).padStart(4)}  ${corto(f.archivo).padEnd(59)}${f.tambienEn.slice(0, 3).map(corto).join(", ")}${f.tambienEn.length > 3 ? ` +${f.tambienEn.length - 3}` : ""}`,
    );
  }
  if (mostrar.length < filas.length) console.log(`  … y ${filas.length - mostrar.length} más (--todo)`);
  console.log(`\nEndpoints (${endpoints.length}):`);
  for (const e of endpoints) {
    const roles = e.roles ? Object.entries(e.roles).map(([m, r]) => `${m} ${r}`).join(" · ") : "";
    console.log(`  ${e.endpoint.padEnd(52)} ${e.ruta ?? "(sin route.ts)"}${roles ? `  [${roles}]` : ""}`);
    console.log(`      ← ${e.usan.map(corto).join(", ")}`);
  }
  console.log(`\nCompartidos (no se recorren): ${[...compartidos].map((f) => path.basename(f).replace(/\.\w+$/, "")).sort().join(", ")}`);
}

main();
