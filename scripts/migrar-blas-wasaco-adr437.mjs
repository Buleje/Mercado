#!/usr/bin/env node
/**
 * ADR-437 · Marca como MADERA DE SERVICIO las guías de WASACO en Blas.
 *
 * Por qué: 8 guías (21 asientos, 135,587 m³) del permiso
 * `10-HUA-PUE/PER-FMP-2026-007` son madera de WASACO; Blas sólo la asierra
 * (confirmado por Brandon, 2026-09-26). Hoy piden costo y cuentan «sin costo»
 * en la ficha del permiso y en Rentabilidad.
 *
 * Qué hace:
 *   - dry-run (DEFAULT): verifica tenant / permiso / parte por SELECT, lista las
 *     guías, cruza contra lo esperado (8 · 21 · 135,587 m³ · 0 con costo) y
 *     frena si algo no cuadra: guía mezclada con asientos de otro permiso, mes
 *     cerrado, costo congelado en una corrida, abono de madera ya anotado.
 *     Todo dentro de `BEGIN READ ONLY … COMMIT` (nunca `SET SESSION`: el 6543
 *     es el pooler de producción y el ajuste se pega en conexiones ajenas).
 *   - `--aplicar`: además llama a `GuiaPlataDB.marcarServicio(tenantId,
 *     { gtfNumber, duenoParteId })` por guía — la DB class escribe todos los
 *     asientos vivos de la guía en una transacción, audita e invalida caché.
 *     Blas es el tenant REAL: sólo con autorización de Brandon.
 *
 * Uso:
 *   node scripts/migrar-blas-wasaco-adr437.mjs             # dry-run
 *   node scripts/migrar-blas-wasaco-adr437.mjs --aplicar   # escribe (Brandon)
 *
 * Esperado después: «sin costo» del permiso 21 → 0, del tenant 25 → 4.
 */
import { config } from "dotenv";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(REPO, ".env.local"), quiet: true });

const TENANT_ID = "cmpxiv6p4000bohvzwl6bnfpv"; // inversiones-agroforestales-blas-sociedad-anonima
const CONTRATO_ID = "ctr_19c2c2ce8d35e7b4e21dc4"; // 10-HUA-PUE/PER-FMP-2026-007
const PARTE_ID = "cmudjt95w001qtavznqmyfv42"; // WASACO

const ESPERADO = { guias: 8, asientos: 21, m3: 135.587, conCosto: 0 };
/** Cinta de aserradero, no epsilon de float: 1 litro sobre 3 decimales declarados. */
const TOL_M3 = 0.001;

