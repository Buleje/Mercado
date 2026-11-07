#!/usr/bin/env node
/**
 * ADR-516 — Prueba de conducta del código único de los papeles, contra la base
 * real y SIN dejar nada (negocio sintético `qa-adr516-*`, nunca uno de verdad).
 *
 * 1. En UNA transacción que termina en ROLLBACK: correlativo desde 1, borrar
 *    (duro o a la papelera) no devuelve el código, fotos de las cámaras sin
 *    código, código explícito que el contador alcanza, índice único, negocio
 *    sin relleno que no numera hasta que corre `documentos-codigo-relleno` y
 *    el relleno idempotente en orden de subida. Desde 20261024b (revisión de
 *    security): contador por debajo o borrado, código explícito en negocio sin
 *    contador y `tags` NULL → el alta sigue y no repite.
 * 2. Carrera: N altas simultáneas, cada una en su conexión y su transacción
 *    que confirma → N códigos distintos 1…N. Borra el negocio sintético al final.
 * 3. Alta en el mismo instante que el relleno: espera su candado y sale
 *    numerada a continuación (antes quedaba sin código).
 *
 * Uso: node -r dotenv/config scripts/documentos-codigo-conducta.mjs dotenv_config_path=.env.local [--sin-carrera]
 * Va por :5432 (sesión): el pooler de 6543 es producción compartida.
 */
import pg from "pg";
import { rellenarEnTx } from "./documentos-codigo-relleno.mjs";

const url = new URL(process.env.DATABASE_URL);
url.port = "5432";
url.searchParams.delete("pgbouncer");
url.searchParams.delete("connection_limit");
const nuevo = () => new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });
const SELLO = Date.now();
const res = [];
const ok = (nombre, cond, detalle) => res.push(`${cond ? "✓" : "✗"} ${nombre}${detalle !== undefined ? ` → ${JSON.stringify(detalle)}` : ""}`);

