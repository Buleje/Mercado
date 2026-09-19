#!/usr/bin/env node
/**
 * Guard de anidado HTML válido en JSX.
 *
 * Nació de un bug real (2026-08-08): `ModalFooter` envolvía en un `<p>` una
 * prop `ReactNode` que le pasaba quien lo llamaba. Funcionó meses porque todos
 * le mandaban texto; el día que un modal le pasó un `<details>` con un `<ul>`,
 * la consola del admin escupió cuatro errores de hidratación. `tsc`, `eslint` y
 * `vitest` pasaron los tres en VERDE con el bug vivo: el tipo `ReactNode` no
 * modela "acá no entra contenido de bloque".
 *
 * El `<p>` no tolera bloque: el navegador lo auto-cierra al parsear y saca el
 * bloque afuera, así que el árbol que React hidrata deja de ser el que
 * renderizó. Lo mismo con un `<a>` o un `<input>` colgando de un `<button>`.
 *
 * Por qué en dos pasos y no con un grep: el `<p>` vive en un componente y el
 * bloque en OTRO. Un escáner que mira un archivo a la vez encuentra CERO.
 *
 *   Paso A — wrappers: componentes que renderean dentro de un `<p>` un
 *            identificador tipado `ReactNode` (o `children`).
 *   Paso B — llamadores: quién le pasa a esa prop un tag de bloque.
 *   Rotura = A ∩ B. Eso es lo que rompe HOY.
 *
 * Uso:
 *   node scripts/check-html-nesting.mjs                 # roturas reales (exit 1 si hay)
 *   node scripts/check-html-nesting.mjs --strict        # + wrappers en riesgo (no falla)
 *   node scripts/check-html-nesting.mjs components/admin # acotar a unas rutas
 */

import ts from "typescript";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve as resolverPath } from "node:path";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const roots = args.filter((a) => !a.startsWith("--"));
const RAICES = roots.length > 0 ? roots : ["components", "app", "packages"];

/** Elementos que un `<p>` no puede contener (le cierran el párrafo al parsear). */
const BLOQUE = new Set([
  "div", "ul", "ol", "li", "details", "summary", "table", "section", "article",
  "header", "footer", "nav", "aside", "pre", "form", "figure", "blockquote",
  "hr", "p", "h1", "h2", "h3", "h4", "h5", "h6", "dl", "dd", "dt", "main", "fieldset",
]);
/** Controles que no pueden anidarse dentro de otro control. */
const INTERACTIVO = new Set(["button", "a", "input", "select", "textarea"]);

