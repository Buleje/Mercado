/**
 * Mueve las fotos de la carga del bucket PÚBLICO `media` al privado
 * `forestal-privado` (ADR-434, 2026-09-26) y reescribe `WoodEntry.photos`.
 *
 * Por qué: la URL pública (`…/public/media/<tenant>/forestal/<ts>-<nombre>.webp`)
 * se adivina y se abre sin sesión. La privada sólo se ve con una URL firmada
 * de `/api/admin/forestal/fotos/ver`.
 *
 * Uso (dry-run por defecto; imprime ANTES/DESPUÉS de cada asiento):
 *   node -r dotenv/config scripts/migrar-fotos-carga-privadas.mjs dotenv_config_path=.env.local --tenant main
 *   … --aplicar                   escribe el Json nuevo
 *   … --aplicar --borrar-publica  además borra el original público (sólo si TODAS
 *                                 las filas que lo citaban quedaron reescritas)
 *
 * Si una foto no se puede bajar o subir, queda como legado (string) — la
 * pantalla la sigue mostrando con `srcDeFoto` — y se reporta.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
const borrarPublica = args.includes("--borrar-publica");
const iTenant = args.indexOf("--tenant");
const tenant = iTenant >= 0 ? args[iTenant + 1] : null;
if (!tenant) {
  console.error("Falta --tenant <id>. (A propósito: nunca todos los tenants de una.)");
  process.exit(1);
}

const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const sb = createClient(SB_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BUCKET = "forestal-privado";
const prefijoPublico = `${SB_URL}/storage/v1/object/public/media/${tenant}/`;

const { data: b } = await sb.storage.getBucket(BUCKET);
if (!b) {
  const { error } = await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 5 * 1024 * 1024, allowedMimeTypes: ["image/webp"] });
  if (error) throw new Error(`bucket: ${error.message}`);
} else if (b.public) {
  throw new Error("El bucket forestal-privado está PÚBLICO: no se migra hasta corregirlo.");
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const { rows } = await db.query(
  `SELECT "id", "gtfNumber", "photos" FROM "WoodEntry"
   WHERE "tenantId" = $1 AND "photos" IS NOT NULL AND jsonb_typeof("photos") = 'array' AND jsonb_array_length("photos") > 0
   ORDER BY "gtfNumber", "id"`,
  [tenant],
);
console.log(`${rows.length} asiento(s) con fotos en ${tenant}. Modo: ${aplicar ? "APLICAR" : "dry-run"}`);

/** URL pública → path privado nuevo (una sola subida por URL aunque la citen varias filas). */
const movidas = new Map();
const fallidas = [];
async function mover(url) {
  if (movidas.has(url)) return movidas.get(url);
  if (!url.startsWith(prefijoPublico)) return null;
  const res = await fetch(url);
  if (!res.ok) {
    fallidas.push({ url, motivo: `descarga ${res.status}` });
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const path = `${tenant}/forestal-carga/${randomUUID()}.webp`;
  if (aplicar) {
    const { error } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: "image/webp", upsert: false });
    if (error) {
      fallidas.push({ url, motivo: `subida: ${error.message}` });
      return null;
    }
  }
  movidas.set(url, path);
  return path;
}

const reescritas = new Map(); // url pública → filas que la citaban / reescritas
for (const r of rows) {
  const antes = r.photos;
  const despues = [];
  for (const f of antes) {
    const url = typeof f === "string" ? f : f?.url;
    if (typeof url !== "string" || url.startsWith("priv:")) {
      despues.push(f);
      continue;
    }
    const cuenta = reescritas.get(url) ?? { citan: 0, ok: 0 };
    cuenta.citan += 1;
    reescritas.set(url, cuenta);
    const path = await mover(url);
    if (!path) {
      despues.push(f);
      continue;
    }
    const base = typeof f === "object" && f ? f : {};
    despues.push({ ...base, url: `priv:${path}` });
    cuenta.ok += 1;
  }
  console.log(`\n# ${r.gtfNumber} · ${r.id}\n  ANTES:   ${JSON.stringify(antes)}\n  DESPUÉS: ${JSON.stringify(despues)}`);
  if (aplicar && JSON.stringify(antes) !== JSON.stringify(despues)) {
    await db.query(`UPDATE "WoodEntry" SET "photos" = $1::jsonb WHERE "id" = $2 AND "tenantId" = $3`, [
      JSON.stringify(despues),
      r.id,
      tenant,
    ]);
  }
}

if (aplicar && borrarPublica) {
  const aBorrar = [...reescritas.entries()]
    .filter(([url, c]) => c.ok === c.citan && movidas.has(url))
    .map(([url]) => url.slice(`${SB_URL}/storage/v1/object/public/media/`.length));
  if (aBorrar.length > 0) {
    const { error } = await sb.storage.from("media").remove(aBorrar);
    console.log(error ? `\nNo se pudieron borrar los originales: ${error.message}` : `\nBorrados del bucket público: ${aBorrar.join(", ")}`);
  }
}

console.log(`\nMovidas: ${movidas.size} · fallidas: ${fallidas.length}`);
for (const f of fallidas) console.log(`  FALLÓ ${f.url} — ${f.motivo} (queda como legado)`);
await db.end();
