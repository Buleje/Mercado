/**
 * Partir un componente gigante en hooks ENCADENADOS + piezas de JSX + módulos, sin transcribir:
 * cada salida copia rangos de líneas del original congelado y el script resuelve, con el
 * TypeChecker de TypeScript (no con regex), qué nombre viene de dónde:
 *   - import del original → el mismo import (rutas relativas reescritas a la carpeta nueva)
 *   - declaración de nivel módulo → `import { X }` del archivo que la recibe (+ `export` allá)
 *   - `const` de nivel superior del componente → `previo` (hooks) o `arch` (piezas y principal)
 *   - variable local de un `.map`/IIFE de afuera de la pieza → tiene que venir en `props` (si no, error)
 * Una referencia a un hook POSTERIOR (flecha del hook N que usa un const del N+1) se reporta: rompería la cadena.
 *
 *   cp X.tsx <scratch>/X.orig.tsx       # ¡los rangos se leen del original congelado!
 *   node scripts/partir-en-piezas.mjs <scratch>/X.orig.tsx spec.mjs "$PWD" --analizar   # sólo reporta
 *   node scripts/partir-en-piezas.mjs <scratch>/X.orig.tsx spec.mjs "$PWD"              # escribe
 *
 * spec.mjs (export default):
 *   componente: "X", origen: "components/a/X.tsx" (para reescribir imports relativos), cabecera: [1, 19],
 *   principal: "components/a/X.tsx", total: { nombre: "useX", archivo: "components/a/x/use-x.ts", tipo: "EstadoX" },
 *   arg: "arch" (nombre de la prop/variable con el estado),
 *   modulos: [{ archivo, rangos: [[a, b]], cliente?: bool }],
 *   hooks:   [{ nombre: "useXA", archivo, rango: [a, b] }]                  // en orden, contiguos
 *   piezas:  [{ nombre, archivo, rango: [a, b], props?: { f: "Tipo" }, cuerpo?: "…@@a-b@@…",
 *              reemplaza?: [a, b], invocacion?: "<Nombre … />", importsExtra?: ["import type …"] }]
 * Primer uso: DocumentosModule 3.808 líneas (22-10). Gotcha: `--analizar` primero, hasta 0 errores.
 */
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

const [origPath, specPath, raiz = process.cwd(), modo] = process.argv.slice(2);
const spec = (await import(path.resolve(specPath))).default;
const ARG = spec.arg ?? "arch";
const texto = fs.readFileSync(origPath, "utf8");
const L = texto.split("\n");
const opciones = { jsx: ts.JsxEmit.Preserve, noLib: true, noResolve: true, types: [], target: ts.ScriptTarget.ES2022 };
const program = ts.createProgram([origPath], opciones, ts.createCompilerHost(opciones));
const sf = program.getSourceFile(origPath);
const checker = program.getTypeChecker();
const lineaDe = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
const main = sf.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === spec.componente);
if (!main) throw new Error(`no encontré function ${spec.componente}`);
const errores = [];

// ── 1. salidas con su conjunto de líneas ──────────────────────────────────
const salidas = [];
for (const m of spec.modulos ?? []) salidas.push({ ...m, clase: "modulo" });
spec.hooks.forEach((h, i) => salidas.push({ ...h, clase: "hook", rangos: [h.rango], idx: i }));
for (const p of spec.piezas ?? []) salidas.push({ ...p, clase: "pieza", rangos: [p.cuerpoRango ?? p.rango], reemplaza: p.reemplaza ?? p.rango });
const ini = lineaDe(main.getStart()), fin = lineaDe(main.end);
const principal = { clase: "principal", archivo: spec.principal, rangos: [[ini, fin]] };
salidas.push(principal);
const dentro = (r, s) => r[0] >= s[0] && r[1] <= s[1];
const piezas = salidas.filter((s) => s.clase === "pieza");
// líneas que cubre cada pieza para el «dueño de línea» (la más interna gana)
function lineasPropias(s) {
  const set = new Set();
  const rangosCuerpo = s.cuerpo ? [...s.cuerpo.matchAll(/@@(\d+)-(\d+)@@/g)].map((m) => [+m[1], +m[2]]) : s.rangos;
  for (const [a, b] of rangosCuerpo) for (let i = a; i <= b; i++) set.add(i);
  // las piezas hijas (su `reemplaza` cae adentro) no son líneas propias
  for (const q of piezas) if (q !== s && rangosCuerpo.some((r) => dentro(q.reemplaza, r))) for (let i = q.reemplaza[0]; i <= q.reemplaza[1]; i++) set.delete(i);
  if (s.clase === "principal") {
    for (const h of spec.hooks) for (let i = h.rango[0]; i <= h.rango[1]; i++) set.delete(i);
  }
  return set;
}
for (const s of salidas) s.lineas = lineasPropias(s);
const hijasDe = (s) => {
  const rangosCuerpo = s.cuerpo ? [...s.cuerpo.matchAll(/@@(\d+)-(\d+)@@/g)].map((m) => [+m[1], +m[2]]) : s.rangos;
  const cand = piezas.filter((q) => q !== s && rangosCuerpo.some((r) => dentro(q.reemplaza, r)));
  return cand.filter((q) => !cand.some((o) => o !== q && dentro(q.reemplaza, o.reemplaza)));
};

