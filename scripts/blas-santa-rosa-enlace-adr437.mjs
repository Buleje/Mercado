#!/usr/bin/env node
/**
 * ADR-437 §2 · Enlace de «COMUNIDAD SANTA ROSA DE CHIVIS» en Blas.
 *
 * Por qué: la guía viva 019-001-0000004 llegó con `providerName` =
 * «COMUNIDAD NATIVA SANTA ROSA DE CHIVIS» (con «NATIVA»), que NO calza exacto
 * con la ficha del directorio «COMUNIDAD SANTA ROSA DE CHIVIS» (sin ella) —
 * el emparejamiento automático de `blas-fichas-proveedores-adr437.mjs` sólo
 * ata por nombre exacto, así que este caso quedó fuera. Brandon lo autorizó a
 * mano (26-09): el «N° RUC/DNI» de la GTF SERFOR (casillero del titular) es
 * 20156698963, el MISMO RUC que ya tiene la ficha (`docNumero`) — misma
 * persona, dos formas de escribir el nombre. NUNCA se usa `providerDocument`
 * (20562836927): es el RUC de la ATFFS que registró la guía (ver memoria
 * `providerdocument-serfor-es-ruc-de-la-instancia`).
 *
 * La guía hermana 019-001-0000003 está `rechazada`: `enlazarProveedorDeGuia`
 * sólo toca asientos vivos (`status NOT IN ('anulado','rechazado')`), así que
 * queda afuera sin que este script tenga que filtrarla.
 *
 * El permiso 19-SEC/REG-PLT-2021-017 (titular «COMUNIDAD NATIVA SANTA ROSA DE
 * CHIVIS») no tenía `titularId` (ADR-425: sin él, la ficha «no ve» ese
 * permiso). Se ata a la misma ficha.
 *
 * Escribe SÓLO por las DB classes (`ForestDirectorioDB.enlazarProveedorDeGuia`,
 * `ForestContratoDB.actualizar`): auditoría con el actor `script:adr437` +
 * invalidación de caché. Las lecturas van por `pg` en `BEGIN READ ONLY …
 * COMMIT` (nunca `SET SESSION`: el 6543 es el pooler de producción).
 *
 * Uso:
 *   node scripts/blas-santa-rosa-enlace-adr437.mjs             # dry-run
 *   node scripts/blas-santa-rosa-enlace-adr437.mjs --aplicar   # escribe
 *
 * Idempotente: una segunda corrida no vuelve a atar nada (ya atado ⇒ no-op).
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
const FICHA_ID = "cmt8x1bt4000crdvzehbz2nco"; // COMUNIDAD SANTA ROSA DE CHIVIS (RUC 20156698963)
const RUC_ESPERADO = "20156698963";
const GTF = "019-001-0000004";
const CONTRATO_ID = "ctr_bb95cdc7f858660a665ae8"; // 19-SEC/REG-PLT-2021-017

const aplicar = process.argv.includes("--aplicar");

// ── Proceso padre: relanza este mismo archivo bajo tsx (server-only + @/*) ──
if (!process.env.ADR437_SANTAROSA_HIJO) {
  const tmp = mkdtempSync(join(tmpdir(), "adr437-santarosa-"));
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
    env: { ...process.env, ADR437_SANTAROSA_HIJO: "1" },
  });
  process.exit(hijo.status ?? 1);
}

// ── Proceso hijo (tsx) ──────────────────────────────────────────────────────
const mod = (p) => import(pathToFileURL(join(REPO, p)).href);

if (!process.env.DATABASE_URL) {
  console.error("✗ falta DATABASE_URL en .env.local");
  process.exit(1);
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

async function foto() {
  await db.query("BEGIN READ ONLY");
  try {
    const tenant = (await db.query(`SELECT slug FROM "Tenant" WHERE id = $1`, [TENANT_ID])).rows[0];
    const ficha = (
      await db.query(
        `SELECT id, nombre, roles, "docTipo", "docNumero" FROM "ForestParty"
          WHERE "tenantId" = $1 AND id = $2 AND "deletedAt" IS NULL`,
        [TENANT_ID, FICHA_ID],
      )
    ).rows[0];
    const guias = (
      await db.query(
        `SELECT "gtfNumber", "providerName", "providerDocument", status, "proveedorParteId", "serforGtf"->'campos'->>'N° RUC/DNI' AS "rucDelTitular"
           FROM "WoodEntry"
          WHERE "tenantId" = $1 AND "deletedAt" IS NULL AND "providerName" ILIKE '%SANTA ROSA%'
          ORDER BY "gtfNumber"`,
        [TENANT_ID],
      )
    ).rows;
    const contrato = (
      await db.query(
        `SELECT id, codigo, "titularNombre", "titularId" FROM "ForestContrato"
          WHERE "tenantId" = $1 AND id = $2 AND "deletedAt" IS NULL`,
        [TENANT_ID, CONTRATO_ID],
      )
    ).rows[0];
    return { tenant, ficha, guias, contrato };
  } finally {
    await db.query("COMMIT");
  }
}

function imprimir(titulo, f) {
  console.log(`\n══ ${titulo}`);
  console.log("Ficha:");
  console.table([f.ficha ?? { id: FICHA_ID, nombre: "— no encontrada —" }]);
  console.log("Guías 'SANTA ROSA':");
  console.table(f.guias);
  console.log("Permiso 19-SEC/REG-PLT-2021-017:");
  console.table([f.contrato ?? { id: CONTRATO_ID, codigo: "— no encontrado —" }]);
}

const antes = await foto();
if (antes.tenant?.slug !== TENANT_SLUG) {
  console.error(`✗ El tenant ${TENANT_ID} es «${antes.tenant?.slug ?? "no existe"}», no Blas. No se hace nada.`);
  process.exit(1);
}
console.log(`Modo: ${aplicar ? "APLICAR (escribe en el tenant REAL, autorizado por Brandon 2026-09-26)" : "dry-run (no escribe nada)"}`);
imprimir("ANTES", antes);

const problemas = [];
if (!antes.ficha) problemas.push(`la ficha ${FICHA_ID} no existe (o está borrada) en Blas`);
else if (antes.ficha.docNumero !== RUC_ESPERADO) {
  problemas.push(`la ficha tiene docNumero «${antes.ficha.docNumero}», se esperaba ${RUC_ESPERADO}: no se ata sin ese RUC`);
}
if (!antes.contrato) problemas.push(`el permiso ${CONTRATO_ID} no existe (o está borrado) en Blas`);

const guiaViva = antes.guias.find((g) => g.gtfNumber === GTF);
if (!guiaViva) problemas.push(`la guía ${GTF} no aparece entre las 'SANTA ROSA'`);
else if (!["pendiente", "recibido", "aprobado"].includes(guiaViva.status) && guiaViva.status !== "pendiente") {
  // Sólo se avisa: `enlazarProveedorDeGuia` decide con su propio WHERE (vivos), esto es una foto informativa.
  console.log(`· nota: la guía ${GTF} está en estado «${guiaViva.status}» — el método sólo ata asientos vivos.`);
}
if (guiaViva && guiaViva.rucDelTitular && guiaViva.rucDelTitular !== RUC_ESPERADO) {
  problemas.push(`la guía ${GTF} trae RUC del titular «${guiaViva.rucDelTitular}» en su ficha SERFOR, no ${RUC_ESPERADO}: no coincide, no se ata`);
}

if (problemas.length) {
  console.error(`\n✗ ${problemas.length} problema(s) — no se escribe nada:`);
  for (const x of problemas) console.error(`  - ${x}`);
  await db.end();
  process.exit(1);
}

console.log(`\n✓ RUC verificado: ficha ${RUC_ESPERADO} = «N° RUC/DNI» de la GTF SERFOR de ${GTF} (${antes.ficha.nombre}).`);
console.log(`── Plan: atar la guía ${GTF} → ficha ${antes.ficha.nombre} (${FICHA_ID})`);
console.log(
  antes.contrato.titularId
    ? `── Permiso ${antes.contrato.codigo} ya tiene titularId (${antes.contrato.titularId}) — no se toca.`
    : `── Plan: permiso ${antes.contrato.codigo} sin titularId → ${antes.ficha.nombre} (${FICHA_ID})`,
);

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
let fallas = 0;
try {
  const r = await ForestDirectorioDB.enlazarProveedorDeGuia(TENANT_ID, { gtfNumber: GTF, parteId: FICHA_ID }, ACTOR);
  console.log(`  ✓ guía ${GTF} → ${antes.ficha.nombre} (${r.enlazados} asiento/s; ya estaban ${r.yaEstaban})`);
} catch (e) {
  fallas++;
  console.error(`  ✗ guía ${GTF}: ${e?.message ?? e}`);
}

if (!antes.contrato.titularId) {
  const r = await ForestContratoDB.actualizar(TENANT_ID, CONTRATO_ID, { titularId: FICHA_ID }, ACTOR);
  if (r) console.log(`  ✓ permiso ${antes.contrato.codigo} → ${antes.ficha.nombre}`);
  else {
    fallas++;
    console.error(`  ✗ permiso ${antes.contrato.codigo}: no encontrado`);
  }
}

// `enlazarProveedorDeGuia`/`actualizar` auditan sin esperar: se da tiempo antes de contar.
await new Promise((r) => setTimeout(r, 4000));
const despues = await foto();
imprimir("DESPUÉS", despues);
await db.query("BEGIN READ ONLY");
const audit = (
  await db.query(
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
