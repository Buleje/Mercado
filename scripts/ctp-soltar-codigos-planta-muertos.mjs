/**
 * Limpieza ÚNICA (2026-09-26, ADR-436): suelta el código de planta de las
 * trozas de ingresos ANULADOS, RECHAZADOS o BORRADOS (soft).
 *
 * Desde hoy `WoodEntriesDB.annul/reject/softDelete` lo hacen solos dentro de su
 * transacción; esto limpia lo que quedó de antes. El índice único
 * `WoodEntryTroza_tenant_codigoPlanta_unico` mira TODAS las filas, así que una
 * troza muerta seguía ocupando su número y «anula y vuelve a cargar» chocaba al
 * recargar la hoja de SERFOR con el mismo «Código Planta».
 * Medido ese día: `main` 149 piezas (todas de ingresos borrados); Blas 0.
 *
 * Deja UN renglón de ActivityLog por ingreso, con el antes → después de cada
 * pieza (el mismo formato que `detalleCodigosSoltados`), en la MISMA
 * transacción que el UPDATE: o quedan los dos, o ninguno.
 *
 * Uso (dry-run por defecto; imprime ANTES/DESPUÉS):
 *   node -r dotenv/config scripts/ctp-soltar-codigos-planta-muertos.mjs dotenv_config_path=.env.local --tenant main
 *   … --aplicar
 */
import { randomUUID } from "node:crypto";
import pg from "pg";

const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
const iTenant = args.indexOf("--tenant");
const tenant = iTenant >= 0 ? args[iTenant + 1] : null;
if (!tenant) {
  console.error("Falta --tenant <id>. (A propósito: nunca todos los tenants de una.)");
  process.exit(1);
}

const MAX_EN_DETALLE = 60;
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const contar = async () =>
  (
    await db.query(
      `SELECT COUNT(*)::int AS n FROM "WoodEntryTroza" t JOIN "WoodEntry" e ON e."id" = t."woodEntryId"
       WHERE t."tenantId" = $1 AND t."codigoPlanta" IS NOT NULL AND btrim(t."codigoPlanta") <> ''
         AND (e."deletedAt" IS NOT NULL OR e."status" IN ('anulado', 'rechazado'))`,
      [tenant],
    )
  ).rows[0].n;

const antes = await contar();
const { rows } = await db.query(
  `SELECT t."id", btrim(t."codigoPlanta") AS "codigoPlanta", t."codificacion", t."woodEntryId",
          e."gtfNumber", e."status", (e."deletedAt" IS NOT NULL) AS borrado
   FROM "WoodEntryTroza" t JOIN "WoodEntry" e ON e."id" = t."woodEntryId"
   WHERE t."tenantId" = $1 AND t."codigoPlanta" IS NOT NULL AND btrim(t."codigoPlanta") <> ''
     AND (e."deletedAt" IS NOT NULL OR e."status" IN ('anulado', 'rechazado'))
   ORDER BY e."gtfNumber", t."woodEntryId", t."orden"`,
  [tenant],
);
console.log(`ANTES: ${antes} troza(s) de ingresos muertos con código en ${tenant}. Modo: ${aplicar ? "APLICAR" : "dry-run"}`);

const porIngreso = new Map();
for (const r of rows) {
  const g = porIngreso.get(r.woodEntryId) ?? { gtf: r.gtfNumber, motivo: r.borrado ? "ingreso eliminado" : `ingreso ${r.status}`, piezas: [] };
  g.piezas.push(r);
  porIngreso.set(r.woodEntryId, g);
}
const detalle = (g) => {
  const piezas = g.piezas
    .slice(0, MAX_EN_DETALLE)
    .map((t) => `${t.codigoPlanta}${t.codificacion ? ` (troza ${t.codificacion})` : ""} → sin código`);
  const resto = g.piezas.length - piezas.length;
  return (
    `Liberó el código de planta de ${g.piezas.length} troza(s) de la GTF ${g.gtf} (${g.motivo}; limpieza única 2026-09-26): ` +
    piezas.join("; ") +
    (resto > 0 ? `; y ${resto} más` : "")
  );
};
for (const [id, g] of porIngreso) console.log(`  ${g.gtf} · ${id} · ${g.motivo} · ${g.piezas.length} pieza(s): ${g.piezas.slice(0, 6).map((p) => p.codigoPlanta).join(", ")}${g.piezas.length > 6 ? "…" : ""}`);

if (aplicar && rows.length > 0) {
  await db.query("BEGIN");
  try {
    /* ActivityLog tiene RLS: `set_config(..., true)` = SET LOCAL, muere con la
       transacción (nunca SET SESSION sobre el pooler). */
    await db.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenant]);
    const upd = await db.query(
      `UPDATE "WoodEntryTroza" SET "codigoPlanta" = NULL WHERE "tenantId" = $1 AND "id" = ANY($2::text[])`,
      [tenant, rows.map((r) => r.id)],
    );
    for (const [id, g] of porIngreso) {
      await db.query(
        `INSERT INTO "ActivityLog" ("id", "action", "entity", "entityId", "detail", "user", "tenantId", "createdAt")
         VALUES ($1, 'ctp_troza_codigo_soltado', 'WoodEntry', $2, $3, 'sistema:limpieza-codigos-planta', $4, now())`,
        [`c${randomUUID().replace(/-/g, "").slice(0, 24)}`, id, detalle(g), tenant],
      );
    }
    await db.query("COMMIT");
    console.log(`Soltados: ${upd.rowCount} · renglones de auditoría: ${porIngreso.size}`);
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
}

console.log(`DESPUÉS: ${await contar()} troza(s) de ingresos muertos con código en ${tenant}.`);
await db.end();
