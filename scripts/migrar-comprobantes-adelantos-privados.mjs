/**
 * Lleva a PRIVADO los comprobantes de Adelantos que quedaron en el bucket
 * PÚBLICO `media` (10-10, Ley 29733): `Adelanto.comprobanteUrl` (voucher del
 * alta) y `AdelantoEntrega.comprobanteUrl` (comprobante de una entrega o abono).
 *
 * Por qué: hasta el 10-10 «Adjuntar archivo», la cámara del abono y «Registrar
 * entrega» subían por `/api/upload`: la URL pública (`…/public/media/<tenant>/…`)
 * se abre sin sesión y lleva nombre, monto y a veces DNI. Lo nuevo ya sube
 * privado; esto mueve lo viejo a la misma forma que usa la puerta
 * `GET /api/adelantos/<id>/comprobante[?entrega=<id>]`:
 *   voucher → forestal-privado  `<t>/adelantos/<id>/<ms>-voucher-<azar>.webp`
 *   entrega → forestal-privado  `<t>/adelantos/<id>/<ms>-adjunto-<azar>.webp`
 *   un PDF  → adelantos-privado (misma ruta, `.pdf`)
 *
 * Uso (dry-run por defecto: NO escribe nada, ni en la base ni en Storage):
 *   node -r dotenv/config scripts/migrar-comprobantes-adelantos-privados.mjs dotenv_config_path=.env.local --todos
 *   … --tenant <tenantId>                   un solo negocio
 *   … --tenant <tenantId> --aplicar         sube la copia privada y reescribe la fila
 *   … --tenant <tenantId> --aplicar --borrar-publica
 *                                           además borra el original público (sólo si
 *                                           ninguna otra fila lo sigue citando)
 *
 * Idempotente: sólo toma filas cuyo comprobante sigue siendo una URL pública;
 * la fila ya `priv:` no se vuelve a tocar. La fila se reescribe con
 * compara-y-cambia (`WHERE "comprobanteUrl" = <la vieja>`): si alguien la cambió
 * en el medio, no se pisa y la copia privada se borra. `--aplicar` exige
 * `--tenant` (a propósito: nunca todos los negocios de una).
 *
 * Lo que no está en la carpeta del negocio (`media/<tenantId>/…`) no se mueve:
 * se lista para revisarlo a mano. El panel cachea los adelantos en memoria:
 * tras `--aplicar`, la ficha muestra lo nuevo al vencer el caché o al reiniciar.
 */
import { randomBytes } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
const borrarPublica = args.includes("--borrar-publica");
const todos = args.includes("--todos");
const iTenant = args.indexOf("--tenant");
const tenant = iTenant >= 0 ? args[iTenant + 1] : null;
if (!tenant && !todos) {
  console.error("Falta --tenant <id> (o --todos para el dry-run de todos los negocios).");
  process.exit(1);
}
if (aplicar && !tenant) {
  console.error("--aplicar exige --tenant <id>: nunca todos los negocios de una.");
  process.exit(1);
}

const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
if (!SB_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.DATABASE_URL) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o DATABASE_URL (¿dotenv_config_path=.env.local?).");
  process.exit(1);
}
const BUCKET_WEBP = "forestal-privado";
const BUCKET_PDF = "adelantos-privado";
const PUBLICO = `${SB_URL}/storage/v1/object/public/media/`;
const ID_SEGURO = /^[A-Za-z0-9_-]{1,64}$/;

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const sb = aplicar ? createClient(SB_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : null;

/** Filas con una URL pública (no `priv:`), de un negocio o de todos. */
const filtro = tenant ? `AND a."tenantId" = $1` : "";
const params = tenant ? [tenant] : [];
const { rows } = await db.query(
  `SELECT 'adelanto' AS tabla, a."id", a."id" AS "adelantoId", a."tenantId", a."comprobanteUrl" AS url
     FROM "Adelanto" a
    WHERE a."comprobanteUrl" IS NOT NULL AND a."comprobanteUrl" NOT LIKE 'priv:%' ${filtro}
   UNION ALL
   SELECT 'entrega', e."id", e."adelantoId", a."tenantId", e."comprobanteUrl"
     FROM "AdelantoEntrega" e JOIN "Adelanto" a ON a."id" = e."adelantoId"
    WHERE e."comprobanteUrl" IS NOT NULL AND e."comprobanteUrl" NOT LIKE 'priv:%' ${filtro}
   ORDER BY 4, 1, 2`,
  params,
);

/** Sólo un archivo de la carpeta de ESE negocio en `media`, sin nada raro. `null` = no se mueve. */
function rutaPublicaDelNegocio(url, tenantId) {
  if (!ID_SEGURO.test(tenantId)) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash) return null;
    const prefijo = `${PUBLICO}${tenantId}/`;
    if (!url.startsWith(prefijo)) return null;
    const resto = url.slice(PUBLICO.length);
    return /^[A-Za-z0-9_-]{1,64}\/[a-z0-9_-]{1,40}\/\d{10,16}-[A-Za-z0-9._-]{0,120}$/.test(resto) && !resto.includes("..") ? resto : null;
  } catch {
    return null;
  }
}

const esPdf = (buf) => /^%PDF-[12]\.\d/.test(buf.subarray(0, 16).toString("latin1"));
const esWebp = (buf) => buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP";

