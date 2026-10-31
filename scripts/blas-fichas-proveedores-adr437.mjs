#!/usr/bin/env node
/**
 * ADR-437 §2 · Fichas del directorio para los titulares de Blas que no tenían,
 * y los enlaces que la plata de la guía necesita.
 *
 * Por qué: el modal «Plata de la guía» busca a quién pagarle así: enlace
 * explícito (`WoodEntry.proveedorParteId`) → titular del permiso
 * (`ForestContrato.titularId`) → nombre exacto → nombre parecido (sólo
 * propone). Medido 26-09 en Blas: NELLY QUINCHUNLLA y SANTOS MUÑOZ no tenían
 * ficha; 0 de 6 permisos y 0 guías tenían enlace. Brandon autorizó escribir
 * (2026-09-26).
 *
 * Qué hace:
 *   1. Crea la ficha (rol proveedor) de cada titular de `CREAR` que no tenga
 *      una con el mismo nombre. Documento SÓLO si sale de una fuente del
 *      titular: el del propietario del producto en la ficha SERFOR cuando es la
 *      MISMA persona (`documentoDelTitular`, sobre la ficha reparada). NUNCA
 *      `providerDocument`: es el RUC de la ATFFS que registró la guía.
 *   2. Guías de COMPRA vivas sin proveedor → su ficha, si hay UNA con el nombre
 *      exacto (normalizado: tildes, espacios, mayúsculas). Las de servicio
 *      (madera de WASACO) no llevan proveedor.
 *   3. Permisos sin titular → su ficha, con la misma vara exacta.
 *   Lo que sólo se PARECE (misma persona sin «COMUNIDAD NATIVA», etc.) se
 *   lista y NO se liga: atar mal mueve plata al contrato equivocado.
 *
 * Escribe SÓLO por las DB classes (`ForestDirectorioDB.guardarParte`,
 * `ForestDirectorioDB.enlazarProveedorDeGuia`, `ForestContratoDB.actualizar`):
 * auditoría con el actor `script:adr437` + invalidación de caché. Las lecturas
 * van por `pg` dentro de `BEGIN READ ONLY … COMMIT` (nunca `SET SESSION`: el
 * 6543 es el pooler de producción).
 *
 * Uso:
 *   node scripts/blas-fichas-proveedores-adr437.mjs             # dry-run
 *   node scripts/blas-fichas-proveedores-adr437.mjs --aplicar   # escribe
 *
 * Idempotente: una segunda corrida no crea nada ni vuelve a atar.
 */
import { config } from "dotenv";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const ESTE = fileURLToPath(import.meta.url);
const REPO = resolve(dirname(ESTE), "..");
config({ path: join(REPO, ".env.local"), quiet: true });

const TENANT_ID = "cmpxiv6p4000bohvzwl6bnfpv"; // inversiones-agroforestales-blas-sociedad-anonima
const TENANT_SLUG = "inversiones-agroforestales-blas-sociedad-anonima";
const ACTOR = "script:adr437";
/** Los titulares sin ficha que midió el arquitecto (26-09). */
const CREAR = ["QUINCHUNLLA PEREZ, NELLY", "SANTOS MUÑOZ JOSE HORD"];
/** Brandon confirmó: las guías de este permiso son madera de WASACO (servicio). */
const NOTA_SERVICIO = {
  "10-HUA-PUE/PER-FMP-2026-007": "La madera de sus guías es de WASACO: Blas sólo la asierra (servicio, ADR-437).",
};

const aplicar = process.argv.includes("--aplicar");

// ── Proceso padre: relanza este mismo archivo bajo tsx ──────────────────────
// Las DB classes son TypeScript e importan `server-only`, que no existe fuera
// de Next. Receta de `migrar-blas-wasaco-adr437.mjs`: tsconfig temporal que
// apunta `server-only` a un archivo vacío y `@/*` al repo.
if (!process.env.ADR437_FICHAS_HIJO) {
  const tmp = mkdtempSync(join(tmpdir(), "adr437-fichas-"));
  writeFileSync(join(tmp, "server-only.ts"), "export {};\n");
  writeFileSync(
    join(tmp, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        baseUrl: REPO,
        paths: { "@/*": ["./*"], "server-only": [join(tmp, "server-only.ts")] },
      },
    }),
  );
  const hijo = spawnSync("npx", ["tsx", "--tsconfig", join(tmp, "tsconfig.json"), ESTE, ...process.argv.slice(2)], {
    cwd: REPO,
    stdio: "inherit",
    env: { ...process.env, ADR437_FICHAS_HIJO: "1" },
  });
  process.exit(hijo.status ?? 1);
}

