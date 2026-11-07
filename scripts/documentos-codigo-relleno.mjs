#!/usr/bin/env node
/**
 * ADR-516 — Relleno del código de documento, negocio por negocio.
 *
 * Numera los documentos de un negocio que todavía no tienen código (incluidos
 * los de la papelera, para que su número quede tomado), en orden de subida
 * (`uploadedAt`, desempate por id), siguiendo al último código entregado, y
 * deja el contador en el máximo. Desde ahí, el trigger `documento_asignar_codigo`
 * numera solo cada alta nueva. Las fotos de máquina (cámaras, asistencia) no
 * llevan código.
 *
 * Uso:
 *   node -r dotenv/config scripts/documentos-codigo-relleno.mjs --tenant <id> [--ensayo] dotenv_config_path=.env.local
 *   node -r dotenv/config scripts/documentos-codigo-relleno.mjs --todas [--ensayo] dotenv_config_path=.env.local
 *
 * · Una transacción por negocio, en lote (4 idas, no una por fila: memoria
 *   tx-por-fila-latencia-119ms). `--ensayo` corre igual y termina en ROLLBACK.
 * · Idempotente: la 2.ª corrida numera 0; si alguna vez queda un papel sin
 *   número (p. ej. el alta llegó en REPEATABLE READ mientras corría), se vuelve a
 *   correr y lo toma. Un alta normal en el mismo instante ya no se escapa: el
 *   relleno y el trigger (camino «sin contador visible») toman el mismo candado
 *   consultivo por negocio, y el alta sale numerada a continuación. Igual el
 *   script hace una 2.ª pasada por negocio, de red.
 * · Pooler de sesión (:5432); `SET LOCAL` y nunca `SET SESSION`.
 */
import { pathToFileURL } from "node:url";
import pg from "pg";

/** = TAGS_FOTOS_DE_MAQUINA (lib/documents/fotos-de-maquina.ts); un test fija que coincidan. */
export const TAGS_SIN_CODIGO = ["personas", "asistencia"];

/**
 * Numera los documentos sin código de `tenantId`. Corre DENTRO de una
 * transacción abierta por quien llama (así la prueba la puede revertir).
 * @returns {Promise<{ numerados: number; desde: number | null; hasta: number | null; ultimo: number }>}
 */