// ── 2. de dónde viene cada símbolo ───────────────────────────────────────
const esBindingDeNivel = (dcl, stmt) => {
  if (ts.isFunctionDeclaration(stmt)) return dcl === stmt;
  if (!ts.isVariableStatement(stmt)) return false;
  let n = dcl;
  while (n && (ts.isBindingElement(n) || ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n))) n = n.parent;
  return !!n && ts.isVariableDeclaration(n) && n.parent?.parent === stmt;
};
function origen(sym) {
  const dcl = sym?.declarations?.[0];
  if (!dcl || dcl.getSourceFile() !== sf) return null;
  let n = dcl;
  while (n.parent && n.parent !== sf && n.parent !== main.body) n = n.parent;
  if (n.parent === sf) {
    if (ts.isImportDeclaration(n)) return { tipo: "import", nombre: sym.name, stmt: n };
    const deNivel = dcl === n || esBindingDeNivel(dcl, n);
    if (n === main || !deNivel) return { tipo: "local", nombre: sym.name, linea: lineaDe(dcl.getStart()) };
    return { tipo: "modulo", nombre: sym.name, stmt: n };
  }
  if (n.parent === main.body && esBindingDeNivel(dcl, n)) return { tipo: "top", nombre: sym.name, linea: lineaDe(n.getStart()) };
  return { tipo: "local", nombre: sym.name, linea: lineaDe(dcl.getStart()) };
}
const saltar = (id) => {
  const p = id.parent;
  if (!p) return true;
  if ((ts.isPropertyAccessExpression(p) && p.name === id) || (ts.isQualifiedName(p) && p.right === id)) return true;
  if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) || ts.isJsxAttribute(p)) && p.name === id) return true;
  if (ts.isBindingElement(p) && p.propertyName === id) return true;
  if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p) || ts.isBindingElement(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p)) && p.name === id) return true;
  if (ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isExportSpecifier(p)) return true;
  return false;
};
const refs = []; // { linea, o }
(function walk(n) {
  if (ts.isIdentifier(n) && !saltar(n)) {
    const sym = n.parent && ts.isShorthandPropertyAssignment(n.parent) && n.parent.name === n ? checker.getShorthandAssignmentValueSymbol(n.parent) : checker.getSymbolAtLocation(n);
    const o = origen(sym);
    if (o) refs.push({ linea: lineaDe(n.getStart()), o, n });
  }
  ts.forEachChild(n, walk);
})(sf);