const aplicar = process.argv.includes("--aplicar");
const fmt = (n) => Number(n).toLocaleString("es-PE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

if (!process.env.DATABASE_URL) {
  console.error("✗ falta DATABASE_URL en .env.local");
  process.exit(1);
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

/** «Sin costo» con la regla del ADR: vivo, costo NULL y NO de servicio. */
async function sinCosto(soloPermiso) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM "WoodEntry"
      WHERE "tenantId" = $1 AND "deletedAt" IS NULL
        AND "status" NOT IN ('anulado','rechazado')
        AND "costoTotal" IS NULL AND "maderaDeTercero" = false
        AND ($2::text IS NULL OR "contratoId" = $2)`,
    [TENANT_ID, soloPermiso ? CONTRATO_ID : null],
  );
  return rows[0].n;
}

const problemas = [];
let guias = [];

await db.query("BEGIN READ ONLY");
try {
  // ── 1. Los tres ids existen y son lo que dicen ser ──────────────────────
  const t = (await db.query(`SELECT id, slug, name FROM "Tenant" WHERE id = $1`, [TENANT_ID])).rows[0];
  const c = (
    await db.query(
      `SELECT id, "tenantId", codigo, "titularNombre", "deletedAt" FROM "ForestContrato" WHERE id = $1`,
      [CONTRATO_ID],
    )
  ).rows[0];
  const p = (
    await db.query(`SELECT id, "tenantId", nombre, "docNumero", "deletedAt" FROM "ForestParty" WHERE id = $1`, [PARTE_ID])
  ).rows[0];

  console.log(`Modo: ${aplicar ? "APLICAR (escribe en el tenant REAL)" : "dry-run (no escribe nada)"}\n`);
  console.log("── Verificación de ids");
  console.log(`  tenant   ${TENANT_ID} → ${t ? `${t.slug} · ${t.name}` : "NO EXISTE"}`);
  console.log(
    `  permiso  ${CONTRATO_ID} → ${c ? `${c.codigo} · titular ${c.titularNombre}${c.deletedAt ? " · DADO DE BAJA" : ""}` : "NO EXISTE"}`,
  );
  console.log(`  parte    ${PARTE_ID} → ${p ? `${p.nombre} · doc ${p.docNumero ?? "—"}${p.deletedAt ? " · DADA DE BAJA" : ""}` : "NO EXISTE"}`);
  if (!t) problemas.push("el tenant no existe");
  if (t && t.slug !== "inversiones-agroforestales-blas-sociedad-anonima") problemas.push(`el tenant es ${t.slug}, no Blas`);
  if (!c || c.tenantId !== TENANT_ID || c.deletedAt) problemas.push("el permiso no existe, es de otro tenant o está dado de baja");
  if (c && c.codigo !== "10-HUA-PUE/PER-FMP-2026-007") problemas.push(`el permiso es ${c.codigo}, no 10-HUA-PUE/PER-FMP-2026-007`);
  if (!p || p.tenantId !== TENANT_ID || p.deletedAt) problemas.push("la parte no existe, es de otro tenant o está dada de baja");
  if (p && !/wasaco/i.test(p.nombre)) problemas.push(`la parte se llama «${p.nombre}», no WASACO`);

  // ── 2. Las guías del permiso ─────────────────────────────────────────────
  const { rows: asientos } = await db.query(
    `SELECT id, "gtfNumber", "entryDate", "speciesCommonName", "volumeM3"::float8 AS m3,
            "costoTotal", "maderaDeTercero", "duenoParteId", "status"
       FROM "WoodEntry"
      WHERE "tenantId" = $1 AND "contratoId" = $2 AND "deletedAt" IS NULL
        AND "status" NOT IN ('anulado','rechazado')
      ORDER BY "entryDate", "gtfNumber", id`,
    [TENANT_ID, CONTRATO_ID],
  );
  const porGuia = new Map();
  for (const a of asientos) {
    const g = porGuia.get(a.gtfNumber) ?? { gtfNumber: a.gtfNumber, asientos: [], m3: 0, conCosto: 0, yaServicio: 0 };
    g.asientos.push(a);
    g.m3 += a.m3;
    if (a.costoTotal !== null) g.conCosto += 1;
    if (a.maderaDeTercero) g.yaServicio += 1;
    porGuia.set(a.gtfNumber, g);
  }
  guias = [...porGuia.values()];
  const total = {
    guias: guias.length,
    asientos: asientos.length,
    m3: asientos.reduce((s, a) => s + a.m3, 0),
    conCosto: asientos.filter((a) => a.costoTotal !== null).length,
    yaServicio: asientos.filter((a) => a.maderaDeTercero).length,
  };

  console.log("\n── Guías del permiso (vivas: sin baja, ni anuladas ni rechazadas)");
  console.table(
    guias.map((g) => ({
      guia: g.gtfNumber,
      fecha: g.asientos[0].entryDate.toISOString().slice(0, 10),
      asientos: g.asientos.length,
      especies: [...new Set(g.asientos.map((a) => a.speciesCommonName))].join(", "),
      m3: fmt(g.m3),
      conCosto: g.conCosto,
      yaServicio: g.yaServicio,
    })),
  );

  console.log("── Cruce contra lo esperado (ADR-437)");
  const filas = [
    ["guías", ESPERADO.guias, total.guias, total.guias === ESPERADO.guias],
    ["asientos", ESPERADO.asientos, total.asientos, total.asientos === ESPERADO.asientos],
    ["m³", fmt(ESPERADO.m3), fmt(total.m3), Math.abs(total.m3 - ESPERADO.m3) <= TOL_M3],
    ["con costo", ESPERADO.conCosto, total.conCosto, total.conCosto === ESPERADO.conCosto],
  ];
  for (const [que, esp, real, ok] of filas) {
    console.log(`  ${ok ? "✓" : "✗"} ${que.padEnd(10)} esperado ${String(esp).padStart(8)} · real ${String(real).padStart(8)}`);
    if (!ok) problemas.push(`${que}: esperado ${esp}, real ${real}`);
  }
  if (total.yaServicio > 0) console.log(`  · ${total.yaServicio} asiento(s) ya marcados de servicio (marcarServicio debe ser idempotente)`);

  const gtfs = guias.map((g) => g.gtfNumber);
  const ids = asientos.map((a) => a.id);

  // ── 3. Ninguna guía mezclada: marcarServicio escribe TODOS los asientos
  //       vivos del gtfNumber, también los que cuelgan de otro permiso.
  const { rows: ajenos } = await db.query(
    `SELECT "gtfNumber", count(*)::int AS n, array_agg(DISTINCT coalesce("contratoId", '(sin permiso)')) AS permisos
       FROM "WoodEntry"
      WHERE "tenantId" = $1 AND "gtfNumber" = ANY($2::text[]) AND "deletedAt" IS NULL
        AND "status" NOT IN ('anulado','rechazado')
        AND "contratoId" IS DISTINCT FROM $3
      GROUP BY "gtfNumber"`,
    [TENANT_ID, gtfs, CONTRATO_ID],
  );
  console.log(`\n── Guías con asientos de OTRO permiso: ${ajenos.length}`);
  for (const r of ajenos) {
    console.log(`  ✗ ${r.gtfNumber}: ${r.n} asiento(s) en ${r.permisos.join(", ")}`);
    problemas.push(`la guía ${r.gtfNumber} está mezclada con otro permiso`);
  }

  // ── 4. Ninguna en período cerrado (mismo guard que setCosto: entryDate) ──
  const cierres =
    (await db.query(`SELECT value FROM "PlatformSetting" WHERE key = $1`, [`ctp-cierre:${TENANT_ID}`])).rows[0]?.value ?? [];
  const activos = (Array.isArray(cierres) ? cierres : []).filter((x) => !x.reabierto);
  const enCerrado = asientos.filter((a) =>
    activos.some((x) => a.entryDate.getTime() >= new Date(x.from).getTime() && a.entryDate.getTime() <= new Date(x.to).getTime()),
  );
  console.log(
    `── Períodos cerrados del tenant: ${activos.length ? activos.map((x) => x.periodKey).join(", ") : "ninguno"} · asientos que caen adentro: ${enCerrado.length}`,
  );
  for (const a of enCerrado) problemas.push(`la guía ${a.gtfNumber} (${a.entryDate.toISOString().slice(0, 10)}) cae en un período cerrado`);

  // ── 5. Costo congelado en alguna corrida (reabrir el mes no lo descongela) ─
  const congelados = (
    await db.query(
      `SELECT count(*)::int AS n FROM "ForestCtpConsumo" WHERE "tenantId" = $1 AND "woodEntryId" = ANY($2::text[]) AND "congeladoAt" IS NOT NULL`,
      [TENANT_ID, ids],
    )
  ).rows[0].n;
  // Una corrida anulada conserva su consumo como historia: no cuenta como «la
  // consume» (en Blas hay 1, de la corrida anulada del 15-09 sobre la 0000005).
  const consumos = (
    await db.query(
      `SELECT count(*) FILTER (WHERE ce."deletedAt" IS NULL AND ce."status" <> 'anulado')::int AS vivos,
              count(*)::int AS todos
         FROM "ForestCtpConsumo" k LEFT JOIN "ForestCtpEntry" ce ON ce.id = k."ctpEntryId"
        WHERE k."tenantId" = $1 AND k."woodEntryId" = ANY($2::text[])`,
      [TENANT_ID, ids],
    )
  ).rows[0];
  console.log(
    `── Consumos de estas guías: ${consumos.vivos} de corridas vivas (${consumos.todos - consumos.vivos} de anuladas) · con costo congelado: ${congelados}`,
  );
  if (congelados > 0) problemas.push(`${congelados} consumo(s) con costo congelado`);

  // ── 6. Ningún abono de madera anotado para estas guías (marcar servicio
  //       sobre una guía con pagos imputados → 409 TIENE_PAGOS) ─────────────
  const movs = (
    await db.query(
      `SELECT concepto, count(*)::int AS n FROM "ForestCuentaMov"
        WHERE "tenantId" = $1 AND "gtfNumber" = ANY($2::text[]) AND "deletedAt" IS NULL GROUP BY concepto`,
      [TENANT_ID, gtfs],
    )
  ).rows;
  console.log(`── Movimientos de cuenta con estas guías: ${movs.length ? movs.map((m) => `${m.concepto} ${m.n}`).join(", ") : "0"}`);
  if (movs.length) problemas.push("hay movimientos de cuenta con estas guías: revisarlos antes de marcar");

  console.log(`\n── «Sin costo» hoy: permiso ${await sinCosto(true)} · tenant ${await sinCosto(false)}  (esperado después: 0 · 4)`);
} finally {
  await db.query("COMMIT");
}

if (problemas.length) {
  console.error(`\n✗ ${problemas.length} problema(s) — no se marca nada:`);
  for (const x of problemas) console.error(`  - ${x}`);
  await db.end();
  process.exit(1);
}

if (!aplicar) {
  console.log("\n✓ Todo cuadra. Dry-run: no se escribió nada. Para marcar: --aplicar (con autorización de Brandon).");
  await db.end();
  process.exit(0);
}

// ── APLICAR ───────────────────────────────────────────────────────────────
const dbClass = join(REPO, "lib/db/guia-plata.db.ts");
if (!existsSync(dbClass)) {
  console.error(`\n✗ No existe ${dbClass}: GuiaPlataDB.marcarServicio todavía no está escrita. No se marcó nada.`);
  await db.end();
  process.exit(1);
}

// La DB class es TypeScript e importa `server-only`, que no existe fuera de
// Next. Receta probada (2026-09-26): un proceso `tsx` hijo con un tsconfig
// temporal que apunta `server-only` a un archivo vacío y `@/*` al repo.
// (`tsImport` de `tsx/esm/api` con `tsconfig` NO alcanza: la DB class se carga
// como CJS y ese `require("server-only")` ignora los `paths`.)
const tmp = mkdtempSync(join(tmpdir(), "adr437-"));
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
writeFileSync(
  join(tmp, "marcar.mts"),
  `const mod = await import(${JSON.stringify(pathToFileURL(dbClass).href)});
const GuiaPlataDB = mod.GuiaPlataDB ?? mod.default?.GuiaPlataDB;
if (typeof GuiaPlataDB?.marcarServicio !== "function") {
  console.error("✗ lib/db/guia-plata.db.ts no exporta GuiaPlataDB.marcarServicio. No se marcó nada.");
  process.exit(2);
}
const guias = JSON.parse(process.env.ADR437_GUIAS ?? "[]");
let ok = 0;
for (const g of guias) {
  try {
    await GuiaPlataDB.marcarServicio(${JSON.stringify(TENANT_ID)}, { gtfNumber: g.gtfNumber, duenoParteId: ${JSON.stringify(PARTE_ID)} });
    ok += 1;
    console.log("  ✓ " + g.gtfNumber + " (" + g.asientos + " asiento/s)");
  } catch (e) {
    console.error("  ✗ " + g.gtfNumber + ": " + (e?.code ?? "") + " " + (e?.message ?? e));
  }
}
console.log("\\n" + ok + "/" + guias.length + " guía(s) marcadas.");
process.exit(ok ? 0 : 1);
`,
);

console.log("\n── Marcando…");
const hijo = spawnSync("npx", ["tsx", "--tsconfig", join(tmp, "tsconfig.json"), join(tmp, "marcar.mts")], {
  cwd: REPO,
  stdio: "inherit",
  env: { ...process.env, ADR437_GUIAS: JSON.stringify(guias.map((g) => ({ gtfNumber: g.gtfNumber, asientos: g.asientos.length }))) },
});
const ok = hijo.status === 0;
if (hijo.status === 2) {
  await db.end();
  process.exit(1);
}

await db.query("BEGIN READ ONLY");
const despues = { permiso: await sinCosto(true), tenant: await sinCosto(false) };
const marcados = (
  await db.query(
    `SELECT count(*)::int AS n FROM "WoodEntry" WHERE "tenantId" = $1 AND "gtfNumber" = ANY($2::text[]) AND "deletedAt" IS NULL AND "maderaDeTercero" = true AND "duenoParteId" = $3`,
    [TENANT_ID, guias.map((g) => g.gtfNumber), PARTE_ID],
  )
).rows[0].n;
await db.query("COMMIT");
console.log(`── Después: asientos de servicio de WASACO ${marcados} · «sin costo» permiso ${despues.permiso} · tenant ${despues.tenant}`);
await db.end();
process.exit(ok ? 0 : 1);