const archivos = RAICES.flatMap((r) => {
  try {
    return execFileSync("find", [r, "-name", "*.tsx", "-not", "-path", "*/node_modules/*"], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 64,
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
});

const cache = new Map();
function parse(file) {
  if (!cache.has(file)) {
    cache.set(
      file,
      ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
    );
  }
  return cache.get(file);
}

const tagDe = (n, sf) =>
  ts.isJsxElement(n)
    ? n.openingElement.tagName.getText(sf)
    : ts.isJsxSelfClosingElement(n)
      ? n.tagName.getText(sf)
      : null;

/**
 * De qué archivo sale el componente `<Tag>` usado en `file`.
 *
 * Por qué existe (2026-09-19): el cruce del Paso B buscaba el wrapper por
 * NOMBRE (`Etapa.children`) sin mirar de dónde venía. Dos componentes homónimos
 * —uno exportado en `historia/EtapasDelLote`, otro privado en
 * `LothTraceResumen`— daban dos roturas falsas y bloqueaban un commit legítimo.
 *
 * Devuelve el path del archivo que lo define, o `null` si no se pudo resolver
 * (import de un paquete, re-export, alias raro). **`null` es deliberadamente
 * permisivo con el gate, no con el código**: quien llama lo trata como «no sé,
 * reportá igual» — un gate que se calla por no saber es peor que uno que grita.
 */
const EXTENSIONES = [".tsx", ".ts", "/index.tsx", "/index.ts"];
const cacheOrigen = new Map();

function resolverArchivo(base) {
  for (const ext of EXTENSIONES) {
    const p = base + ext;
    if (existsSync(p)) return p;
  }
  return null;
}

/* `find` devuelve rutas relativas cuando la raíz es relativa y absolutas cuando
   es absoluta, mientras que `path.resolve` siempre da absolutas. Compararlas
   como strings da falso en algún caso y el gate deja de reportar roturas DE
   VERDAD — un falso negativo que sólo aparece al probarlo con un caso real, y
   que un gate mudo no delata. Por eso se comparan resueltas a absoluto. */
const mismoArchivo = (a, b) => resolverPath(a) === resolverPath(b);

function origenDe(tag, file, sf) {
  const clave = `${file}|${tag}`;
  if (cacheOrigen.has(clave)) return cacheOrigen.get(clave);

  // El nombre puede venir calificado (`Foo.Bar`): manda el primer segmento.
  const raiz = tag.split(".")[0];
  let origen = null;

  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause) continue;
    const nombres = [];
    if (st.importClause.name) nombres.push(st.importClause.name.getText(sf));
    const b = st.importClause.namedBindings;
    if (b && ts.isNamedImports(b)) for (const e of b.elements) nombres.push(e.name.getText(sf));
    if (b && ts.isNamespaceImport(b)) nombres.push(b.name.getText(sf));
    if (!nombres.includes(raiz)) continue;

    const spec = st.moduleSpecifier.getText(sf).slice(1, -1);
    if (spec.startsWith(".")) origen = resolverArchivo(resolverPath(dirname(file), spec));
    else if (spec.startsWith("@/")) origen = resolverArchivo(resolverPath(process.cwd(), spec.slice(2)));
    // Un paquete de node_modules no se resuelve: queda `null` = «no sé».
    break;
  }

  // Sin import que lo traiga, o es local o viene de un `declare`: si el archivo
  // lo define, el origen es él mismo.
  if (!origen) {
    const defineAca = sf.statements.some(
      (st) =>
        (ts.isFunctionDeclaration(st) && st.name?.getText(sf) === raiz) ||
        (ts.isVariableStatement(st) &&
          st.declarationList.declarations.some((d) => d.name.getText(sf) === raiz)),
    );
    if (defineAca) origen = file;
  }

  cacheOrigen.set(clave, origen);
  return origen;
}

/** Componente que contiene al nodo (la función con nombre más cercana). */
function componenteDe(node, sf) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isFunctionDeclaration(n) && n.name) return n.name.getText(sf);
    if (ts.isVariableDeclaration(n) && n.name && n.initializer) {
      if (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) {
        return n.name.getText(sf);
      }
    }
  }
  return null;
}

/** Tags de bloque intrínsecos dentro de un subárbol JSX. */
function bloquesEn(node, sf) {
  const out = [];
  (function escanear(n) {
    const t = tagDe(n, sf);
    if (t && /^[a-z]/.test(t) && BLOQUE.has(t)) out.push(t);
    ts.forEachChild(n, escanear);
  })(node);
  return [...new Set(out)];
}

// ── Anidado dentro de UN archivo (lo que sí se ve sin cruzar componentes) ──
const directos = [];
// ── Paso A: wrappers que meten un ReactNode ajeno en un `<p>` ──
// Un mismo `Comp.prop` puede pintarse en VARIOS `<p>` (tres ramas de un
// ternario, tres tamaños de una card). Guardar sólo el último dejaba dos
// afuera del informe y del saneo, así que va una lista por clave.
const wrappers = new Map(); // "Comp.prop" -> [{file, linea}, …]
const anotarWrapper = (clave, ubic) => {
  const previas = wrappers.get(clave) ?? [];
  if (!previas.some((u) => u.file === ubic.file && u.linea === ubic.linea)) {
    wrappers.set(clave, [...previas, ubic]);
  }
};