// nombres de nivel superior del componente → hook que los declara
const hookDeLinea = (l) => spec.hooks.findIndex((h) => l >= h.rango[0] && l <= h.rango[1]);
const declaradosPorHook = spec.hooks.map(() => []);
for (const st of main.body.statements) {
  const l = lineaDe(st.getStart());
  const h = hookDeLinea(l);
  const nombres = [];
  if (ts.isVariableStatement(st)) {
    const juntar = (nm) => {
      if (ts.isIdentifier(nm)) nombres.push(nm.text);
      else for (const e of nm.elements) if (!ts.isOmittedExpression(e)) juntar(e.name);
    };
    for (const d of st.declarationList.declarations) juntar(d.name);
  } else if (ts.isFunctionDeclaration(st) && st.name) nombres.push(st.name.text);
  if (h < 0) { if (nombres.length) errores.push(`L${l}: ${nombres.join(",")} no cae en ningún hook`); continue; }
  const rh = spec.hooks[h].rango;
  if (lineaDe(st.end) > rh[1]) errores.push(`L${l}-${lineaDe(st.end)}: la sentencia se sale del hook ${spec.hooks[h].nombre} (${rh})`);
  declaradosPorHook[h].push(...nombres);
}
// dueño de cada declaración de nivel módulo
const duenoModulo = new Map(); // nombre → salida
for (const st of sf.statements) {
  if (ts.isImportDeclaration(st) || st === main) continue;
  const l = lineaDe(st.getStart());
  const s = salidas.find((x) => x.clase === "modulo" && x.lineas.has(l));
  const nombres = [];
  if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) nombres.push(d.name.text);
  if ((ts.isFunctionDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st)) && st.name) nombres.push(st.name.text);
  if (!s) { if (nombres.length) errores.push(`L${l}: ${nombres.join(",")} (nivel módulo) no cae en ningún módulo`); continue; }
  for (const n of nombres) duenoModulo.set(n, { s, st });
}

// ── 3. por salida: qué importa, qué desestructura, qué props necesita ──────
const exportar = new Set(); // stmts de módulo que otro archivo usa
const relImport = (desde, a) => {
  let r = path.relative(path.dirname(desde), a).replace(/\.(tsx?|mjs)$/, "");
  return r.startsWith(".") ? r : "./" + r;
};
const espImport = (stmt, archivoSalida) => {
  const m = stmt.moduleSpecifier.text;
  if (!m.startsWith(".")) return m;
  return relImport(archivoSalida, path.join(path.dirname(spec.origen), m));
};
for (const s of salidas) {
  s.imports = new Map(); // modulo → { def, named:Set, tipos:Set }
  s.deArg = new Set(); s.dePrevio = new Set();
  const agregar = (mod, nombre, { def = false, tipo = false, espec = nombre } = {}) => {
    if (!s.imports.has(mod)) s.imports.set(mod, { def: null, named: new Map() });
    const g = s.imports.get(mod);
    if (def) g.def = nombre;
    else {
      const prev = g.named.get(espec);
      g.named.set(espec, prev === undefined ? tipo : prev && tipo);
    }
  };
  for (const r of refs) {
    if (!s.lineas.has(r.linea)) continue;
    const { o } = r;
    if (o.tipo === "import") {
      const ic = o.stmt.importClause;
      const mod = espImport(o.stmt, s.archivo);
      const tipoTodo = !!ic.isTypeOnly;
      if (ic.name?.text === o.nombre) agregar(mod, o.nombre, { def: true });
      else if (ic.namedBindings && ts.isNamespaceImport(ic.namedBindings)) agregar(mod, `* as ${o.nombre}`, { def: true });
      else {
        const sp = ic.namedBindings.elements.find((e) => e.name.text === o.nombre);
        const espec = sp.propertyName ? `${sp.propertyName.text} as ${sp.name.text}` : sp.name.text;
        const esTipo = tipoTodo || sp.isTypeOnly || esPosicionDeTipo(r.n);
        agregar(mod, o.nombre, { espec, tipo: esTipo });
      }
    } else if (o.tipo === "modulo") {
      const d = duenoModulo.get(o.nombre);
      if (!d) { errores.push(`[${s.archivo}] L${r.linea}: ${o.nombre} sin dueño`); continue; }
      if (d.s === s) continue;
      exportar.add(d.st);
      agregar(relImport(s.archivo, d.s.archivo), o.nombre, { tipo: ts.isTypeAliasDeclaration(d.st) || ts.isInterfaceDeclaration(d.st) || esPosicionDeTipo(r.n) });
    } else if (o.tipo === "top") {
      const h = hookDeLinea(o.linea);
      if (s.clase === "hook") {
        if (h < s.idx) s.dePrevio.add(o.nombre);
        else if (h > s.idx) errores.push(`[${s.nombre}] L${r.linea}: usa ${o.nombre} del hook posterior ${spec.hooks[h]?.nombre} (L${o.linea})`);
      } else s.deArg.add(o.nombre);
    } else if (o.tipo === "local") {
      if (s.lineas.has(o.linea) || (s.clase === "pieza" && s.cuerpo && [...s.cuerpo.matchAll(/@@(\d+)-(\d+)@@/g)].some((m) => o.linea >= +m[1] && o.linea <= +m[2]))) continue;
      if (s.clase === "pieza" && s.props && o.nombre in s.props) { s.props_usadas ??= new Set(); s.props_usadas.add(o.nombre); continue; }
      errores.push(`[${s.nombre ?? s.archivo}] L${r.linea}: local «${o.nombre}» declarado en L${o.linea}, afuera → props`);
    }
  }
}
function esPosicionDeTipo(n) {
  let p = n.parent;
  while (p && ts.isQualifiedName(p)) p = p.parent;
  return !!p && ts.isTypeNode(p);
}

