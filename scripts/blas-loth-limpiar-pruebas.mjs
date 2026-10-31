/**
 * Saca del Libro TH de Blas las 8 líneas de prueba del 21-07-2026.
 *
 * Las 8 líneas del LO-TH de Blas se crearon el 21-07 con un QA automatizado
 * (la tala #1 lo dice: «Prueba de registro - QA automatizado»). Tres son un
 * consumo, un producto terminado y un despacho de producto con guía
 * 001-0045699 que nunca pasaron, y el formato SERFOR las imprimía.
 *
 * Se borran (soft delete, `deletedAt`) y NO se anulan: una línea anulada sale
 * TACHADA en el libro impreso, y éstas nunca fueron una operación. El borrado
 * es el camino que la DB class reserva a «errores de captura del sistema» y
 * deja su rastro en la auditoría. Pasa por `ForestLothDB.softDelete`, el mismo
 * que usa DELETE /api/admin/forestal/loth/[id] (período cerrado incluido).
 *
 * Orden: de la punta de la cadena hacia la tala, para no dejar una troza
 * trozada sin su árbol ni un despacho sin su troza en ningún momento.
 *
 * Después, la carátula de prueba («Maderera Amazonica SAC», RUC 20601234567,
 * cargada el mismo 21-07). Blas es la planta, no titular: sus 6 permisos son
 * de terceros, y Brandon decidió el 28-09 que Blas no lleva libro TH. Pasa por
 * `ForestLothDB.softDeleteCaratula`, que se niega si le quedan líneas vivas.
 * Las líneas se borraron el 28-09; volver a correrlo sólo hace lo que falte.
 *
 * Uso:  node scripts/blas-loth-limpiar-pruebas.mjs            (sólo mira)
 *       node scripts/blas-loth-limpiar-pruebas.mjs --aplicar  (borra)
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

/** Blas real (memoria `blas-tenant-id-exacto`): nunca por slug. */
const TENANT_ID = "cmpxiv6p4000bohvzwl6bnfpv";
const DIA_DEL_QA = "2026-07-21";
const ESPERADAS = 8;
const ORDEN = ["despacho_producto", "producto_terminado", "consumo_troza", "despacho_troza", "trozado", "tala"];
const aplicar = process.argv.includes("--aplicar");

// ── Proceso padre: relanza bajo tsx (server-only + @/*), receta ADR-437 ─────
if (!process.env.LOTH_LIMPIAR_HIJO) {
  const tmp = mkdtempSync(join(tmpdir(), "loth-limpiar-"));
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
    env: { ...process.env, LOTH_LIMPIAR_HIJO: "1" },
  });
  process.exit(hijo.status ?? 1);
}

// ── Proceso hijo (tsx) ──────────────────────────────────────────────────────
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const { rows } = await db.query(
  `SELECT id, section, "lineNo", to_char("createdAt", 'YYYY-MM-DD') creado,
          coalesce("trozaCode", "treeCode", "productType", '—') codigo, "gtfNumber" gtf, status
     FROM "ForestLothEntry"
    WHERE "tenantId" = $1 AND "deletedAt" IS NULL
    ORDER BY section, "lineNo"`,
  [TENANT_ID],
);
console.table(rows.map(({ id: _id, ...r }) => r));

const CARATULA_DE_PRUEBA = { titularName: "Maderera Amazonica SAC", ruc: "20601234567" };
const { rows: caratulas } = await db.query(
  `SELECT id, "titularName", ruc, "tituloHabilitante", to_char("createdAt", 'YYYY-MM-DD') creada
     FROM "ForestLothCaratula" WHERE "tenantId" = $1 AND "deletedAt" IS NULL`,
  [TENANT_ID],
);
console.table(caratulas.map(({ id: _id, ...c }) => c));
const deOtroDia = caratulas.filter(
  (c) => c.titularName !== CARATULA_DE_PRUEBA.titularName || c.ruc !== CARATULA_DE_PRUEBA.ruc || c.creada !== DIA_DEL_QA,
);
if (deOtroDia.length > 0) {
  console.error("✗ ABORTO: hay una carátula que no es la de prueba del 21-07. Revisar a mano.");
  await db.end();
  process.exit(1);
}

const fueraDelQa = rows.filter((r) => r.creado !== DIA_DEL_QA);
if ((rows.length !== 0 && rows.length !== ESPERADAS) || fueraDelQa.length > 0) {
  console.error(
    `✗ ABORTO: se esperaban ${ESPERADAS} líneas vivas, todas creadas el ${DIA_DEL_QA}; hay ${rows.length} (${fueraDelQa.length} de otro día). ` +
      "Alguien cargó algo real: revisar a mano antes de borrar.",
  );
  await db.end();
  process.exit(1);
}

if (!aplicar) {
  console.log(`\nSólo mira. Con --aplicar se borran ${rows.length} líneas y ${caratulas.length} carátula(s).`);
  await db.end();
  process.exit(0);
}

const { ForestLothDB } = await import(pathToFileURL(join(REPO, "lib/db/forest-loth.db.ts")).href);
const orden = [...rows].sort((a, b) => ORDEN.indexOf(a.section) - ORDEN.indexOf(b.section) || b.lineNo - a.lineNo);
for (const r of orden) {
  await ForestLothDB.softDelete(TENANT_ID, r.id, "claude-limpieza-qa-2026-09-28");
  console.log(`✓ borrada ${r.section} #${r.lineNo} (${r.codigo})`);
}

for (const c of caratulas) {
  await ForestLothDB.softDeleteCaratula(TENANT_ID, c.id, "claude-limpieza-qa-2026-09-28");
  console.log(`✓ borrada la carátula ${c.titularName} (${c.tituloHabilitante ?? "sin TH"})`);
}

const quedan = await db.query(`SELECT count(*)::int n FROM "ForestLothEntry" WHERE "tenantId" = $1 AND "deletedAt" IS NULL`, [TENANT_ID]);
const quedanCar = await db.query(`SELECT count(*)::int n FROM "ForestLothCaratula" WHERE "tenantId" = $1 AND "deletedAt" IS NULL`, [TENANT_ID]);
console.log(`\nQuedan ${quedan.rows[0].n} líneas y ${quedanCar.rows[0].n} carátulas vivas en el Libro TH de Blas.`);
await db.end();
// Prisma y la caché dejan conexiones abiertas: sin esto el proceso no termina.
process.exit(0);