for (const file of archivos) {
  const src = readFileSync(file, "utf8");
  const sf = parse(file);

  // Props del archivo tipadas como nodo JSX: reciben markup de terceros.
  const ajenos = new Set(["children"]);
  (function recolectar(n) {
    if (
      (ts.isPropertySignature(n) || ts.isPropertyDeclaration(n)) &&
      n.type &&
      /\bReactNode\b|\bReactElement\b|\bJSX\.Element\b/.test(n.type.getText(sf)) &&
      n.name
    ) {
      ajenos.add(n.name.getText(sf));
    }
    ts.forEachChild(n, recolectar);
  })(sf);

  (function recorrer(n, pila) {
    const tag = tagDe(n, sf);
    let nueva = pila;
    if (tag && /^[a-z][a-z0-9]*$/.test(tag)) {
      const linea = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
      const p = pila.find((s) => s.tag === "p");
      if (p && BLOQUE.has(tag)) {
        directos.push(`${file}:${linea}  <${tag}> dentro de <p> (abierto en :${p.linea})`);
      }
      const ctrl = pila.find((s) => s.tag === "button" || s.tag === "a");
      if (ctrl && INTERACTIVO.has(tag)) {
        directos.push(`${file}:${linea}  <${tag}> dentro de <${ctrl.tag}> (abierto en :${ctrl.linea})`);
      }
      nueva = [...pila, { tag, linea }];
    }
    // Paso A: `<p>` cuyo hijo es una expresión que menciona una prop ajena.
    if (ts.isJsxElement(n) && tagDe(n, sf) === "p") {
      for (const hijo of n.children) {
        if (!ts.isJsxExpression(hijo) || !hijo.expression) continue;
        (function buscarId(x) {
          if (ts.isIdentifier(x) && ajenos.has(x.text)) {
            const comp = componenteDe(n, sf);
            if (comp) {
              const linea = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
              anotarWrapper(`${comp}.${x.text}`, { file, linea });
            }
          }
          ts.forEachChild(x, buscarId);
        })(hijo.expression);
      }
    }
    ts.forEachChild(n, (c) => recorrer(c, nueva));
  })(sf, []);

  void src;
}

// ── Paso B: llamadores que le pasan bloque a esas props ──
const roturas = [];
for (const file of archivos) {
  const sf = parse(file);
  (function recorrer(n) {
    const apertura = ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : null;
    if (apertura) {
      const tag = apertura.tagName.getText(sf);
      if (/^[A-Z]/.test(tag)) {
        /* El wrapper se busca por nombre, así que hay que confirmar que ESTE
           `<Tag>` es el mismo componente y no un homónimo de otro archivo. Si
           el origen no se puede resolver (`null`), se conserva la sospecha. */
        const origen = origenDe(tag, file, sf);
        const esElMismo = (clave) =>
          origen == null || (wrappers.get(clave) ?? []).some((u) => mismoArchivo(u.file, origen));

        for (const attr of apertura.attributes.properties) {
          if (!ts.isJsxAttribute(attr) || !attr.initializer) continue;
          const clave = `${tag}.${attr.name.getText(sf)}`;
          if (!wrappers.has(clave) || !esElMismo(clave)) continue;
          const bloques = bloquesEn(attr.initializer, sf);
          if (bloques.length) {
            const linea = sf.getLineAndCharacterOfPosition(attr.getStart(sf)).line + 1;
            roturas.push({ clave, file, linea, bloques });
          }
        }
        if (ts.isJsxElement(n) && wrappers.has(`${tag}.children`) && esElMismo(`${tag}.children`)) {
          const bloques = [...new Set(n.children.flatMap((c) => bloquesEn(c, sf)))];
          if (bloques.length) {
            const linea = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
            roturas.push({ clave: `${tag}.children`, file, linea, bloques });
          }
        }
      }
    }
    ts.forEachChild(n, recorrer);
  })(sf);
}

// ── Informe ──
const unicos = [...new Set(directos)];
let hayError = false;

if (unicos.length) {
  hayError = true;
  console.log(`\n✖ ${unicos.length} anidado(s) inválido(s) dentro de un mismo archivo:\n`);
  unicos.forEach((d) => console.log(`  ${d}`));
}

if (roturas.length) {
  hayError = true;
  console.log(`\n✖ ${roturas.length} rotura(s) entre componentes — un <p> recibe bloque de su llamador:\n`);
  for (const r of roturas) {
    console.log(`  ${r.clave}  <- ${r.file}:${r.linea} pasa <${r.bloques.join(">, <")}>`);
    for (const w of wrappers.get(r.clave) ?? []) {
      console.log(`     el <p> está en ${w.file}:${w.linea}`);
    }
  }
}

const ubicaciones = [...wrappers.values()].flat();

if (strict) {
  console.log(
    `\n⚠ ${ubicaciones.length} <p> en riesgo, en ${wrappers.size} wrapper(s) (envuelven un ReactNode ajeno; hoy nadie les pasa bloque):\n`,
  );
  for (const [clave, ubics] of [...wrappers].sort()) {
    for (const w of ubics) console.log(`  ${clave.padEnd(38)} ${w.file}:${w.linea}`);
  }
}

if (!hayError) {
  console.log(
    `\n✓ Sin anidado inválido — ${archivos.length} archivos, ${ubicaciones.length} <p> con ReactNode ajeno vigilados.`,
  );
}
process.exit(hayError ? 1 : 0);