async function conducta() {
  const c = nuevo();
  await c.connect();
  const T = `qa-adr516-${SELLO}`;
  let n = 0;
  const T2 = `qa-adr516-explicito-${SELLO}`;
  const T3 = `qa-adr516-tagsnull-${SELLO}`;
  const alta = async (extra = {}) => {
    n += 1;
    const r = await c.query(
      `INSERT INTO "Document" ("id","tenantId","name","originalName","mimeType","size","storagePath","uploadedById","updatedAt","tags","codigo","uploadedAt")
       VALUES ($1,$2,'qa','qa.pdf','application/pdf',1,'qa/x','qa',now(),$3::text[],$4, now() + ($5 || ' seconds')::interval) RETURNING "id","codigo"`,
      [`qa516_${n}_${SELLO}`, extra.tenant ?? T, "tags" in extra ? extra.tags : [], extra.codigo ?? null, String(n)],
    );
    return r.rows[0];
  };
  const maxDe = async (t) => (await c.query(`SELECT COALESCE(MAX("codigo"), 0)::int m FROM "Document" WHERE "tenantId" = $1`, [t])).rows[0].m;
  const contador = async (t) => (await c.query(`SELECT "ultimo" FROM "DocumentCodigoContador" WHERE "tenantId" = $1`, [t])).rows[0]?.ultimo ?? null;
  // Cada caso nuevo en su SAVEPOINT: con el trigger viejo el alta falla (índice
  // único) y eso se anota ✗ sin cortar el resto.
  const caso = async (nombre, fn) => {
    await c.query("SAVEPOINT caso");
    try {
      await fn();
      await c.query("RELEASE SAVEPOINT caso");
    } catch (e) {
      ok(nombre, false, String(e.message).slice(0, 90));
      await c.query("ROLLBACK TO SAVEPOINT caso");
    }
  };
  const t0 = Date.now();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL lock_timeout = '5s'");
    const a = [await alta(), await alta(), await alta()];
    ok("negocio nuevo arranca en 1, correlativo", a.map((x) => x.codigo).join() === "1,2,3", a.map((x) => x.codigo));
    await c.query(`DELETE FROM "Document" WHERE "id" = $1`, [a[2].id]);
    await c.query(`UPDATE "Document" SET "deletedAt" = now() WHERE "id" = $1`, [a[1].id]);
    const b = await alta();
    ok("borrar (duro y papelera) no devuelve el código", b.codigo === 4, b.codigo);
    const fotos = [await alta({ tags: ["personas"] }), await alta({ tags: ["asistencia", "x"] })];
    ok("fotos de las cámaras sin código", fotos.every((f) => f.codigo === null), fotos.map((f) => f.codigo));
    const exp = await alta({ codigo: 10 });
    const tras = await alta();
    ok("código explícito respetado y el contador lo alcanza", exp.codigo === 10 && tras.codigo === 11, [exp.codigo, tras.codigo]);
    await c.query("SAVEPOINT u");
    try {
      await c.query(`UPDATE "Document" SET "codigo" = 1 WHERE "id" = $1`, [b.id]);
      ok("índice único rechaza repetido", false);
    } catch (e) {
      ok("índice único rechaza repetido", /Document_tenantId_codigo_key/.test(String(e.message)), String(e.message).slice(0, 80));
      await c.query("ROLLBACK TO SAVEPOINT u");
    }

    // Un papel con `tags` NULL (la columna lo admite): lleva código.
    const sinTags = await alta({ tags: null });
    ok("tags NULL lleva código", sinTags.codigo !== null, sinTags.codigo);

    // Un negocio de antes del ADR: papeles sin código y sin contador.
    await c.query(`UPDATE "Document" SET "codigo" = NULL WHERE "tenantId" = $1`, [T]);
    await c.query(`DELETE FROM "DocumentCodigoContador" WHERE "tenantId" = $1`, [T]);
    const viejo = await alta();
    ok("negocio sin relleno: el papel nuevo espera sin código", viejo.codigo === null, viejo.codigo);
    const esperados = (await c.query(
      `SELECT COUNT(*)::int n FROM "Document" WHERE "tenantId" = $1 AND NOT (COALESCE("tags", '{}') && ARRAY['personas','asistencia']::text[])`,
      [T],
    )).rows[0].n;
    const r1 = await rellenarEnTx(c, T);
    ok("relleno numera 1…N (papelera incluida)", r1.numerados === esperados && r1.desde === 1 && r1.hasta === esperados && r1.ultimo === esperados, r1);
    const orden = (await c.query(
      `SELECT bool_and(ok) ok FROM (SELECT "codigo" = ROW_NUMBER() OVER (ORDER BY "uploadedAt","id") ok FROM "Document" WHERE "tenantId" = $1 AND "codigo" IS NOT NULL) x`,
      [T],
    )).rows[0].ok;
    ok("en orden de subida", orden === true, orden);
    const sig = await alta();
    ok("alta tras el relleno sigue en N+1", sig.codigo === esperados + 1, sig.codigo);
    const r2 = await rellenarEnTx(c, T);
    ok("2.ª corrida del relleno = 0", r2.numerados === 0 && r2.ultimo === esperados + 1, r2);
    const tagsTras = (await c.query(`SELECT "codigo" FROM "Document" WHERE "id" = $1`, [sinTags.id])).rows[0].codigo;
    ok("el relleno también numera el de tags NULL", tagsTras !== null, tagsTras);

    // ── Revisión de security (20261024b): el contador nunca traba las altas.
    await caso("contador por debajo de un código: el alta sigue y no repite", async () => {
      const m = await maxDe(T);
      await c.query(`UPDATE "DocumentCodigoContador" SET "ultimo" = 1 WHERE "tenantId" = $1`, [T]);
      const x = await alta();
      const k = await contador(T);
      ok("contador por debajo de un código: el alta sigue y no repite", x.codigo === m + 1 && k === m + 1, { max: m, nuevo: x.codigo, contador: k });
    });
    await caso("contador borrado: se recrea y sigue desde el más alto", async () => {
      const m = await maxDe(T);
      await c.query(`DELETE FROM "DocumentCodigoContador" WHERE "tenantId" = $1`, [T]);
      const x = await alta();
      const k = await contador(T);
      ok("contador borrado: se recrea y sigue desde el más alto", x.codigo === m + 1 && k === m + 1, { max: m, nuevo: x.codigo, contador: k });
    });
    await caso("código explícito en negocio sin contador: el siguiente no choca", async () => {
      const e1 = await alta({ tenant: T2, codigo: 1 });
      const e2 = await alta({ tenant: T2 });
      ok("código explícito en negocio sin contador: el siguiente no choca", e1.codigo === 1 && e2.codigo === 2, [e1.codigo, e2.codigo]);
    });
    await caso("negocio viejo cuyo único pendiente tiene tags NULL: el alta espera al relleno", async () => {
      await alta({ tenant: T3, tags: null });
      await c.query(`UPDATE "Document" SET "codigo" = NULL WHERE "tenantId" = $1`, [T3]);
      await c.query(`DELETE FROM "DocumentCodigoContador" WHERE "tenantId" = $1`, [T3]);
      const x = await alta({ tenant: T3 });
      ok("negocio viejo cuyo único pendiente tiene tags NULL: el alta espera al relleno", x.codigo === null, x.codigo);
    });
  } finally {
    await c.query("ROLLBACK");
    const quedo = (await c.query(`SELECT COUNT(*)::int n FROM "Document" WHERE "tenantId" = ANY($1)`, [[T, T2, T3]])).rows[0].n;
    res.push(`  ROLLBACK · filas del negocio sintético que quedaron: ${quedo} · ${Date.now() - t0} ms`);
    await c.end();
  }
}