// ── 4. reporte ─────────────────────────────────────────────────────────────
const contar = (s) => s.lineas.size;
for (const s of salidas) {
  const nombre = s.nombre ?? path.basename(s.archivo);
  const extra = s.clase === "hook" ? ` previo:${s.dePrevio.size} devuelve:${declaradosPorHook[s.idx].length}` : s.clase !== "modulo" ? ` ${ARG}:${s.deArg.size}` : "";
  console.log(`${s.clase.padEnd(9)} ${nombre.padEnd(28)} ${String(contar(s)).padStart(5)} líneas${extra}`);
}
if (errores.length) { console.log(`\n${errores.length} errores:\n` + errores.slice(0, 80).join("\n")); }
if (modo === "--analizar" || errores.length) process.exit(errores.length ? 1 : 0);

// ── 5. escribir ────────────────────────────────────────────────────────────
const lineasMod = [...L];
for (const st of exportar) {
  const l = lineaDe(st.getStart()) - 1;
  const col = sf.getLineAndCharacterOfPosition(st.getStart()).character;
  if (!/^export\s/.test(lineasMod[l].slice(col))) lineasMod[l] = lineasMod[l].slice(0, col) + "export " + lineasMod[l].slice(col);
}
const envolver = (prefijo, nombres, sufijo, sangria = "  ") => {
  if (!nombres.length) return "";
  const out = []; let cur = `${sangria}${prefijo}`;
  for (const [i, n] of nombres.entries()) {
    const pieza = n + (i < nombres.length - 1 ? "," : "");
    if ((cur + " " + pieza).length > 110) { out.push(cur); cur = `${sangria}  ${pieza}`; } else cur += (cur.endsWith(prefijo) ? " " : " ") + pieza;
  }
  out.push(cur + ` ${sufijo}`);
  return out.join("\n") + "\n";
};
const tipoHasta = (i) => `Hasta${spec.hooks[i].nombre.replace(/^use/, "")}`;
const textoDeImports = (s, extra = []) => {
  const out = [];
  for (const [mod, g] of s.imports) {
    const named = [...g.named];
    if (!g.def && named.length && named.every(([, t]) => t)) { out.push(`import type { ${named.map(([e]) => e).join(", ")} } from "${mod}";`); continue; }
    const partes = [];
    if (g.def) partes.push(g.def);
    if (named.length) partes.push(`{ ${named.map(([e, t]) => (t ? "type " : "") + e).join(", ")} }`);
    out.push(`import ${partes.join(", ")} from "${mod}";`);
  }
  return [...out, ...extra].join("\n");
};
function cuerpoCon(s, rangos) {
  const out = [];
  const hijas = hijasDe(s);
  for (const [a, b] of rangos) {
    for (let i = a; i <= b; i++) {
      if (s.clase === "principal" && spec.hooks.some((h) => i >= h.rango[0] && i <= h.rango[1])) {
        if (i === spec.hooks[0].rango[0]) {
          out.push(`  const ${ARG} = ${spec.total.nombre}();`);
          out.push(envolver("const {", [...s.deArg], `} = ${ARG};`).trimEnd());
        }
        continue;
      }
      const h = hijas.find((q) => q.reemplaza[0] === i);
      if (h) {
        const sangria = L[i - 1].match(/^\s*/)[0];
        const props = Object.keys(h.props ?? {}).filter((p) => h.props_usadas?.has(p));
        const inv = h.invocacion ?? `<${h.nombre} ${ARG}={${ARG}}${props.map((p) => ` ${p}={${p}}`).join("")} />`;
        out.push(sangria + inv.replaceAll("${arch}", ARG));
        i = h.reemplaza[1];
        s.usaPiezas ??= new Set(); s.usaPiezas.add(h);
        continue;
      }
      out.push(lineasMod[i - 1]);
    }
  }
  return out.join("\n");
}
const escribir = (archivo, contenido) => {
  const destino = path.join(raiz, archivo);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, contenido.replace(/\n{3,}/g, "\n\n"));
  console.log(`escrito ${archivo}: ${contenido.split("\n").length} líneas`);
};
const importsDePiezas = (s) => [...(s.usaPiezas ?? [])].map((h) => `import ${h.nombre} from "${relImport(s.archivo, h.archivo)}";`);

