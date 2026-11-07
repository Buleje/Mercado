#!/usr/bin/env node
/**
 * barrido-portales-en-dialogos.mjs — ¿qué componente portalea a `document.body`
 * y puede quedar mudo bajo un AdminModal/Dialog de Radix abierto?
 *
 * Hermano de `barrido-modales-anidados.mjs` (mismo bug, otra forma). Ese barrido
 * encontró que un AdminModal (z-50) montado DENTRO de un modal a mano de z>50 se
 * queda invisible. Este cubre el otro defecto real que el navegador encontró y
 * el primer barrido NO veía: `action-menu.tsx` (el menú de fila) hacía
 * `createPortal(menu, document.body)`. Con un `AdminModal` (Radix) abierto,
 * Radix le pone `pointer-events: none` al `<body>` — el menú se VEÍA pero
 * ningún ítem recibía clic, y Escape se llevaba las dos capas de un tirón. El
 * arreglo real está en `components/admin/shared/action-menu.tsx`
 * (`marcoDeFixed` + portal al `[role="dialog"]` ancestro vía `portalARef`,
 * `git diff` de esa fecha) y se copió a `libro-chrome.tsx`.
 *
 * Qué mira, por llamada de portal encontrada en el archivo:
 *   - `createPortal(hijos, document.body)`            → CONTENEDOR LITERAL (mal)
 *   - `createPortal(hijos, ref.current ?? document.body)` → CONTENEDOR ELEGIDO (bien:
 *     el fallback a body sigue ahí para cuando no hay diálogo ancestro, pero la
 *     llamada YA decide en runtime — es el patrón del fix real de arriba)
 *   - `document.body.appendChild(overlay)` sin resolver ancestro → igual de malo
 *     para un overlay que necesita clics reales (un menú, un panel) — se
 *     ignoran a propósito los usos que NO necesitan hit-testing real: un
 *     `<a download>` que se `.click()`ea por código, un iframe oculto para
 *     imprimir, algo con `pointer-events-none`, o una región `sr-only` para el
 *     lector de pantalla. Ninguno de esos se rompe con `body` bloqueado.
 *
 * "Ya resuelto" (OK) además cuenta si el archivo usa `.closest('[role="dialog"]')`
 * o `marcoDeFixed(` en cualquier parte, aunque la llamada puntual no lo muestre.
 *
 * Raíces (2026-09-14, segunda revisión): una raíz es el archivo que DIBUJA el
 * contenido del diálogo — su PROPIO JSX usa `<Dialog.Content`,
 * `<AlertDialog.Content` (el alias sale del propio `import * as Alias from
 * "@radix-ui/react-(alert-)dialog"` del archivo, no un nombre fijo) o
 * `<AdminModal`. Un wrapper de un wrapper (`ConfirmDeleteDialog` sobre
 * `AdminModal`) cae solo bajo la misma regla, porque su propio JSX YA tiene
 * `<AdminModal`.
 *
 * Ronda anterior (misma fecha) probó "raíz = quién IMPORTA, transitivo, a
 * alguien que abre un diálogo" y dio 3 falsos positivos reales: `RecipeModal`
 * (un `Dialog.Content` de verdad) se alcanzaba desde `MarketplaceContent` sólo
 * porque ésta importa, a través de dos saltos más, a `MarketplaceRecipesWidget`
 * — pero `MarketplaceContent` NO dibuja el diálogo, sólo monta esa sección como
 * una más entre muchas hermanas (`FlyToCartProvider` en la raíz de la página,
 * `MarketplaceRecipesWidget` en otra sección, medido con `grep` de línea).
 * "Importa transitivamente" ≠ "dibuja" — de ahí la vuelta a un chequeo directo
 * del JSX propio, sin propagar el estado de raíz hacia arriba por el grafo.
 *
 * Grafo de "quién renderiza a quién" (para la BÚSQUEDA de portales, no para
 * decidir la raíz): sigue imports reales (import Y usado como JSX) Y carga
 * perezosa (`dynamic(() => import("./X"))`, `lazy(...)`, `React.lazy(...)`) —
 * sin esto, `CtpEntriesView` → `Anexo04Modal` (que entra por `next/dynamic`,
 * como 74 archivos más en admin) daba invisible. Desde cada raíz, busca
 * portales-a-body hasta 3 saltos, Y en la raíz misma (salto 0: un componente
 * puede tener su propio AdminModal y su propio portal a body en el mismo
 * archivo).
 *
 * LÍMITE CONOCIDO — que una raíz DIBUJE el diálogo no prueba que el hallazgo
 * DIBUJE adentro de ÉL: `CacaoAcopio.tsx` abre `AdminModal` para anular/pagar
 * (línea propia) y también renderiza `CacaoNoticiero` → `ChartPresentationModal`
 * en otra parte del mismo archivo — sigue apareciendo, y sigue siendo un caso
 * para revisar a mano (confirmado: `ChartPresentationModal` se monta en la
 * vista "mercado", AFUERA de esos dos `AdminModal`), no una prueba de choque
 * en runtime. Un ⚠ es pie para mirar dónde se monta, no una condena.
 *
 * Modo standalone — probar UN archivo suelto (p. ej. una versión vieja copiada
 * fuera del repo con `git show HEAD~5:ruta > /tmp/x.tsx`), sin grafo:
 *   node scripts/barrido-portales-en-dialogos.mjs --archivo /tmp/x.tsx
 *
 * Modo normal — barrido real, acota opcionalmente las raíces del grafo:
 *   node scripts/barrido-portales-en-dialogos.mjs                # components/ + app/
 *   node scripts/barrido-portales-en-dialogos.mjs components/admin
 *
 * Exit code 1 si queda algún ⚠.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, basename, extname, resolve } from "node:path";

const RAIZ = process.cwd();
const EXTS = new Set([".tsx", ".ts"]);
const EXCLUIR = /(?:^|\/)(?:node_modules|\.next|__tests__)(?:\/|$)|\.(?:test|stories)\.|\.d\.ts$/;

function listar(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (EXCLUIR.test(p)) continue;
    if (e.isDirectory()) listar(p, out);
    else if (EXTS.has(extname(e.name))) out.push(p);
  }
  return out;
}

/**
 * Cuerpo balanceado de una llamada `nombre(...)`, consciente de strings/template
 * literals (para no contar un `(` o `)` que viven adentro de un texto o un
 * `aria-label`). No resuelve `${}` anidados dentro de un template literal —
 * simplificación aceptada, igual que el resto de este barrido heurístico.
 */
