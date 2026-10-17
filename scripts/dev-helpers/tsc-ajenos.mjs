// Uso: node scripts/dev-helpers/tsc-ajenos.mjs <files.txt> [commit.log]
// Con carriles en paralelo: sale 0 si el árbol compila o si TODOS los errores de tipos (y los tests
// rojos del log del pre-commit) son de archivos sucios de OTRO carril que el commit no importa. Así un
// carril a medio construir no traba el commit de otro y el commit no rompe HEAD. Lo usa commit-carril.sh.
import { readFileSync, existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
const mios = new Set(readFileSync(process.argv[2], "utf8").split("\n").map((l) => l.trim()).filter(Boolean));
const sucios = new Set(
  execFileSync("git", ["status", "--porcelain", "-uall"], { encoding: "utf8" })
    .split("\n").filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, "").split(" -> ").pop()),
);
const r = spawnSync("node", ["scripts/tsc7.mjs", "--noEmit"], { encoding: "utf8", maxBuffer: 64 << 20 });
const errores = [...new Set(((r.stdout || "") + (r.stderr || "")).split("\n")
  .map((l) => l.match(/^([^\s(][^(]*)\(\d+,\d+\): error/)?.[1]).filter(Boolean))];
const resolver = (desde, spec) => {
  let base;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = path.normalize(path.join(path.dirname(desde), spec));
  else return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) if (existsSync(base + ext) && (ext || /\.[tj]sx?$/.test(base))) return base + ext;
  return null;
};
const deps = (f) => [...readFileSync(f, "utf8").matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)].map((m) => resolver(f, m[1])).filter(Boolean);
// Un archivo limpio con error que NO importa nada del commit: lo rompió el cambio a medias de otro carril.
const importaMios = (f) => existsSync(f) && deps(f).some((d) => mios.has(d));
const malos = [];
for (const f of errores) {
  if (mios.has(f)) malos.push(`error en archivo del commit: ${f}`);
  else if (!sucios.has(f) && importaMios(f)) malos.push(`error en archivo limpio que importa el commit: ${f}`);
}
for (const f of mios) {
  if (!/\.(ts|tsx)$/.test(f) || !existsSync(f)) continue;
  // Sólo cuenta un import NUEVO (la sentencia no estaba en HEAD): uno viejo ya compilaba con la versión commiteada.
  let enHead = "";
  try { enHead = execFileSync("git", ["show", `HEAD:${f}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch {}
  for (const m of readFileSync(f, "utf8").matchAll(/import\s[^;]*?from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']/g)) {
    const dep = resolver(f, m[1] ?? m[2]);
    if (dep && sucios.has(dep) && !mios.has(dep) && !enHead.includes(m[0])) malos.push(`${f} importa ${dep} (import nuevo; sin commitear y fuera de la lista)`);
  }
}
// Tests rojos del pre-commit (2.º argumento = log): ajenos si importan un archivo sucio de otro carril.
const log = process.argv[3] && existsSync(process.argv[3]) ? readFileSync(process.argv[3], "utf8").replace(/\x1b\[[0-9;]*m/g, "") : "";
const testsRojos = [...new Set([...log.matchAll(/FAIL\s+\|\w+\|\s+(\S+\.test\.tsx?)/g)].map((m) => m[1]))];
for (const t of testsRojos) {
  if (mios.has(t)) { malos.push(`test del commit rojo: ${t}`); continue; }
  // Transitivo (hasta 4 saltos): el test de OrdersTab importa index.tsx, que importa el archivo a medias.
  const visto = new Set([t]); let capa = [t]; let ajeno = sucios.has(t);
  for (let salto = 0; salto < 4 && !ajeno && capa.length; salto++) {
    capa = capa.flatMap((f) => (existsSync(f) ? deps(f) : [])).filter((d) => !visto.has(d) && visto.add(d));
    ajeno = capa.some((d) => sucios.has(d) && !mios.has(d));
  }
  if (!ajeno) malos.push(`test limpio rojo que no toca archivos ajenos (¿lo rompe el commit?): ${t}`);
}
if (r.status === 0 && !malos.length) { console.log("tsc verde" + (testsRojos.length ? `; ${testsRojos.length} test(s) rojo(s) por archivos ajenos` : "")); process.exit(0); }
if (malos.length) { console.log(malos.join("\n")); process.exit(1); }
console.log(`tsc rojo sólo en ${errores.length} archivo(s) ajeno(s) sin commitear: ${errores.slice(0, 4).join(", ")}`);
process.exit(0);