for (const s of salidas.filter((x) => x.clase === "modulo")) {
  const cuerpo = cuerpoCon(s, s.rangos);
  escribir(s.archivo, (s.cliente ? '"use client";\n\n' : "") + textoDeImports(s) + "\n\n" + cuerpo.trimStart() + "\n");
}
spec.hooks.forEach((h, i) => {
  const s = salidas.find((x) => x.clase === "hook" && x.idx === i);
  const cuerpo = cuerpoCon(s, s.rangos);
  const previo = i > 0 ? [`import type { ${tipoHasta(i - 1)} } from "${relImport(s.archivo, spec.hooks[i - 1].archivo)}";`] : [];
  const firma = i > 0 ? `export function ${h.nombre}(previo: ${tipoHasta(i - 1)}) {` : `export function ${h.nombre}() {`;
  const tipo = i > 0 ? `${tipoHasta(i - 1)} & ReturnType<typeof ${h.nombre}>` : `ReturnType<typeof ${h.nombre}>`;
  escribir(s.archivo, [textoDeImports(s, [...importsDePiezas(s), ...previo]), "", firma,
    envolver("const {", [...s.dePrevio], "} = previo;").trimEnd(), cuerpo, envolver("return {", declaradosPorHook[i], "};").trimEnd(), "}",
    `export type ${tipoHasta(i)} = ${tipo};`, ""].filter((x) => x !== "").join("\n"));
});
{
  const t = spec.total;
  const lineas = [`/** El estado entero del componente, por hooks encadenados en el MISMO orden del original. */`];
  spec.hooks.forEach((h) => lineas.unshift(`import { ${h.nombre} } from "${relImport(t.archivo, h.archivo)}";`));
  lineas.push(`export function ${t.nombre}() {`);
  spec.hooks.forEach((h, i) => {
    if (i === 0) lineas.push(`  const h0 = ${h.nombre}();`);
    else lineas.push(`  const h${i} = { ...h${i - 1}, ...${h.nombre}(h${i - 1}) };`);
  });
  lineas.push(`  return h${spec.hooks.length - 1};`, "}", `export type ${t.tipo} = ReturnType<typeof ${t.nombre}>;`, "");
  escribir(t.archivo, lineas.join("\n"));
}
for (const s of piezas) {
  const props = Object.entries(s.props ?? {}).filter(([p]) => s.props_usadas?.has(p));
  const cuerpo = s.cuerpo
    ? s.cuerpo.replace(/@@(\d+)-(\d+)@@/g, (_, a, b) => cuerpoCon(s, [[+a, +b]]))
    : `  return (\n    <>\n${cuerpoCon(s, s.rangos)}\n    </>\n  );`;
  const tipoArg = `import type { ${spec.total.tipo} } from "${relImport(s.archivo, spec.total.archivo)}";`;
  const firma = `export default function ${s.nombre}({ ${[ARG, ...props.map(([p]) => p)].join(", ")} }: { ${[`${ARG}: ${spec.total.tipo}`, ...props.map(([p, t]) => `${p}: ${t}`)].join("; ")} }) {`;
  escribir(s.archivo, ['"use client";', "", textoDeImports(s, [...importsDePiezas(s), tipoArg, ...(s.importsExtra ?? [])]), "", firma,
    envolver("const {", [...s.deArg], `} = ${ARG};`).trimEnd(), cuerpo, "}", ""].filter((x, i) => x !== "" || i < 2).join("\n"));
}
{
  const s = principal;
  const cab = spec.cabecera ? L.slice(spec.cabecera[0] - 1, spec.cabecera[1]).join("\n") + "\n\n" : "";
  const tot = `import { ${spec.total.nombre} } from "${relImport(s.archivo, spec.total.archivo)}";`;
  const cuerpo = cuerpoCon(s, s.rangos);
  escribir(s.archivo, cab + textoDeImports(s, [...importsDePiezas(s), tot]) + "\n\n" + cuerpo + "\n");
}
