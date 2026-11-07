#!/usr/bin/env node
/*
 * pruebas-relacionadas.mjs <archivos…> — los tests del proyecto `unit` que dependen (directa o
 * indirectamente) de esos archivos. Reemplaza la búsqueda de `vitest related`, que armaba el grafo
 * de módulos de los 2.254 tests en CADA llamada: 30 s fijos aunque corriera 1 test (04-11: 34 s
 * contra 4,5 s directo; el commit y probar.sh lo pagaban siempre).
 *
 * Cómo: lee los import/export/import()/require/vi.mock de cada archivo de código (14 mil), recuerda
 * lo leído en node_modules/.cache (solo relee lo que cambió de fecha o tamaño) y recorre al revés
 * desde los archivos pedidos. Es MÁS ancho que vitest (cuenta también imports que solo usan tipos
 * sin `import type`): puede correr algún test de más, nunca de menos.
 *
 * Salida: la lista en una línea (separada por espacios). Código 3 sin salida = hay que correr TODO
 * o no se pudo decidir (el que llama vuelve a `vitest related`): un archivo pedido es parte de
 * vitest.setup.ts (lo cargan todos los tests) o no se pudo leer el repo.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import path from "node:path";

const P = path.posix;
let raiz;
try {
  raiz = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
} catch {
  process.exit(3);
}
process.chdir(raiz);

const CODIGO = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const FUERA = /^(node_modules|\.next|reports|coverage|public|dist|out|storybook-static)\//;
const ES_TEST = (f) => /^__tests__\/.+\.test\.tsx?$/.test(f) && !/^__tests__\/vrt\/.*\.vrt\.test\.tsx?$/.test(f);
const SETUP = ["vitest.setup.ts"];

let lista;
try {
  lista = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0")
    .filter((f) => f && CODIGO.test(f) && !FUERA.test(f));
} catch {
  process.exit(3);
}
const existe = new Set(lista);
for (const s of SETUP) existe.add(s);

/* import/export … from "x" · import "x" · import("x") · require("x") · vi.mock("x") y parientes.
   `import type` / `export type … from` no cuentan: vite los borra y vitest tampoco los sigue. */
const RE_ESTATICO = /(?:^|[^.\w$])(?:import|export)\s+(type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?["']([^"'\n]+)["']/g;
const RE_LLAMADA = /(?:^|[^.\w$])(?:import|require|vi\.(?:mock|doMock|unmock|doUnmock|importActual|importMock))\s*\(\s*["'`]([^"'`$\n]+)["'`]/g;
function leerImports(texto) {
  const out = new Set();
  for (const m of texto.matchAll(RE_ESTATICO)) if (!m[1]) out.add(m[2]);
  for (const m of texto.matchAll(RE_LLAMADA)) out.add(m[1]);
  return [...out];
}

const SUFIJOS = ["", ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", "/index.ts", "/index.tsx", "/index.js", "/index.jsx", "/index.mjs"];
function resolver(desde, spec) {
  let base;
  const s = spec.replace(/[?#].*$/, "");
  if (s.startsWith("@/")) base = s.slice(2);
  else if (s === "@buleje/design-system") base = "packages/design-system/src/index";
  else if (s.startsWith("@buleje/design-system/")) base = `packages/design-system/src/${s.slice("@buleje/design-system/".length)}`;
  else if (s.startsWith(".")) base = P.join(P.dirname(desde), s);
  else return null; // paquete de node_modules
  base = P.normalize(base);
  for (const suf of SUFIJOS) if (existe.has(base + suf)) return base + suf;
  const sinJs = base.replace(/\.(m|c)?jsx?$/, "");
  if (sinJs !== base) for (const suf of [".ts", ".tsx", ".mts", ".cts"]) if (existe.has(sinJs + suf)) return sinJs + suf;
  return null;
}

// Caché de lo leído: { v, archivos: { ruta: [mtimeMs, tamaño, [specs]] } }
const DIR_CACHE = P.join(raiz, "node_modules/.cache");
const ARCHIVO_CACHE = P.join(DIR_CACHE, "buleje-pruebas-relacionadas.json");
let cache = { v: 1, archivos: {} };
try {
  const c = JSON.parse(readFileSync(ARCHIVO_CACHE, "utf8"));
  if (c?.v === 1 && c.archivos) cache = c;
} catch { /* sin caché: se lee todo (~2-3 s) */ }
let cambios = 0;
const nueva = {};
const inversa = new Map();
for (const f of existe) {
  let st;
  try { st = statSync(f); } catch { continue; }
  const viejo = cache.archivos[f];
  let specs;
  if (viejo && viejo[0] === st.mtimeMs && viejo[1] === st.size) specs = viejo[2];
  else {
    try { specs = leerImports(readFileSync(f, "utf8")); } catch { specs = []; }
    cambios++;
  }
  nueva[f] = [st.mtimeMs, st.size, specs];
  for (const spec of specs) {
    const d = resolver(f, spec);
    if (!d) continue;
    let s = inversa.get(d);
    if (!s) inversa.set(d, (s = new Set()));
    s.add(f);
  }
}
if (cambios || Object.keys(cache.archivos).length !== Object.keys(nueva).length) {
  try {
    mkdirSync(DIR_CACHE, { recursive: true });
    const tmp = `${ARCHIVO_CACHE}.${process.pid}`;
    writeFileSync(tmp, JSON.stringify({ v: 1, archivos: nueva }));
    renameSync(tmp, ARCHIVO_CACHE);
  } catch { /* sin caché la próxima vez: solo más lento */ }
}

const pedidos = process.argv.slice(2).map((a) => P.normalize(path.relative(raiz, path.resolve(a)).split(path.sep).join("/")));
const visto = new Set();
const cola = [];
for (const f of pedidos) if (!visto.has(f)) { visto.add(f); cola.push(f); }
while (cola.length) {
  const f = cola.pop();
  for (const quien of inversa.get(f) ?? []) if (!visto.has(quien)) { visto.add(quien); cola.push(quien); }
}
if (SETUP.some((s) => visto.has(s))) process.exit(3); // lo carga cada test: correr todo por la vía de vitest
const tests = [...visto].filter(ES_TEST).sort();
if (tests.length) process.stdout.write(`${tests.join(" ")}\n`);