function cuerpoDeLlamada(s, desdeAperturaExclusiva) {
  let profundidad = 1;
  let i = desdeAperturaExclusiva;
  let enString = null;
  while (i < s.length && profundidad > 0) {
    const c = s[i];
    if (enString) {
      if (c === "\\") { i += 2; continue; }
      if (c === enString) enString = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { enString = c; i++; continue; }
    if (c === "(") profundidad++;
    else if (c === ")") profundidad--;
    i++;
  }
  return s.slice(desdeAperturaExclusiva, i - 1);
}

/** ¿El texto justo antes de `idx` termina en `??` o `||`? = fallback, no literal. */
function esFallbackElegido(texto, idx) {
  const antes = texto.slice(Math.max(0, idx - 60), idx).trimEnd();
  return /(\?\?|\|\|)$/.test(antes);
}

/**
 * Filtra los `document.body.appendChild(...)` que NO necesitan clic real:
 * descarga programática (`.click()` sobre el mismo nodo), iframe oculto para
 * imprimir, algo marcado `pointer-events-none`, o una región `sr-only`/`aria-live`
 * para el lector de pantalla. Ventana amplia porque el nodo suele crearse
 * varias líneas antes del `appendChild`.
 */
function pareceOverlayInteractivo(s, idx) {
  const ventana = s.slice(Math.max(0, idx - 400), idx + 200);
  if (/\.click\(\)/.test(ventana)) return false;
  if (/createElement\(\s*["']iframe["']\s*\)/.test(ventana)) return false;
  if (/pointer-events:\s*none|pointer-events-none/.test(ventana)) return false;
  if (/sr-only|aria-live/.test(ventana)) return false;
  return true;
}

const RE_CLOSEST_DIALOG = /\.closest(?:<[^>]*>)?\(\s*(['"`])\[role=(?:"dialog"|'dialog')\]\1\s*\)/;
const RE_MARCO_DE_FIXED = /\bmarcoDeFixed\(/;

/**
 * Clasifica el CÓDIGO FUENTE de un archivo (string, no ruta) — exportada para
 * poder testearla directo con vitest sobre snippets, sin tocar el filesystem
 * ni el grafo de imports.
 *
 * Devuelve `hallazgos: []` cuando el archivo no portalea a `document.body` en
 * ninguna forma reconocida (no es candidato: no hay nada que revisar).
 */
export function clasificarFuente(codigo) {
  const hallazgos = [];

  const reCall = /createPortal\(/g;
  let m;
  while ((m = reCall.exec(codigo))) {
    const cuerpo = cuerpoDeLlamada(codigo, m.index + m[0].length);
    const idxBody = cuerpo.lastIndexOf("document.body");
    if (idxBody === -1) continue; // portalea a otro lado (ref, state) — no es este bug
    hallazgos.push({
      tipo: "createPortal",
      linea: codigo.slice(0, m.index).split("\n").length,
      elegido: esFallbackElegido(cuerpo, idxBody),
    });
  }

  const reAppendDirecto = /document\.body\.appendChild\(/g;
  while ((m = reAppendDirecto.exec(codigo))) {
    if (!pareceOverlayInteractivo(codigo, m.index)) continue;
    hallazgos.push({ tipo: "appendChild", linea: codigo.slice(0, m.index).split("\n").length, elegido: false });
  }

  // `(algoRef.current ?? document.body).appendChild(...)` — ya resuelto en la
  // propia llamada, mismo espíritu que el fallback de `createPortal`.
  const reAppendElegido = /\(([^()]{0,80}(?:\?\?|\|\|)[^()]{0,40}document\.body)\)\.appendChild\(/g;
  while ((m = reAppendElegido.exec(codigo))) {
    hallazgos.push({ tipo: "appendChild", linea: codigo.slice(0, m.index).split("\n").length, elegido: true });
  }

  if (hallazgos.length === 0) return { ok: true, hallazgos, resuelveAncestro: false };

  const resuelveAncestro = RE_CLOSEST_DIALOG.test(codigo) || RE_MARCO_DE_FIXED.test(codigo);
  const ok = resuelveAncestro || hallazgos.every((h) => h.elegido);
  return { ok, hallazgos, resuelveAncestro };
}

// ─── CLI: sólo corre si este archivo es el entrypoint, no cuando lo importa
// un test (`import { clasificarFuente } from "..."`) — sin esto, importar la
// función exportada disparaba el barrido completo del repo Y `process.exit`.
const esEntrypoint = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (esEntrypoint) main();

function main() {

// ─── Modo standalone: un solo archivo, sin grafo ────────────────────────────

const args = process.argv.slice(2);
const iArchivo = args.indexOf("--archivo");
if (iArchivo !== -1) {
  const ruta = args[iArchivo + 1];
  if (!ruta || !existsSync(ruta)) {
    console.error(`--archivo requiere una ruta existente (recibí: ${ruta ?? "nada"})`);
    process.exit(2);
  }
  const codigo = readFileSync(ruta, "utf8");
  const r = clasificarFuente(codigo);
  if (r.hallazgos.length === 0) {
    console.log(`(sin portales a document.body)  ${ruta}`);
    process.exit(0);
  }
  for (const h of r.hallazgos) {
    const marca = h.elegido || r.resuelveAncestro ? "OK " : "⚠ PORTAL A BODY";
    console.log(`${marca}  ${ruta}:${h.linea} (${h.tipo}${h.elegido ? ", contenedor elegido" : ""}${r.resuelveAncestro ? ", resuelve ancestro" : ""})`);
  }
  process.exit(r.ok ? 0 : 1);
}

// ─── Modo grafo: barrido real del repo ──────────────────────────────────────

const raicesBusqueda = args.filter((a) => !a.startsWith("--"));
// Absolutas desde el arranque: si no, un `spec` relativo (`./X`) resuelto
// contra un `desde` absoluto (por ejemplo una raíz de búsqueda fuera del repo,
// como un directorio temporal de test) terminaba en una clave distinta de la
// que guardó `listar()`, y el hijo "no existía" para el grafo.
const dirs = (raicesBusqueda.length > 0 ? raicesBusqueda : ["components", "app"]).map((d) => resolve(d));
const archivos = dirs.flatMap((d) => listar(d));
const src = new Map(archivos.map((f) => [f, readFileSync(f, "utf8")]));

function resolver(desde, spec) {
  let base;
  if (spec.startsWith(".")) base = join(dirname(desde), spec);
  else if (spec.startsWith("@/")) base = join(RAIZ, spec.slice(2));
  else return null; // paquete externo (react-dom, @radix-ui/*, ...) — no seguimos
  for (const ext of [".tsx", ".ts"]) {
    const p = base + ext;
    if (existsSync(p)) return p;
  }
  for (const ext of [".tsx", ".ts"]) {
    const p = join(base, "index" + ext);
    if (existsSync(p)) return p;
  }
  if (existsSync(base) && statSync(base).isFile()) return base;
  return null;
}

const RE_IMPORT = /import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*["']([^"']+)["']/g;
/** `const X = dynamic(() => import("./Y"), {...})` / `lazy(...)` / `React.lazy(...)`.
 *  No hace falta resolver qué exporta `./Y` (default, o `.then(m => m.Named)`):
 *  el nombre que importa acá es `X`, el identificador que el archivo YA usa
 *  como `<X>` más abajo. */
const RE_LAZY = /(?:const|let|var)\s+(\w+)\s*=\s*(?:React\.)?(?:dynamic|lazy)\(\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']\s*\)/g;

const hijosCache = new Map();
/** Hijos renderizados de verdad: importados (estático o `dynamic`/`lazy`) Y
 *  usados como `<Nombre`. Cubre default (`import Foo from`) Y named
 *  (`import { Foo, Bar as Baz } from`) — el barrido hermano sólo resolvía el
 *  default, y varios de los hallazgos de éste (p. ej. `ChartPresentationModal`)
 *  sólo se importan por nombre. Memoizado: se recorre repetido al calcular la
 *  clausura de raíces (sin esto, un archivo muy importado se re-parsea una
 *  vez por cada iteración del punto fijo). */
function hijos(f) {
  if (hijosCache.has(f)) return hijosCache.get(f);
  const s = src.get(f) ?? "";
  const out = [];
  for (const m of s.matchAll(RE_IMPORT)) {
    const [, def, named, spec] = m;
    const p = resolver(f, spec);
    if (!p || !src.has(p)) continue;
    const nombres = [];
    if (def) nombres.push(def);
    if (named) {
      for (const parte of named.split(",")) {
        const limpio = parte.replace(/^\s*type\s+/, "").trim();
        if (!limpio) continue;
        nombres.push(limpio.split(/\s+as\s+/).pop().trim());
      }
    }
    if (nombres.length === 0) nombres.push(basename(p, extname(p)));
    if (nombres.some((n) => new RegExp(`<${n}[\\s/>]`).test(s))) out.push(p);
  }
  for (const m of s.matchAll(RE_LAZY)) {
    const [, nombre, spec] = m;
    const p = resolver(f, spec);
    if (!p || !src.has(p)) continue;
    if (new RegExp(`<${nombre}[\\s/>]`).test(s)) out.push(p);
  }
  hijosCache.set(f, out);
  return out;
}

// ─── Raíces: el archivo DIBUJA el diálogo, no sólo lo importa (transitivo) ──
// Ver comentario de cabecera — "importa" de sobra marcó como raíz a páginas
// enteras que sólo tenían el diálogo real escondido 2-3 saltos adentro, en una
// sección hermana sin relación con el resto del archivo (falso positivo real,
// medido: `MarketplaceContent` vía `MarketplaceRecipesWidget` → `RecipeModal`).
// El alias de Radix (`Dialog`, `AlertDialog`, o cualquier otro que alguien
// elija) sale del propio `import * as Alias from "@radix-ui/react-...dialog"`
// del archivo — no está escrito a mano.
const RE_IMPORT_NAMESPACE_DIALOG = /import\s+\*\s+as\s+(\w+)\s+from\s+["']@radix-ui\/react-(?:alert-)?dialog["']/g;
function esRaizDeDialogo(f) {
  const s = src.get(f) ?? "";
  if (/<AdminModal[\s/>]/.test(s)) return true;
  for (const m of s.matchAll(RE_IMPORT_NAMESPACE_DIALOG)) {
    if (new RegExp(`<${m[1]}\\.Content[\\s/>]`).test(s)) return true;
  }
  return false;
}
const raices = new Set(archivos.filter(esRaizDeDialogo));

const hallazgos = [];
const clasificados = new Map(); // archivo -> resultado de clasificarFuente (cache)
const clasificar = (f) => {
  if (!clasificados.has(f)) clasificados.set(f, clasificarFuente(src.get(f) ?? ""));
  return clasificados.get(f);
};

for (const raiz of raices) {
  // Salto 0: la raíz misma puede tener su propio AdminModal Y su propio portal
  // a body en el mismo archivo — el barrido hermano no mira esto, éste sí.
  const candidatos = [{ archivo: raiz, profundidad: 0 }];
  const visto = new Set([raiz]);
  let frontera = hijos(raiz);
  for (let d = 1; d <= 3 && frontera.length; d++) {
    const siguiente = [];
    for (const h of frontera) {
      if (visto.has(h)) continue;
      visto.add(h);
      candidatos.push({ archivo: h, profundidad: d });
      siguiente.push(...hijos(h));
    }
    frontera = siguiente;
  }
  for (const { archivo, profundidad } of candidatos) {
    const r = clasificar(archivo);
    if (r.hallazgos.length === 0) continue;
    hallazgos.push({ raiz, archivo, profundidad, ok: r.ok, hallazgos: r.hallazgos });
  }
}

const vistos = new Set();
let nOk = 0, nMal = 0;
for (const h of hallazgos.sort((a, b) => Number(a.ok) - Number(b.ok))) {
  const k = h.raiz + "→" + h.archivo;
  if (vistos.has(k)) continue;
  vistos.add(k);
  if (h.ok) nOk++; else nMal++;
  const cadena = h.profundidad === 0 ? basename(h.raiz) : `${basename(h.raiz)} → ${basename(h.archivo)}`;
  const lineas = h.hallazgos.map((x) => `L${x.linea}`).join(",");
  console.log(`${h.ok ? "OK " : "⚠ PORTAL A BODY"}  ${cadena} (a ${h.profundidad} salto${h.profundidad === 1 ? "" : "s"}, ${lineas})`);
}
console.log(`\n${hallazgos.length === 0 ? 0 : nOk + nMal} hallazgo(s): ${nOk} OK, ${nMal} ⚠ PORTAL A BODY`);
process.exit(nMal > 0 ? 1 : 0);

} // fin main()
