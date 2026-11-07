/**
 * Lo común de los codemods del contrato de diseño (ADR-489): opciones, recorrido
 * por carpeta, imports y el informe «por carpeta».
 *
 *   --seco               no escribe: imprime cuántos cambios haría, por carpeta
 *   --carpeta <ruta>     dónde (por defecto components/admin + app/admin); para
 *                        APLICAR es obligatoria (la ola 5 va de a una carpeta)
 *   --muestra <n>        con --seco: n ejemplos antes → después
 *   --validar            con --seco: parsea cada archivo transformado con TypeScript
 *                        y cuenta los que quedarían con la sintaxis rota (debe dar 0)
 *
 * Cada codemod exporta `transformar(texto, rel) → { texto, cambios, revisar, ejemplos }`
 * (sin efectos), así se prueba sin tocar archivos.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const POR_DEFECTO = ["components/admin", "app/admin"];

export function opciones(argv = process.argv.slice(2)) {
  const valor = (k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    seco: argv.includes("--seco"),
    carpeta: valor("--carpeta")?.replace(/\/+$/, ""),
    muestra: Number(valor("--muestra") ?? 0),
    validar: argv.includes("--validar"),
    ayuda: argv.includes("--ayuda") || argv.includes("-h"),
  };
}

function recorrer(dir, out = []) {
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p, out);
    else if (/\.(tsx|ts)$/.test(e.name) && !/\.(test|spec|stories)\./.test(e.name)) out.push(p);
  }
  return out;
}

/** La carpeta del informe: el primer nivel bajo la raíz elegida («components/admin/forestal»). */
function grupoDe(rel, raices) {
  for (const r of raices) {
    if (rel === r || rel.startsWith(`${r}/`)) {
      const resto = rel.slice(r.length + 1).split("/");
      return resto.length > 1 ? `${r}/${resto[0]}` : `${r} (raíz)`;
    }
  }
  return rel;
}

/**
 * Agrega `import { nombre } from "modulo"` (o lo suma a un import existente de
 * ese módulo). Va después de "use client" y de los imports que ya hay.
 */
