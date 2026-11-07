#!/usr/bin/env node
/**
 * ADR-491 · fase MIGRATE: pasa los recibos firmados que viven en
 * `Adelanto.comprobanteUrl` (`priv:<tenant>/adelantos/<id>/<ms>-firma-recibo-<azar>.webp`)
 * al registro solo-de-agregar `AdelantoFirma` (tipo FIRMA, canal BACKFILL).
 *
 * Uso:
 *   node -r dotenv/config scripts/backfill-firmas-adelantos.mjs dotenv_config_path=.env.local             # dry-run (no escribe)
 *   node -r dotenv/config scripts/backfill-firmas-adelantos.mjs --aplicar dotenv_config_path=.env.local   # escribe
 *   … [--tenant <tenantId>]                                                                                # solo un negocio
 *
 * · No mueve el archivo ni toca `comprobanteUrl`: la fila apunta a la misma ruta.
 * · Idempotente: `idempotencyKey = 'backfill:' || ruta` + `ON CONFLICT DO NOTHING`
 *   sobre el único (tenantId, idempotencyKey). La 2.ª corrida da «0 candidatos».
 * · sha256 y bytes del binario que está HOY en el bucket privado (se baja con
 *   la service role). Si no se puede bajar, esa fila se salta y se avisa.
 * · Firmante = nombre/documento de la ficha (`limpiarDocumento`); monto = el
 *   del adelanto hoy (el recibo viejo no guardaba lo que se vio al firmar).
 * · createdAt = el instante de la firma, sacado del `<ms>` del nombre.
 * · Raw SQL solo con `$1 $2` (regla 11). Cada INSERT es su propia sentencia:
 *   cortar a mitad deja filas completas y la re-corrida sigue donde quedó.
 * · Medido 10-10 (architect): 0 recibos firmados en toda la base → hoy «0 candidatos».
 */
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const aplicar = process.argv.includes("--aplicar");
const iTenant = process.argv.indexOf("--tenant");
const soloTenant = iTenant > -1 ? process.argv[iTenant + 1] : null;
if (!process.env.DATABASE_URL) {
  console.error("[backfill-firmas] falta DATABASE_URL (¿dotenv_config_path=.env.local?)");
  process.exit(1);
}

const PREFIJO = "priv:";
const ARCHIVO = /^(\d{10,16})-firma-recibo-[a-f0-9]{8,32}\.webp$/;
const BUCKET = "forestal-privado"; // = BUCKET_FOTOS_CARGA (lib/forestal/fotos-carga-storage.ts)

/** Copia de `limpiarDocumento` (lib/adelantos/recibo-firmado.ts): un .mjs no importa TS. */
function limpiarDocumento(documento) {
  return (documento ?? "").replace(/^\s*(dni|ce|ruc)\s*[:.]?\s*/i, "").replace(/[\s.-]/g, "").toUpperCase();
}

/** La ruta tiene que ser de ESTE adelanto (lo mismo exige el CHECK `AdelantoFirma_ruta_chk`). */
function rutaValida(ruta, tenantId, adelantoId) {
  const base = `${tenantId}/adelantos/${adelantoId}/`;
  if (!ruta.startsWith(base)) return null;
  const m = ARCHIVO.exec(ruta.slice(base.length));
  return m ? Number(m[1]) : null;
}

async function bajar(ruta) {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  bajar.cliente ??= createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await bajar.cliente.storage.from(BUCKET).download(ruta);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  const total = await c.query(
    `SELECT count(*)::int AS n FROM "Adelanto" WHERE "comprobanteUrl" LIKE $1 AND ($2::text IS NULL OR "tenantId" = $2)`,
    [`${PREFIJO}%-firma-recibo-%`, soloTenant],
  );
  const { rows } = await c.query(
    `SELECT a.id, a."tenantId", a."comprobanteUrl", a."montoAdelantado"::text AS monto, a.moneda,
            a."codigoOperacion", b.nombre, b.documento
       FROM "Adelanto" a
       JOIN "AdelantoBeneficiario" b ON b.id = a."beneficiarioId" AND b."tenantId" = a."tenantId"
      WHERE a."comprobanteUrl" LIKE $1
        AND ($2::text IS NULL OR a."tenantId" = $2)
        AND NOT EXISTS (
          SELECT 1 FROM "AdelantoFirma" f
           WHERE f."tenantId" = a."tenantId" AND f."idempotencyKey" = 'backfill:' || substr(a."comprobanteUrl", $3))
      ORDER BY a."tenantId", a."createdAt"`,
    [`${PREFIJO}%-firma-recibo-%`, soloTenant, PREFIJO.length + 1],
  );
  console.log(
    `[backfill-firmas] ${aplicar ? "APLICAR" : "dry-run"}${soloTenant ? ` · tenant ${soloTenant}` : ""} · ` +
      `${total.rows[0].n} adelantos con recibo firmado en comprobanteUrl · ${rows.length} candidatos · ` +
      `${total.rows[0].n - rows.length} ya en el registro`,
  );

  let nuevas = 0;
  let saltadas = 0;
  for (const r of rows) {
    const ruta = r.comprobanteUrl.slice(PREFIJO.length);
    const ms = rutaValida(ruta, r.tenantId, r.id);
    if (ms == null) {
      saltadas += 1;
      console.warn(`  ! ${r.tenantId}/${r.id}: la ruta no es de este adelanto o no es un recibo firmado; se salta`);
      continue;
    }
    if (!aplicar) {
      console.log(`  · ${r.tenantId} · ${r.codigoOperacion ?? r.id} · firmado ${new Date(ms).toISOString()}`);
      continue;
    }
    const bin = await bajar(ruta);
    if (!bin || bin.length === 0) {
      saltadas += 1;
      console.warn(`  ! ${r.tenantId}/${r.id}: no se pudo bajar el archivo del bucket privado; se salta`);
      continue;
    }
    const ins = await c.query(
      `INSERT INTO "AdelantoFirma"
         ("id","tenantId","adelantoId","tipo","canal","firmanteNombre","firmanteDocumento","ruta","sha256","bytes",
          "montoFirmado","monedaFirmada","codigoOperacion","idempotencyKey","createdAt")
       VALUES ($1,$2,$3,'FIRMA','BACKFILL',$4,$5,$6,$7,$8,$9::numeric,$10,$11,$12,$13)
       ON CONFLICT ("tenantId","idempotencyKey") DO NOTHING`,
      [
        `c${randomBytes(12).toString("hex")}`,
        r.tenantId,
        r.id,
        r.nombre,
        limpiarDocumento(r.documento),
        ruta,
        createHash("sha256").update(bin).digest("hex"),
        bin.length,
        r.monto,
        r.moneda,
        r.codigoOperacion,
        `backfill:${ruta}`,
        new Date(ms),
      ],
    );
    nuevas += ins.rowCount;
    console.log(`  ${ins.rowCount ? "✓" : "· ya estaba"} ${r.tenantId} · ${r.codigoOperacion ?? r.id}`);
  }
  console.log(
    aplicar
      ? `[backfill-firmas] ${nuevas} nuevas · ${saltadas} saltadas`
      : `[backfill-firmas] dry-run: no se escribió nada (${rows.length - saltadas} se insertarían con --aplicar, ${saltadas} saltadas)`,
  );
} finally {
  await c.end();
}