async function carrera(N = 12) {
  const T = `qa-adr516-carrera-${SELLO}`;
  const clientes = Array.from({ length: N }, nuevo);
  const limpio = nuevo();
  await Promise.all([...clientes, limpio].map((k) => k.connect()));
  const t0 = Date.now();
  try {
    const codigos = await Promise.all(
      clientes.map(async (k, i) => {
        await k.query("BEGIN");
        const r = await k.query(
          `INSERT INTO "Document" ("id","tenantId","name","originalName","mimeType","size","storagePath","uploadedById","updatedAt")
           VALUES ($1,$2,'qa','qa.pdf','application/pdf',1,'qa/x','qa',now()) RETURNING "codigo"`,
          [`qa516c_${i}_${SELLO}`, T],
        );
        await k.query("SELECT pg_sleep(0.2)"); // sostiene el candado: las demás esperan su turno
        await k.query("COMMIT");
        return r.rows[0].codigo;
      }),
    );
    const orden = [...codigos].sort((a, b) => a - b);
    ok(`${N} altas simultáneas → códigos distintos 1…${N}`, new Set(codigos).size === N && orden.join() === Array.from({ length: N }, (_, i) => i + 1).join(), codigos);
    res.push(`  ${Date.now() - t0} ms`);
  } finally {
    const d = await limpio.query(`DELETE FROM "Document" WHERE "tenantId" = $1`, [T]);
    const k = await limpio.query(`DELETE FROM "DocumentCodigoContador" WHERE "tenantId" = $1`, [T]);
    res.push(`  limpieza: ${d.rowCount} papeles + ${k.rowCount} contador del negocio sintético`);
    await Promise.all([...clientes, limpio].map((x) => x.end()));
  }
}

async function carreraConRelleno() {
  const T = `qa-adr516-relleno-${SELLO}`;
  const [a, b, limpio] = [nuevo(), nuevo(), nuevo()];
  await Promise.all([a, b, limpio].map((k) => k.connect()));
  const insertar = (k, i) =>
    k.query(
      `INSERT INTO "Document" ("id","tenantId","name","originalName","mimeType","size","storagePath","uploadedById","updatedAt","uploadedAt")
       VALUES ($1,$2,'qa','qa.pdf','application/pdf',1,'qa/x','qa',now(), now() + ($3 || ' seconds')::interval) RETURNING "codigo"`,
      [`qa516r_${i}_${SELLO}`, T, String(i)],
    );
  try {
    // Negocio «de antes»: 3 papeles sin código y sin contador, confirmados.
    for (let i = 0; i < 3; i++) await insertar(limpio, i);
    await limpio.query(`UPDATE "Document" SET "codigo" = NULL WHERE "tenantId" = $1`, [T]);
    await limpio.query(`DELETE FROM "DocumentCodigoContador" WHERE "tenantId" = $1`, [T]);
    await a.query("BEGIN");
    await a.query("SET LOCAL lock_timeout = '5s'");
    const r = await rellenarEnTx(a, T); // sin confirmar: su contador todavía no se ve
    // El alta de otra persona, en ese instante. Se anota cuándo vuelve: si vuelve
    // antes de que el relleno confirme, no esperó (y sale sin código).
    const pedido = insertar(b, 9).then((q) => ({ codigo: q.rows[0].codigo, t: Date.now() }));
    await new Promise((ok_) => setTimeout(ok_, 400));
    const tCommit = Date.now();
    await a.query("COMMIT");
    const x = await pedido;
    const espero = x.t >= tCommit;
    ok("alta mientras corre el relleno: espera y sale a continuación", r.numerados === 3 && x.codigo === 4 && espero, { relleno: `${r.desde}…${r.hasta}`, alta: x.codigo, esperoAlRelleno: espero });
  } finally {
    await a.end();
    const d = await limpio.query(`DELETE FROM "Document" WHERE "tenantId" = $1`, [T]);
    const k = await limpio.query(`DELETE FROM "DocumentCodigoContador" WHERE "tenantId" = $1`, [T]);
    res.push(`  limpieza: ${d.rowCount} papeles + ${k.rowCount} contador del negocio sintético`);
    await Promise.all([b, limpio].map((x) => x.end()));
  }
}

try {
  await conducta();
  if (!process.argv.includes("--sin-carrera")) {
    await carrera();
    await carreraConRelleno();
  }
} finally {
  console.log(res.join("\n"));
}
process.exit(res.some((l) => l.startsWith("✗")) ? 1 : 0);
