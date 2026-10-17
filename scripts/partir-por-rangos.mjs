/**
 * Partir un componente gigante por RANGOS DE LÍNEAS sin transcribir: cada salida es una plantilla con
 * `@@a-b@@` (líneas del original) y el script le pone "use client" + SÓLO los imports del original que usa
 * (más los símbolos movidos, vía `locales`). Usado el 08-10 para POSView 2.727 → 20 piezas (tsc verde a la 2.ª).
 *
 *   cp componente.tsx /tmp/orig.tsx   # ¡copiar ANTES: los rangos se leen del original congelado!
 *   node scripts/partir-por-rangos.mjs /tmp/orig.tsx spec.mjs "$PWD"
 *
 * spec.mjs: export default { locales: { fmt: { desde: "@/x/shared", tipo: "named", esTipo?: bool } },
 *   salidas: [{ archivo, cliente?: bool, modulo?: "@/x/propio", plantilla: "…@@10-40@@…", reemplazos?: [[de, a]] }] }
 * Gotcha: un parámetro llamado igual que un import (`m => …` vs `import { m }`) cuenta como uso: correr eslint al final.
 */
import fs from "node:fs";
import path from "node:path";

const [orig, specPath, raiz] = process.argv.slice(2);
const texto = fs.readFileSync(orig, "utf8");
const lineas = texto.split("\n");
const spec = specPath.endsWith(".mjs") ? (await import(path.resolve(specPath))).default : JSON.parse(fs.readFileSync(specPath, "utf8"));

// 1) imports del original
const imports = []; // {nombre, linea} por especificador
const reImp = /^import\s+([\s\S]*?)\s+from\s+"([^"]+)";/gm;
let mm;
while ((mm = reImp.exec(texto))) {
  const cuerpo = mm[1];
  const desde = mm[2];
  const esTipo = /^type\s/.test(cuerpo);
  const limpio = cuerpo.replace(/^type\s+/, "");
  const llaves = limpio.match(/\{([\s\S]*)\}/);
  const def = limpio.replace(/\{[\s\S]*\}/, "").replace(/,/g, "").trim();
  if (def) imports.push({ nombre: def, desde, tipo: "default", esTipo });
  if (llaves) {
    for (const s of llaves[1].split(",").map((x) => x.trim()).filter(Boolean)) {
      const t = /^type\s/.test(s);
      const n = s.replace(/^type\s+/, "");
      const alias = n.includes(" as ") ? n.split(" as ")[1].trim() : n;
      imports.push({ nombre: alias, espec: n, desde, tipo: "named", esTipo: esTipo || t });
    }
  }
}
// pseudo-imports: const X = dynamic(...)
for (const l of lineas) {
  const d = l.match(/^const (\w+) = dynamic\(/);
  if (d) imports.push({ nombre: d[1], tipo: "raw", linea: l, desde: "next/dynamic-raw" });
}
const locales = spec.locales || {}; // nombre -> { desde, tipo: "default"|"named", esTipo }

function sinComentarios(s) {
  return s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}
const usa = (cuerpo, n) => new RegExp(`(?<![\\w.$])${n.replace(/\$/g, "\\$")}(?![\\w$])`).test(cuerpo);

function armarImports(cuerpo, propio) {
  const limpio = sinComentarios(cuerpo);
  const porModulo = new Map();
  const raws = [];
  const agregar = (desde, e) => {
    if (!porModulo.has(desde)) porModulo.set(desde, { def: null, named: [], soloTipo: true });
    const g = porModulo.get(desde);
    if (e.tipo === "default") g.def = e.nombre;
    else g.named.push((e.esTipo ? "type " : "") + (e.espec || e.nombre));
    if (!e.esTipo) g.soloTipo = false;
  };
  for (const e of imports) {
    if (!usa(limpio, e.nombre)) continue;
    if (e.tipo === "raw") { raws.push(e.linea); continue; }
    agregar(e.desde, e);
  }
  for (const [n, e] of Object.entries(locales)) {
    if (e.desde === propio) continue;
    if (!usa(limpio, n)) continue;
    agregar(e.desde, { ...e, nombre: n });
  }
  if (raws.length && ![...porModulo.keys()].includes("next/dynamic")) agregar("next/dynamic", { tipo: "default", nombre: "dynamic" });
  const out = [];
  for (const [desde, g] of porModulo) {
    const named = [...new Set(g.named)];
    if (!g.def && named.length && named.every((x) => x.startsWith("type "))) {
      out.push(`import type { ${named.map((x) => x.slice(5)).join(", ")} } from "${desde}";`);
      continue;
    }
    const partes = [];
    if (g.def) partes.push(g.def);
    if (named.length) partes.push(`{ ${named.join(", ")} }`);
    out.push(`import ${partes.join(", ")} from "${desde}";`);
  }
  return out.join("\n") + (raws.length ? "\n\n" + raws.join("\n") : "");
}

for (const s of spec.salidas) {
  const cuerpo = s.plantilla.replace(/@@(\d+)-(\d+)@@/g, (_, a, b) => lineas.slice(+a - 1, +b).join("\n"));
  let final = cuerpo;
  for (const [de, a] of s.reemplazos || []) {
    if (!final.includes(de)) { console.error(`[${s.archivo}] no encontré: ${de.slice(0, 60)}`); process.exitCode = 1; }
    final = final.split(de).join(a);
  }
  const imps = armarImports(final, s.modulo);
  const cabeza = (s.cliente ? '"use client";\n\n' : "") + imps + "\n\n";
  const destino = path.join(raiz, s.archivo);
  if (fs.existsSync(destino) && !s.pisar) { console.error(`YA EXISTE ${s.archivo}`); process.exitCode = 1; continue; }
  fs.writeFileSync(destino, cabeza + final.trimStart() + (final.endsWith("\n") ? "" : "\n"));
  console.log(`${s.archivo}: ${(cabeza + final).split("\n").length} líneas`);
}
