/**
 * Busca el defecto que ya apareció tres veces: la pantalla leyendo un nombre de
 * campo que el backend NO manda.
 *
 * Pasó en Contratos (`montoTotal` contra `monto` → todo salía S/ 0.00), en
 * Notas de Crédito (`codigoMotivo` contra `motivoCodigo` → "[undefined]
 * undefined") y antes con `número` con tilde en cuatro módulos. Nadie lo
 * atrapa: TypeScript le cree al tipo que declara el componente, y el tipo
 * MIENTE porque se escribió a mano en vez de derivarse de la capa de datos.
 *
 * Cómo funciona: por cada componente admin, busca los tipos que declara y los
 * nombres de campo que lee de ellos; después busca el tipo del backend con el
 * mismo tema (la clase `*.db.ts` o el route) y compara. Lo que la pantalla lee
 * y el backend no tiene, se reporta.
 *
 * Es una RED, no un juez: marca sospechas para mirar a mano. Un falso positivo
 * es barato; el defecto que busca cuesta que un módulo entero muestre ceros.
 *
 *   node scripts/buscar-campos-cruzados.mjs
 *   node scripts/buscar-campos-cruzados.mjs ContratosModule
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const RAIZ = process.cwd();
const filtro = process.argv[2]?.toLowerCase() ?? null;

/** Campos que existen en casi todo y no dicen nada al compararlos. */
const RUIDO = new Set([
  "id", "createdAt", "updatedAt", "deletedAt", "tenantId", "name", "type",
  "status", "length", "map", "filter", "find", "slice", "toString", "then",
  "push", "sort", "join", "some", "every", "reduce", "forEach", "includes",
  "toFixed", "trim", "split", "replace", "value", "label", "key", "current",
]);

function archivosTs(dir, salida = []) {
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) archivosTs(ruta, salida);
    else if (/\.(ts|tsx)$/.test(entrada)) salida.push(ruta);
  }
  return salida;
}

/** Los campos que declara cada `type X = {…}` / `interface X {…}` del archivo. */
function tiposDeclarados(codigo) {
  const tipos = new Map();
  const re = /(?:type|interface)\s+([A-Z][A-Za-z0-9_]*)\s*=?\s*\{([^}]*)\}/gs;
  let m;
  while ((m = re.exec(codigo)) !== null) {
    const campos = [...m[2].matchAll(/^\s*\/?\*?\s*([a-záéíóúñ][A-Za-z0-9_áéíóúñ]*)\??\s*:/gim)]
      .map((x) => x[1])
      .filter((c) => !RUIDO.has(c));
    if (campos.length > 0) tipos.set(m[1], new Set(campos));
  }
  return tipos;
}

/** Nombres de campo que el archivo LEE de algún objeto (`x.campo`). */
function camposLeidos(codigo) {
  const leidos = new Set();
  for (const m of codigo.matchAll(/\b[a-z][A-Za-z0-9_]*\.([a-záéíóúñ][A-Za-z0-9_áéíóúñ]*)\b/g)) {
    if (!RUIDO.has(m[1])) leidos.add(m[1]);
  }
  return leidos;
}

const componentes = archivosTs(join(RAIZ, "components", "admin"));
const backend = [
  ...archivosTs(join(RAIZ, "lib", "db")),
  ...archivosTs(join(RAIZ, "app", "api")),
];

// Índice del backend: qué campos existen, por "tema" (la raíz del nombre).
const campoExisteEn = new Map();
for (const ruta of backend) {
  const codigo = readFileSync(ruta, "utf8");
  const tema = basename(ruta).replace(/\.(db\.)?(ts|tsx)$/, "").toLowerCase();
  const dir = ruta.split("/").slice(-2)[0].toLowerCase();
  for (const campos of tiposDeclarados(codigo).values()) {
    for (const c of campos) {
      for (const clave of [tema, dir]) {
        if (!campoExisteEn.has(clave)) campoExisteEn.set(clave, new Set());
        campoExisteEn.get(clave).add(c);
      }
    }
  }
}

const sospechas = [];
for (const ruta of componentes) {
  const nombre = basename(ruta);
  if (filtro && !nombre.toLowerCase().includes(filtro)) continue;

  const codigo = readFileSync(ruta, "utf8");
  const tema = nombre.replace(/Module|Tab|Panel|View|\.tsx?$/g, "").toLowerCase();
  if (!tema) continue;

  // El conjunto de campos del backend con el mismo tema.
  const delBackend = new Set();
  for (const [clave, campos] of campoExisteEn) {
    if (clave.includes(tema) || tema.includes(clave)) for (const c of campos) delBackend.add(c);
  }
  if (delBackend.size < 5) continue; // sin contraparte clara, no hay con qué comparar

  const declarados = tiposDeclarados(codigo);
  const leidos = camposLeidos(codigo);

  for (const [tipo, campos] of declarados) {
    for (const campo of campos) {
      // Sólo importa si la pantalla lo LEE de verdad y el backend no lo tiene.
      if (!leidos.has(campo) || delBackend.has(campo)) continue;
      // ¿Existe uno parecido del otro lado? Ahí el cruce es casi seguro.
      const parecido = [...delBackend].find(
        (c) =>
          c.toLowerCase() !== campo.toLowerCase()
          && (c.toLowerCase().includes(campo.toLowerCase().slice(0, 5))
            || campo.toLowerCase().includes(c.toLowerCase().slice(0, 5))),
      );
      sospechas.push({ archivo: nombre, tipo, campo, parecido });
    }
  }
}

sospechas.sort((a, b) => (b.parecido ? 1 : 0) - (a.parecido ? 1 : 0));

const conParecido = sospechas.filter((s) => s.parecido);
console.log(`Componentes revisados: ${componentes.length}`);
console.log(`Sospechas: ${sospechas.length} (con un campo parecido del otro lado: ${conParecido.length})\n`);
console.log("── Las que más pinta tienen: la pantalla lee X y el backend tiene algo parecido ──");
for (const s of conParecido.slice(0, 30)) {
  console.log(`  ${s.archivo} · ${s.tipo}.${s.campo}  ←→  backend tiene "${s.parecido}"`);
}
if (conParecido.length === 0) console.log("  (ninguna)");