export async function rellenarEnTx(client, tenantId) {
  // = el candado del trigger (20261024b): un alta sin contador visible espera acá.
  await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('documento_codigo:' || $1, 516))`, [tenantId]);
  await client.query(
    `INSERT INTO "DocumentCodigoContador" ("tenantId", "ultimo") VALUES ($1, 0)
     ON CONFLICT ("tenantId") DO NOTHING`,
    [tenantId],
  );
  // Candado de la fila: un alta simultánea espera a que esto confirme y sigue
  // desde el máximo que deja el relleno.
  await client.query(`SELECT "ultimo" FROM "DocumentCodigoContador" WHERE "tenantId" = $1 FOR UPDATE`, [tenantId]);
  const r = await client.query(
    `WITH base AS (
       SELECT GREATEST(
                c."ultimo",
                COALESCE((SELECT MAX("codigo") FROM "Document" WHERE "tenantId" = $1), 0)
              ) AS b
         FROM "DocumentCodigoContador" c
        WHERE c."tenantId" = $1
     ),
     pend AS (
       SELECT "id", ROW_NUMBER() OVER (ORDER BY "uploadedAt", "id") AS rn
         FROM "Document"
        WHERE "tenantId" = $1 AND "codigo" IS NULL AND NOT (COALESCE("tags", '{}') && $2::TEXT[])
     )
     UPDATE "Document" d
        SET "codigo" = base.b + pend.rn
       FROM pend, base
      WHERE d."id" = pend."id"
     RETURNING d."codigo"`,
    [tenantId, TAGS_SIN_CODIGO],
  );
  const c = await client.query(
    `UPDATE "DocumentCodigoContador"
        SET "ultimo" = GREATEST("ultimo", COALESCE((SELECT MAX("codigo") FROM "Document" WHERE "tenantId" = $1), 0)),
            "updatedAt" = CURRENT_TIMESTAMP
      WHERE "tenantId" = $1
     RETURNING "ultimo"`,
    [tenantId],
  );
  const codigos = r.rows.map((f) => Number(f.codigo));
  return {
    numerados: codigos.length,
    desde: codigos.length ? Math.min(...codigos) : null,
    hasta: codigos.length ? Math.max(...codigos) : null,
    ultimo: Number(c.rows[0]?.ultimo ?? 0),
  };
}

/** Negocios con documentos por numerar. */
export async function tenantsPorNumerar(client) {
  const r = await client.query(
    `SELECT "tenantId", COUNT(*)::INT AS n FROM "Document"
      WHERE "codigo" IS NULL AND NOT (COALESCE("tags", '{}') && $1::TEXT[])
      GROUP BY 1 ORDER BY 2 DESC`,
    [TAGS_SIN_CODIGO],
  );
  return r.rows.map((f) => ({ tenantId: f.tenantId, n: f.n }));
}

function urlDeSesion() {
  if (!process.env.DATABASE_URL) throw new Error("falta DATABASE_URL (¿dotenv_config_path=.env.local?)");
  const url = new URL(process.env.DATABASE_URL);
  if (url.host.includes("pooler.supabase.com")) url.port = "5432";
  url.searchParams.delete("pgbouncer");
  url.searchParams.delete("connection_limit");
  return url.toString();
}

async function unaPasada(client, tenantId, ensayo) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    const r = await rellenarEnTx(client, tenantId);
    await client.query(ensayo ? "ROLLBACK" : "COMMIT");
    return r;
  } catch (err) {
    await client.query("ROLLBACK").catch((e) => console.error("[relleno] ROLLBACK falló:", String(e)));
    throw err;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const ensayo = args.includes("--ensayo");
  const i = args.indexOf("--tenant");
  const uno = i >= 0 ? args[i + 1] : null;
  const uso = "Uso: … documentos-codigo-relleno.mjs --tenant <id> | --todas [--ensayo] dotenv_config_path=.env.local";
  if (i >= 0 && (!uno || uno.startsWith("--") || uno.includes("="))) {
    console.error(`[relleno] --tenant pide el id del negocio (llegó ${JSON.stringify(uno ?? null)}).\n${uso}`);
    process.exit(1);
  }
  if (!uno && !args.includes("--todas")) {
    console.error(uso);
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: urlDeSesion(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    if (uno) {
      const t = await client.query(`SELECT 1 FROM "Tenant" WHERE "id" = $1`, [uno]);
      if (t.rowCount === 0) {
        console.error(`[relleno] no existe el negocio ${JSON.stringify(uno)} (va el id, no el slug). Nada cambió.`);
        process.exitCode = 1;
        return;
      }
    }
    const tenants = uno ? [uno] : (await tenantsPorNumerar(client)).map((t) => t.tenantId);
    console.log(`[relleno] ${tenants.length} negocio(s)${ensayo ? " · ENSAYO (termina en ROLLBACK)" : ""}`);
    for (const t of tenants) {
      const p1 = await unaPasada(client, t, ensayo);
      const p2 = ensayo ? null : await unaPasada(client, t, false);
      const rango = p1.numerados ? ` (${p1.desde}…${p1.hasta})` : "";
      console.log(
        `  ${t}: ${p1.numerados} numerados${rango} · contador ${p2?.ultimo ?? p1.ultimo}` +
          (p2 ? ` · 2.ª pasada ${p2.numerados}` : ""),
      );
    }
  } finally {
    await client.end();
  }
}

const esCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (esCli) {
  main().catch((err) => {
    console.error("[relleno] falló:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
