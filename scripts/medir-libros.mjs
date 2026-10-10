#!/usr/bin/env node
/**
 * medir-libros.mjs — los bordes de los libros del contador (14.1, 8.1, 13.1) en UNA llamada.
 *
 * Por qué (10-10): la revisión del carril encontró tres huecos de plata que el cuadre
 * contra `/api/sales` no veía (devoluciones sin nota de crédito, gastos con hora que
 * cruzan de día, órdenes de compra a medias). Medirlos costaba un SELECT a mano cada
 * vez; con esto se ve de una si el mes tiene casos.
 *
 * Uso:
 *   node scripts/medir-libros.mjs <tenantId|slug exacto> <YYYY-MM>
 *   node scripts/medir-libros.mjs main 2026-10
 *
 * Solo lectura: `BEGIN READ ONLY … ROLLBACK` (de TRANSACCIÓN, nunca `SET SESSION`:
 * memoria `pooler-set-session-se-pega`). Parámetros como `$1 $2`, nunca interpolados.
 * El tenant se busca por id o slug EXACTO (un `like` agarra el negocio de QA).
 */
import pg from "pg";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const [tenantArg, periodo] = process.argv.slice(2);
if (!tenantArg || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo ?? "")) {
  console.error("Uso: node scripts/medir-libros.mjs <tenantId|slug> <YYYY-MM>");
  process.exit(2);
}

const [anio, mes] = periodo.split("-").map(Number);
// Lima = UTC−5 todo el año: el mes de Lima va de las 05:00 UTC del día 1 al siguiente.
// Se pasan como texto UTC SIN «Z»: la columna es `timestamp` sin zona y node-pg mandaría un
// `Date` con el desfase de la máquina (Lima), que Postgres descarta en silencio.
const utc = (d) => d.toISOString().replace("Z", "");
const desde = utc(new Date(Date.UTC(anio, mes - 1, 1, 5)));
const hasta = utc(new Date(Date.UTC(anio, mes, 1, 5)));
const desdeDia = utc(new Date(Date.UTC(anio, mes - 1, 1)));
const hastaDia = utc(new Date(Date.UTC(anio, mes, 1)));
/** La fecha tal como la lee Prisma (UTC), en texto: node-pg la leería como hora local. */
const TXT = (col) => `to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

// Prisma guarda `timestamp` SIN zona, en UTC: el día UTC es `to_char(date)` y el de Lima
// hay que convertirlo explícito (el `at time zone` suelto depende de la zona de la sesión).
const LIMA = `((date at time zone 'UTC') at time zone 'America/Lima')`;

const CONSULTAS = [
  {
    titulo: "Gastos con hora cuyo día de Lima ≠ día UTC (todo el negocio; «cruzaMes» = cambia el libro)",
    sql: `select id, ${TXT("date")} as date, amount, "documentType",
            to_char(date, 'YYYY-MM-DD') as "diaUtc",
            to_char(${LIMA}, 'YYYY-MM-DD') as "diaLima",
            to_char(date, 'YYYY-MM') <> to_char(${LIMA}, 'YYYY-MM') as "cruzaMes"
          from "Expense"
          where "tenantId" = $1 and recurring = false
            and date <> date_trunc('day', date)
            and to_char(date, 'YYYY-MM-DD') <> to_char(${LIMA}, 'YYYY-MM-DD')
          order by date desc`,
    params: (t) => [t],
  },
  {
    titulo: "Órdenes de compra recibidas en parte (no entran al 8.1 hasta completarse)",
    sql: `select id, ${TXT('"createdAt"')} as "createdAt", ${TXT('"receivedDate"')} as "receivedDate", total, "invoiceType", "invoiceNumber"
          from "PurchaseOrder" where "tenantId" = $1 and status = 'parcial' order by "createdAt" desc`,
    params: (t) => [t],
  },
  {
    titulo: `Devoluciones del período ${periodo} y si tienen nota de crédito EMITIDA`,
    sql: `select r.id, ${TXT('r."createdAt"')} as "createdAt", r.total, r."saleId", r."orderId",
            exists (select 1 from "NotaCredito" n where n."tenantId" = r."tenantId" and n.status = 'EMITIDA'
                    and ((r."saleId" is not null and n."saleId" = r."saleId") or (r."orderId" is not null and n."orderId" = r."orderId"))) as "conNota"
          from "Return" r where r."tenantId" = $1 and r."createdAt" >= $2 and r."createdAt" < $3
          order by r."createdAt"`,
    params: (t) => [t, desde, hasta],
  },
  {
    titulo: `Pedidos entregados de ${periodo} con boleta/factura emitida en OTRO mes`,
    sql: `select o.id, ${TXT('o."createdAt"')} as "createdAt", s.type, s.series, s.number, ${TXT('s."createdAt"')} as "emitidoEn"
          from "Order" o join "SunatInvoice" s on s."orderId" = o.id and s."tenantId" = o."tenantId"
          where o."tenantId" = $1 and o."deletedAt" is null and o.status = 'entregado'
            and o."createdAt" >= $2 and o."createdAt" < $3
            and s.type in ('boleta', 'factura') and s."sunatStatus" <> 'rejected'
            and not (s."createdAt" >= $2 and s."createdAt" < $3)`,
    params: (t) => [t, desde, hasta],
  },
  {
    titulo: `Gastos del período por las dos reglas (UTC puro vs día de Lima)`,
    sql: `select
            count(*) filter (where date >= $4 and date < $5) as "utcPuro",
            count(*) filter (where (date >= $2 and date < $3) or date = $4) as "diaLima_bruto",
            count(*) filter (where ((date >= $2 and date < $3) or date = $4) and date <> $5) as "diaLima"
          from "Expense" where "tenantId" = $1 and recurring = false`,
    params: (t) => [t, desde, hasta, desdeDia, hastaDia],
  },
];

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const t = await c.query(`select id, slug from "Tenant" where id = $1 or slug = $1`, [tenantArg]);
  if (t.rows.length !== 1) {
    console.error(`Tenant «${tenantArg}»: ${t.rows.length} coincidencias (usa el id o el slug exacto).`);
    process.exitCode = 1;
  } else {
    const tenantId = t.rows[0].id;
    console.log(`Tenant ${t.rows[0].slug} (${tenantId}) · período ${periodo} · Lima ${desde}Z → ${hasta}Z`);
    for (const q of CONSULTAS) {
      const r = await c.query(q.sql, q.params(tenantId));
      console.log(`\n## ${q.titulo} — ${r.rows.length} filas`);
      if (r.rows.length) console.table(r.rows.slice(0, 20));
    }
  }
} catch (e) {
  console.error(String(e?.message ?? e));
  process.exitCode = 1;
} finally {
  await c.query("ROLLBACK").catch((err) => console.error("[medir-libros] rollback", String(err)));
  await c.end();
}