export function asegurarImport(texto, nombre, modulo) {
  const esc = modulo.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const existente = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${esc}["'];?`);
  const m = texto.match(existente);
  if (m) {
    const nombres = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    if (nombres.some((n) => n === nombre || n.endsWith(` as ${nombre}`))) return texto;
    return texto.replace(existente, `import { ${[...nombres, nombre].join(", ")} } from "${modulo}";`);
  }
  const linea = `import { ${nombre} } from "${modulo}";\n`;
  const imports = [...texto.matchAll(/^import[\s\S]*?from\s+["'][^"']+["'];?[^\n]*\n/gm)];
  if (imports.length) {
    const ult = imports[imports.length - 1];
    const fin = ult.index + ult[0].length;
    return texto.slice(0, fin) + linea + texto.slice(fin);
  }
  const directiva = texto.match(/^\s*["']use client["'];?\s*\n/);
  if (directiva) return texto.slice(0, directiva[0].length) + "\n" + linea + texto.slice(directiva[0].length);
  return linea + texto;
}

/** ¿El archivo arranca con "use client" (después de comentarios y espacios)? */
export function esDeCliente(texto) {
  return /^(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*["']use client["']/.test(texto);
}

/**
 * ¿El archivo ya usa `nombre` para otra cosa? Lo declara (función, constante,
 * clase, tipo…) o lo importa de OTRO módulo. Agregar el import chocaría (TS2440)
 * o, peor, cambiaría a quién se llama: con una `function Casilla` propia, el
 * `<input>` de adentro pasaba a `<Casilla>` llamándose a sí misma. El codemod
 * deja ese archivo como estaba y lo cuenta «a revisar».
 */
export function nombreOcupado(texto, nombre, modulo) {
  const declara = new RegExp(`(?:^|[^\\w$.])(?:function\\*?|const|let|var|class|interface|type|enum)\\s+${nombre}(?![\\w$])`, "m");
  if (declara.test(texto)) return true;
  for (const m of texto.matchAll(/^\s*import\s+(?:type\s+)?([^'";]*?)\s+from\s*["']([^"']+)["']/gm)) {
    if (m[2] === modulo) continue;
    const locales = [];
    const llaves = m[1].match(/\{([^}]*)\}/);
    for (const p of llaves ? llaves[1].split(",") : []) {
      const partes = p.trim().replace(/^type\s+/, "").split(/\s+as\s+/);
      if (partes[0]) locales.push((partes[1] ?? partes[0]).trim());
    }
    for (const p of m[1].replace(/\{[^}]*\}/, "").split(",")) {
      const s = p.trim();
      if (s) locales.push(s.replace(/^\*\s+as\s+/, ""));
    }
    if (locales.includes(nombre)) return true;
  }
  return false;
}

/**
 * Corre un codemod: recorre, transforma, informa por carpeta y (sin --seco) escribe.
 * @param {{ nombre: string, que: string, transformar: (texto: string, rel: string) => { texto: string, cambios: number, revisar?: number, ejemplos?: Array<[string, string]> } }} codemod
 */
export function correr({ nombre, que, transformar }, argv = process.argv.slice(2)) {
  const o = opciones(argv);
  if (o.ayuda || (!o.seco && !o.carpeta)) {
    console.log(
      `${nombre}: ${que}\n` +
        `  node scripts/codemods/${nombre}.mjs --seco [--carpeta <ruta>] [--muestra 3]   mide, no escribe\n` +
        `  node scripts/codemods/${nombre}.mjs --carpeta <ruta>                          aplica en esa carpeta`,
    );
    return o.ayuda ? 0 : 1;
  }
  const raices = o.carpeta ? [o.carpeta] : POR_DEFECTO;
  const archivos = raices.flatMap((r) => {
    const abs = path.join(RAIZ, r);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return [abs];
    return recorrer(abs);
  });
  if (!archivos.length) {
    console.error(`${nombre}: no hay archivos en ${raices.join(", ")}`);
    return 1;
  }
  const grupos = new Map();
  const ejemplos = [];
  let total = 0;
  let revisarTotal = 0;
  const rotos = [];
  for (const abs of archivos) {
    const rel = path.relative(RAIZ, abs).split(path.sep).join("/");
    const original = fs.readFileSync(abs, "utf8");
    const r = transformar(original, rel);
    const revisar = r.revisar ?? 0;
    if (!r.cambios && !revisar) continue;
    const g = grupoDe(rel, raices);
    const fila = grupos.get(g) ?? { archivos: 0, cambios: 0, revisar: 0 };
    fila.archivos += r.cambios ? 1 : 0;
    fila.cambios += r.cambios;
    fila.revisar += revisar;
    grupos.set(g, fila);
    total += r.cambios;
    revisarTotal += revisar;
    if (o.muestra && ejemplos.length < o.muestra) for (const e of r.ejemplos ?? []) ejemplos.push([rel, ...e]);
    if (o.validar && r.cambios && erroresDeSintaxis(rel, r.texto) > erroresDeSintaxis(rel, original)) rotos.push(rel);
    if (!o.seco && r.cambios && r.texto !== original) fs.writeFileSync(abs, r.texto);
  }
  const filas = [...grupos.entries()].sort((a, b) => b[1].cambios - a[1].cambios);
  console.log(`# ${nombre} ${o.seco ? "(en seco: no escribe)" : "(APLICADO)"} — ${que}`);
  console.log(`${"carpeta".padEnd(48)} ${"archivos".padStart(8)} ${"cambios".padStart(8)} ${"a revisar".padStart(10)}`);
  for (const [g, f] of filas) {
    console.log(`${g.padEnd(48)} ${String(f.archivos).padStart(8)} ${String(f.cambios).padStart(8)} ${String(f.revisar).padStart(10)}`);
  }
  console.log(`${"TOTAL".padEnd(48)} ${String(filas.reduce((s, [, f]) => s + f.archivos, 0)).padStart(8)} ${String(total).padStart(8)} ${String(revisarTotal).padStart(10)}`);
  if (o.validar) console.log(`Sintaxis rota después del cambio: ${rotos.length}${rotos.length ? ` — ${rotos.slice(0, 5).join(", ")}` : ""}`);
  for (const [rel, antes, despues] of ejemplos.slice(0, o.muestra || 0)) {
    console.log(`\n· ${rel}\n  - ${antes.trim().slice(0, 220)}\n  + ${despues.trim().slice(0, 220)}`);
  }
  return o.validar && rotos.length ? 1 : 0;
}

/** Errores de sintaxis de un texto TS/TSX (TypeScript del repo, sin tipos: ~1 ms por archivo). */
let ts = null;
export function erroresDeSintaxis(rel, texto) {
  ts ??= createRequire(path.join(RAIZ, "package.json"))("typescript");
  const tipo = rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(rel, texto, ts.ScriptTarget.Latest, true, tipo).parseDiagnostics.length;
}

/** ¿Es este módulo el que se corrió desde la línea de comandos? */
export function esPrincipal(metaUrl) {
  return !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(metaUrl);
}

/** Separa una lista de clases en las que se quedan (`queda(token)`) y las que se van. */
export function filtrarClases(clases, queda) {
  return clases.split(/\s+/).filter(Boolean).filter(queda).join(" ");
}