async function asegurarBucketPdf() {
  const { data } = await sb.storage.getBucket(BUCKET_PDF);
  if (data) {
    if (data.public) throw new Error(`El bucket ${BUCKET_PDF} está PÚBLICO: no se migra hasta corregirlo.`);
    return;
  }
  const { error } = await sb.storage.createBucket(BUCKET_PDF, { public: false, fileSizeLimit: 5 * 1024 * 1024, allowedMimeTypes: ["application/pdf"] });
  if (error && !/already exists/i.test(error.message)) throw new Error(`bucket: ${error.message}`);
}

const resumen = { candidatas: 0, fueraDeCarpeta: 0, movidas: 0, fallidas: 0, publicasBorradas: 0 };
const porNegocio = new Map();
console.log(`${rows.length} fila(s) con comprobante PÚBLICO${tenant ? ` en ${tenant}` : " en todos los negocios"}. Modo: ${aplicar ? "APLICAR" : "dry-run"}`);

for (const f of rows) {
  const n = porNegocio.get(f.tenantId) ?? { adelanto: 0, entrega: 0, fuera: 0 };
  porNegocio.set(f.tenantId, n);
  const rutaPublica = rutaPublicaDelNegocio(f.url, f.tenantId);
  if (!rutaPublica || !ID_SEGURO.test(f.adelantoId)) {
    resumen.fueraDeCarpeta++;
    n.fuera++;
    console.log(`  · FUERA de la carpeta del negocio (no se toca): ${f.tabla} ${f.id} → ${f.url.slice(0, 120)}`);
    continue;
  }
  resumen.candidatas++;
  n[f.tabla]++;
  if (!aplicar) {
    console.log(`  · movería ${f.tabla} ${f.id} (adelanto ${f.adelantoId}): media/${rutaPublica}`);
    continue;
  }
  try {
    const { data: blob, error: eBaja } = await sb.storage.from("media").download(rutaPublica);
    if (eBaja || !blob) throw new Error(`no se pudo bajar: ${eBaja?.message ?? "vacío"}`);
    let cuerpo = Buffer.from(await blob.arrayBuffer());
    let ext = "webp";
    if (esPdf(cuerpo)) ext = "pdf";
    else if (!esWebp(cuerpo)) {
      const sharp = (await import("sharp")).default;
      cuerpo = await sharp(cuerpo, { failOn: "warning" }).rotate().webp({ quality: 85 }).toBuffer();
    }
    const marca = f.tabla === "adelanto" ? "voucher" : "adjunto";
    const ruta = `${f.tenantId}/adelantos/${f.adelantoId}/${Date.now()}-${marca}-${randomBytes(8).toString("hex")}.${ext}`;
    const bucket = ext === "pdf" ? BUCKET_PDF : BUCKET_WEBP;
    if (ext === "pdf") await asegurarBucketPdf();
    const { error: eSube } = await sb.storage
      .from(bucket)
      .upload(ruta, cuerpo, { contentType: ext === "pdf" ? "application/pdf" : "image/webp", cacheControl: "0", upsert: false });
    if (eSube) throw new Error(`no se pudo subir: ${eSube.message}`);
    const tabla = f.tabla === "adelanto" ? `"Adelanto"` : `"AdelantoEntrega"`;
    const r =
      f.tabla === "adelanto"
        ? await db.query(`UPDATE ${tabla} SET "comprobanteUrl" = $1 WHERE "id" = $2 AND "tenantId" = $3 AND "comprobanteUrl" = $4`, [`priv:${ruta}`, f.id, f.tenantId, f.url])
        : await db.query(`UPDATE ${tabla} SET "comprobanteUrl" = $1 WHERE "id" = $2 AND "adelantoId" = $3 AND "comprobanteUrl" = $4`, [`priv:${ruta}`, f.id, f.adelantoId, f.url]);
    if (r.rowCount !== 1) {
      await sb.storage.from(bucket).remove([ruta]);
      throw new Error("la fila cambió en el medio: no se pisó y la copia privada se borró");
    }
    resumen.movidas++;
    console.log(`  ✓ ${f.tabla} ${f.id} → priv:${ruta}`);
    if (borrarPublica) {
      const { rows: cita } = await db.query(
        `SELECT (SELECT count(*) FROM "Adelanto" WHERE "comprobanteUrl" = $1) + (SELECT count(*) FROM "AdelantoEntrega" WHERE "comprobanteUrl" = $1) AS n`,
        [f.url],
      );
      if (Number(cita[0].n) === 0) {
        const { error: eBorra } = await sb.storage.from("media").remove([rutaPublica]);
        if (eBorra) console.log(`    ! no se pudo borrar la pública: ${eBorra.message}`);
        else resumen.publicasBorradas++;
      } else console.log(`    · la pública sigue citada por ${cita[0].n} fila(s): no se borra`);
    }
  } catch (e) {
    resumen.fallidas++;
    console.log(`  ✗ ${f.tabla} ${f.id}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const { rows: slugs } = porNegocio.size
  ? await db.query(`SELECT "id", "slug" FROM "Tenant" WHERE "id" = ANY($1)`, [[...porNegocio.keys()]])
  : { rows: [] };
const slugDe = new Map(slugs.map((t) => [t.id, t.slug]));
for (const [t, n] of porNegocio) console.log(`  ${slugDe.get(t) ?? t}: ${n.adelanto} voucher(s), ${n.entrega} comprobante(s) de entrega, ${n.fuera} fuera de carpeta`);
console.log(JSON.stringify({ modo: aplicar ? "aplicar" : "dry-run", ...resumen }));
await db.end();