// ── Proceso hijo (tsx) ──────────────────────────────────────────────────────
const mod = (p) => import(pathToFileURL(join(REPO, p)).href);
const { documentoDelTitular, mismaPersona } = await mod("lib/forestal/serfor-titular.ts");
const { repararFichaSerfor } = await mod("lib/forestal/serfor-texto-danado.ts");
const { normalizarNombre: clave } = await mod("lib/forestal/directorio-desde-guias.ts");
const { parteInputSchema, motivoDocInvalido } = await mod("lib/forestal/directorio.ts");

if (!process.env.DATABASE_URL) {
  console.error("✗ falta DATABASE_URL en .env.local");
  process.exit(1);
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

/** Foto de lo que este script mira: partes, permisos y guías vivas. */
async function foto() {
  await db.query("BEGIN READ ONLY");
  try {
    const q = async (sql) => (await db.query(sql, [TENANT_ID])).rows;
    const tenant = (await db.query(`SELECT slug FROM "Tenant" WHERE id = $1`, [TENANT_ID])).rows[0];
    const partes = await q(
      `SELECT id, nombre, roles, "docTipo", "docNumero" FROM "ForestParty"
        WHERE "tenantId" = $1 AND "deletedAt" IS NULL ORDER BY nombre`,
    );
    const contratos = await q(
      `SELECT id, codigo, "titularNombre", "titularId" FROM "ForestContrato"
        WHERE "tenantId" = $1 AND "deletedAt" IS NULL ORDER BY codigo`,
    );
    const guias = await q(
      `SELECT "gtfNumber", min("providerName") AS "providerName", min("contratoId") AS "contratoId",
              bool_or("maderaDeTercero") AS servicio,
              count(*)::int AS asientos,
              count(*) FILTER (WHERE "proveedorParteId" IS NOT NULL)::int AS "conProveedor",
              array_remove(array_agg(DISTINCT "proveedorParteId"), NULL) AS proveedores,
              (array_agg("serforGtf") FILTER (WHERE "serforGtf" IS NOT NULL))[1] AS ficha
         FROM "WoodEntry"
        WHERE "tenantId" = $1 AND "deletedAt" IS NULL AND "status" NOT IN ('anulado','rechazado')
        GROUP BY "gtfNumber" ORDER BY 2, 1`,
    );
    return { tenant, partes, contratos, guias };
  } finally {
    await db.query("COMMIT");
  }
}

const nombreDe = (partes, id) => partes.find((p) => p.id === id)?.nombre ?? id;

function imprimirEstado(titulo, f) {
  console.log(`\n══ ${titulo}`);
  console.log(`Fichas vivas: ${f.partes.length}`);
  console.table(f.partes.map((p) => ({ nombre: p.nombre, roles: p.roles.join(","), doc: p.docNumero ? `${p.docTipo} ${p.docNumero}` : "—" })));
  console.log("Permisos → titularId");
  console.table(f.contratos.map((c) => ({ codigo: c.codigo, titular: c.titularNombre, ficha: c.titularId ? nombreDe(f.partes, c.titularId) : "—" })));
  console.log("Guías vivas → proveedorParteId");
  console.table(
    f.guias.map((g) => ({
      guia: g.gtfNumber,
      proveedor: g.providerName,
      tipo: g.servicio ? "servicio" : "compra",
      asientos: g.asientos,
      conFicha: g.conProveedor,
      ficha: g.proveedores.map((id) => nombreDe(f.partes, id)).join(", ") || "—",
    })),
  );
}

/** Las fichas con el mismo nombre exacto (normalizado) y las que sólo se parecen. */
function candidatas(partes, nombre) {
  const exactas = partes.filter((p) => clave(p.nombre) === clave(nombre));
  const parecidas = partes.filter((p) => !exactas.includes(p) && mismaPersona(p.nombre, nombre));
  return { exactas, parecidas };
}

const antes = await foto();
if (antes.tenant?.slug !== TENANT_SLUG) {
  console.error(`✗ El tenant ${TENANT_ID} es «${antes.tenant?.slug ?? "no existe"}», no Blas. No se hace nada.`);
  process.exit(1);
}
console.log(`Modo: ${aplicar ? "APLICAR (escribe en el tenant REAL, autorizado por Brandon 2026-09-26)" : "dry-run (no escribe nada)"}`);
imprimirEstado("ANTES", antes);

// ── 1. Fichas a crear ───────────────────────────────────────────────────────
const problemas = [];
const aCrear = [];
for (const nombre of CREAR) {
  const { exactas, parecidas } = candidatas(antes.partes, nombre);
  if (exactas.length) {
    console.log(`\n· ${nombre}: ya tiene ficha (${exactas[0].id}) — no se crea.`);
    continue;
  }
  if (parecidas.length) {
    problemas.push(`${nombre} se parece a una ficha existente (${parecidas.map((p) => p.nombre).join(", ")}): Brandon decide`);
    continue;
  }
  const suyas = antes.guias.filter((g) => clave(g.providerName) === clave(nombre));
  const docs = new Map();
  for (const g of suyas) {
    const d = g.ficha ? documentoDelTitular(repararFichaSerfor(g.ficha)) : null;
    if (d) docs.set(`${d.tipo} ${d.numero}`, d);
  }
  const doc = docs.size === 1 ? [...docs.values()][0] : null;
  if (doc) {
    const motivo = motivoDocInvalido(doc.tipo, doc.numero);
    if (motivo) problemas.push(`${nombre}: el documento ${doc.numero} no pasa la validación (${motivo})`);
  }
  const permisos = antes.contratos.filter((c) => clave(c.titularNombre) === clave(nombre));
  const nota = [
    permisos.length ? `Titular del permiso ${permisos.map((c) => c.codigo).join(", ")}.` : null,
    ...permisos.map((c) => NOTA_SERVICIO[c.codigo]).filter(Boolean),
    doc
      ? `${doc.tipo} tomado del propietario del producto en la GTF SERFOR (casillero 15), que es el mismo titular.`
      : "Sin documento: la GTF no publica el del titular y el propietario del producto es otra persona.",
    "Ficha creada por ADR-437 (26-09).",
  ]
    .filter(Boolean)
    .join(" ");
  const input = {
    roles: ["proveedor"],
    nombre,
    ...(doc ? { docTipo: doc.tipo, docNumero: doc.numero } : {}),
    ...(permisos.length === 1 ? { tituloHabilitante: permisos[0].codigo } : {}),
    notas: nota,
  };
  const valido = parteInputSchema.safeParse(input);
  if (!valido.success) {
    problemas.push(`${nombre}: la ficha no pasa el esquema del directorio (${valido.error.issues.map((i) => i.message).join("; ")})`);
    continue;
  }
  aCrear.push({ nombre, input: valido.data, guias: suyas.length, docs: [...docs.keys()] });
}

console.log("\n── Fichas a crear");
console.table(
  aCrear.map((c) => ({
    nombre: c.nombre,
    doc: c.input.docNumero ? `${c.input.docTipo} ${c.input.docNumero}` : "— (sin fuente del titular)",
    titulo: c.input.tituloHabilitante ?? "—",
    guias: c.guias,
  })),
);
for (const c of aCrear) console.log(`  nota «${c.nombre}»: ${c.input.notas}`);

// Las partes como quedarían, para planear los enlaces también en el dry-run.
const partesPlan = [...antes.partes, ...aCrear.map((c) => ({ id: `(nueva: ${c.nombre})`, nombre: c.nombre }))];

// ── 2 y 3. Enlaces exactos, parecidos para Brandon ──────────────────────────
function planearEnlaces(partes, estado) {
  const guias = [];
  const permisos = [];
  const parecidos = [];
  for (const g of estado.guias) {
    if (g.servicio) continue; // madera de servicio: no hay a quién pagarle
    if (g.conProveedor === g.asientos) continue; // ya atada
    const { exactas, parecidas } = candidatas(partes, g.providerName);
    if (exactas.length === 1) guias.push({ gtfNumber: g.gtfNumber, parte: exactas[0] });
    else if (exactas.length > 1) problemas.push(`la guía ${g.gtfNumber} tiene ${exactas.length} fichas con el mismo nombre`);
    else if (parecidas.length) parecidos.push({ que: `guía ${g.gtfNumber}`, enElLibro: g.providerName, enElDirectorio: parecidas.map((p) => p.nombre).join(" | ") });
  }
  for (const c of estado.contratos) {
    if (c.titularId) continue;
    const { exactas, parecidas } = candidatas(partes, c.titularNombre);
    if (exactas.length === 1) permisos.push({ contrato: c, parte: exactas[0] });
    else if (exactas.length > 1) problemas.push(`el permiso ${c.codigo} tiene ${exactas.length} fichas con el mismo nombre`);
    else if (parecidas.length) parecidos.push({ que: `permiso ${c.codigo}`, enElLibro: c.titularNombre, enElDirectorio: parecidas.map((p) => p.nombre).join(" | ") });
  }
  return { guias, permisos, parecidos };
}

const plan = planearEnlaces(partesPlan, antes);
console.log("\n── Guías de compra a atar (nombre exacto)");
console.table(plan.guias.map((x) => ({ guia: x.gtfNumber, ficha: x.parte.nombre, id: x.parte.id })));
console.log("── Permisos a atar (nombre exacto)");
console.table(plan.permisos.map((x) => ({ permiso: x.contrato.codigo, ficha: x.parte.nombre, id: x.parte.id })));
console.log("── Sólo PARECIDOS — no se atan, decide Brandon");
console.table(plan.parecidos);
const sinFicha = antes.guias.filter((g) => g.servicio).map((g) => g.gtfNumber);
console.log(`── Guías de servicio (sin proveedor, a propósito): ${sinFicha.length} — ${sinFicha.join(", ")}`);

if (problemas.length) {
  console.error(`\n✗ ${problemas.length} problema(s) — no se escribe nada:`);
  for (const x of problemas) console.error(`  - ${x}`);
  await db.end();
  process.exit(1);
}
if (!aplicar) {
  console.log("\n✓ Dry-run: no se escribió nada. Para escribir: --aplicar.");
  await db.end();
  process.exit(0);
}

// ── APLICAR ─────────────────────────────────────────────────────────────────
const { ForestDirectorioDB } = await mod("lib/db/forest-directorio.db.ts");
const { ForestContratoDB } = await mod("lib/db/forest-contrato.db.ts");
const t0 = new Date();

console.log("\n── Escribiendo…");
for (const c of aCrear) {
  const p = await ForestDirectorioDB.guardarParte(TENANT_ID, c.input, ACTOR);
  console.log(`  ✓ ficha ${p.nombre} (${p.id})`);
}
// Replanear con las ids reales.
const intermedio = await foto();
const real = planearEnlaces(intermedio.partes, intermedio);
let fallas = 0;
for (const x of real.guias) {
  try {
    const r = await ForestDirectorioDB.enlazarProveedorDeGuia(TENANT_ID, { gtfNumber: x.gtfNumber, parteId: x.parte.id }, ACTOR);
    console.log(`  ✓ guía ${x.gtfNumber} → ${x.parte.nombre} (${r.enlazados} asiento/s; ya estaban ${r.yaEstaban})`);
  } catch (e) {
    fallas++;
    console.error(`  ✗ guía ${x.gtfNumber}: ${e?.message ?? e}`);
  }
}
for (const x of real.permisos) {
  const r = await ForestContratoDB.actualizar(TENANT_ID, x.contrato.id, { titularId: x.parte.id }, ACTOR);
  if (r) console.log(`  ✓ permiso ${x.contrato.codigo} → ${x.parte.nombre}`);
  else {
    fallas++;
    console.error(`  ✗ permiso ${x.contrato.codigo}: no encontrado`);
  }
}

// `guardarParte` y `actualizar` auditan sin esperar: se les da tiempo antes de
// contar los renglones (un proceso que sale antes los pierde).
await new Promise((r) => setTimeout(r, 4000));
const despues = await foto();
imprimirEstado("DESPUÉS", despues);
await db.query("BEGIN READ ONLY");
const audit = (
  await db.query(
    // `createdAt` es timestamp SIN zona guardado en UTC: se compara contra la
    // hora UTC de la base, no contra un Date de JS (que se leería +5 h).
    `SELECT action, "user", detail FROM "ActivityLog"
      WHERE "tenantId" = $1 AND "user" = $2 AND "createdAt" >= (now() AT TIME ZONE 'UTC') - make_interval(secs => $3)
      ORDER BY "createdAt"`,
    [TENANT_ID, ACTOR, Math.ceil((Date.now() - t0.getTime()) / 1000) + 5],
  )
).rows;
await db.query("COMMIT");
console.log(`── Auditoría con usuario ${ACTOR}: ${audit.length} renglón(es)`);
console.table(audit);
await db.end();
process.exit(fallas ? 1 : 0);
