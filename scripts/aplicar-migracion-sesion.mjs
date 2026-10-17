#!/usr/bin/env node
/**
 * Aplica UN archivo .sql de `prisma/migrations/` por el pooler de SESIÓN
 * (:5432), en UNA transacción. Después: `node scripts/prisma-session.mjs
 * migrate resolve --applied <carpeta>` (ver memoria migracion-pooler-y-resolve-quirurgico).
 *
 * Uso:
 *   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs <archivo.sql> [--ensayo] dotenv_config_path=.env.local
 *   … <archivo.sql> --sin-tx [--max-seg 60] [--ensayo] …   (CONCURRENTLY / FK NOT VALID + VALIDATE; ver `sinTransaccion`)
 *
 * `--ensayo` (08-10, K2): corre todo igual y termina en ROLLBACK. Antes de
 * revertir verifica DENTRO de la transacción que existan las tablas
 * (`CREATE TABLE IF NOT EXISTS "X"`), columnas (`ALTER TABLE "X" ADD COLUMN IF
 * NOT EXISTS "c"`) e índices (`CREATE [UNIQUE] INDEX IF NOT EXISTS "i"`) que
 * declara el archivo. Así el ensayo en seco ya no pide un script temporal.
 *
 * Por qué y no `apply-fiados-gestion-migration.mjs` ni `prisma db execute`:
 * · Atómico: todo o nada. El de fiados corre en autocommit (si falla a mitad
 *   deja media migración); `db execute` no deja re-correr un archivo con FK.
 * · FK idempotentes sin `DO $$`: cada sentencia va en su SAVEPOINT y
 *   «already exists» (Postgres no tiene ADD CONSTRAINT IF NOT EXISTS) se salta
 *   sin abortar la transacción. Cualquier otro error la revierte entera.
 * · `IF NOT EXISTS` no da error sino un NOTICE «already exists, skipping»: se
 *   escucha y la sentencia se cuenta como «ya estaba». La 2.ª corrida de una
 *   migración idempotente tiene que cerrar con «0 nuevas».
 * · `SET LOCAL lock_timeout = '5s'`: si una tabla de producción está tomada,
 *   se aborta en vez de encolar escrituras detrás del ALTER. LOCAL vive sólo
 *   en esta transacción — nunca SET SESSION (el pooler lo pegaría en
 *   conexiones de producción, memoria pooler-set-session-se-pega).
 * · Parte por `;` de sentencia (memoria migracion-sql-script-parte-por-punto-y-coma)
 *   con `partirSentencias`: respeta '…', $$…$$ / $tag$…$tag$ (cuerpos plpgsql,
 *   ADR-491) y saca los comentarios `--` y `/* … *\/`. Exportada: el test de
 *   la migración la usa para fijar cuántas sentencias salen.
 * · `CREATE OR REPLACE FUNCTION|TRIGGER` no avisa nada: se compara la
 *   definición antes y después (pg_get_functiondef / pg_get_triggerdef); si
 *   quedó idéntica cuenta como «ya estaba», así la 2.ª corrida sigue en «0 nuevas».
 *
 * Usado por primera vez en 20260927_lote_mixto_adr441 (ADR-441).
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";

/**
 * Parte un .sql en sentencias por `;`, sin cortar dentro de literales '…',
 * de cuerpos $$…$$ / $tag$…$tag$ ni de comentarios. Los comentarios no viajan.
 * @param {string} texto
 * @returns {string[]}
 */
export function partirSentencias(texto) {
  const out = [];
  let cur = "";
  let i = 0;
  while (i < texto.length) {
    const ch = texto[i];
    if (ch === "-" && texto[i + 1] === "-") {
      const fin = texto.indexOf("\n", i);
      i = fin === -1 ? texto.length : fin;
      continue;
    }
    if (ch === "/" && texto[i + 1] === "*") {
      const fin = texto.indexOf("*/", i + 2);
      i = fin === -1 ? texto.length : fin + 2;
      cur += " ";
      continue;
    }
    if (ch === "'") {
      let j = i + 1;
      while (j < texto.length) {
        if (texto[j] === "'" && texto[j + 1] === "'") j += 2;
        else if (texto[j] === "'") break;
        else j += 1;
      }
      cur += texto.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === "$") {
      const m = /^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/.exec(texto.slice(i, i + 64));
      if (m) {
        const fin = texto.indexOf(m[0], i + m[0].length);
        if (fin === -1) throw new Error(`[aplicar] ${m[0]} sin cerrar`);
        cur += texto.slice(i, fin + m[0].length);
        i = fin + m[0].length;
        continue;
      }
    }
    if (ch === ";") {
      out.push(cur);
      cur = "";
      i += 1;
      continue;
    }
    cur += ch;
    i += 1;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

const RE_INDICE_CONC =
  /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+(?:IF\s+NOT\s+EXISTS\s+)?"(\w+)"\s+ON\s+"(\w+)"\s*\(([^)]*)\)\s*(?:WHERE\s+([\s\S]+))?$/i;

/** null = no existe · true/false = pg_index.indisvalid */
async function indiceValido(k, nombre) {
  const r = await k.query(
    "SELECT i.indisvalid FROM pg_index i JOIN pg_class x ON x.oid = i.indexrelid JOIN pg_namespace n ON n.oid = x.relnamespace WHERE n.nspname = 'public' AND x.relname = $1",
    [nombre],
  );
  return r.rows[0]?.indisvalid ?? null;
}

/**
 * Vigía en OTRA conexión: cancela (`pg_cancel_backend`) la sentencia del `pid`
 * si pasa `maxSeg`, si espera >5 s un candado de TABLA o si frena a otra
 * sesión >5 s. Reemplaza a `statement_timeout`/`lock_timeout` donde no hay
 * transacción que los haga LOCAL (y SET SESSION se pega en el pooler).
 */
function vigilar(w, pid, maxSeg) {
  let motivo = null;
  let vivo = true;
  let esperaDesde = null;
  let frenaDesde = null;
  let despertar = () => {};
  const vuelta = (async () => {
    while (vivo) {
      await new Promise((r) => {
        const t = setTimeout(r, 500);
        despertar = () => (clearTimeout(t), r());
      });
      if (!vivo) break;
      try {
        const f = (
          await w.query(
            `SELECT extract(epoch FROM now() - query_start)::float AS seg, wait_event_type AS tipo, wait_event AS evento,
                    (SELECT count(*)::int FROM pg_stat_activity o WHERE $1 = ANY (pg_blocking_pids(o.pid))) AS frena
               FROM pg_stat_activity WHERE pid = $1 AND state = 'active'`,
            [pid],
          )
        ).rows[0];
        if (!f) continue;
        const ahora = Date.now();
        esperaDesde = f.tipo === "Lock" && f.evento === "relation" ? (esperaDesde ?? ahora) : null;
        frenaDesde = f.frena > 0 ? (frenaDesde ?? ahora) : null;
        if (f.seg > maxSeg) motivo = `pasó ${maxSeg} s`;
        else if (esperaDesde && ahora - esperaDesde > 5000) motivo = "esperó >5 s un candado de tabla";
        else if (frenaDesde && ahora - frenaDesde > 5000) motivo = `frenó a ${f.frena} sesión(es) >5 s`;
        if (motivo) {
          await w.query("SELECT pg_cancel_backend($1)", [pid]);
          break;
        }
      } catch (e) {
        console.error(`  ⚠ vigía cayó: ${e.message}`);
        break;
      }
    }
  })();
  return {
    async parar() {
      vivo = false;
      despertar();
      await vuelta;
      return motivo;
    },
  };
}

/**
 * `--sin-tx` (16-10): sentencias que Postgres no deja correr en una
 * transacción (`CREATE|DROP INDEX CONCURRENTLY`) o que conviene separar
 * (`ADD CONSTRAINT … NOT VALID` y después `VALIDATE CONSTRAINT`: así el
 * candado del ADD no se sostiene mientras valida). De a UNA sentencia:
 * · CONCURRENTLY → autocommit pelado, cuidado por `vigilar`. Después mira
 *   `pg_index.indisvalid`: si quedó INVALID (cancelado o fallado) lo suelta con
 *   `DROP INDEX CONCURRENTLY` y corta. `IF NOT EXISTS` sobre un INVALID viejo
 *   también lo agarra (Postgres lo «saltea» y lo dejaría inservible).
 * · El resto → su propia tx con `SET LOCAL lock_timeout '5s'` y
 *   `statement_timeout` (LOCAL: mueren con la tx), más el vigía.
 * No hay todo-o-nada: corta en el primer error y lo anterior queda.
 * `--ensayo`: nada queda escrito. CREATE INDEX → `SELECT` de sus columnas con
 * su WHERE (prueba columnas y predicado, cuenta filas que entrarían) y si ya
 * existe/es válido. El resto → UNA tx que termina en ROLLBACK (un VALIDATE de
 * FK prueba de verdad que no hay huérfanas), con centinela de que revirtió.
 * Usado por primera vez en los índices de marzo (20260316/17/18), 16-10.
 */
async function sinTransaccion(url, sentencias, ensayo, maxSeg) {
  const conectar = async () => {
    const k = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });
    await k.connect();
    return k;
  };
  const c = await conectar();
  const avisos = [];
  c.on("notice", (n) => avisos.push(String(n.message)));
  console.log(`[aplicar] --sin-tx · ${url.host} (session) · ${sentencias.length} sentencias · tope ${maxSeg} s${ensayo ? " · ENSAYO (nada queda escrito)" : ""}`);
  const cabeza = (s) => s.replace(/\s+/g, " ").slice(0, 110);
  try {
    if (ensayo) {
      const fks = sentencias.map((s) => /ADD CONSTRAINT "(\w+)"/i.exec(s)?.[1]).filter(Boolean);
      const hay = async (n) => (await c.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conname = $1", [n])).rows[0].n;
      const antes = Object.fromEntries(await Promise.all(fks.map(async (n) => [n, await hay(n)])));
      let malas = 0;
      await c.query("BEGIN");
      await c.query("SET LOCAL lock_timeout = '5s'");
      for (const [i, s] of sentencias.entries()) {
        await c.query(`SAVEPOINT e${i}`);
        try {
          const m = RE_INDICE_CONC.exec(s);
          if (m) {
            const cols = m[3].split(",").map((x) => x.trim().replace(/\s+(ASC|DESC)\b[\s\S]*$/i, "").replace(/\s+NULLS\s+(FIRST|LAST)$/i, ""));
            const where = m[4] ? ` WHERE ${m[4]}` : "";
            await c.query(`SELECT ${cols.join(", ")} FROM "${m[2]}"${where} LIMIT 0`);
            const n = (await c.query(`SELECT count(*)::int AS n FROM "${m[2]}"${where}`)).rows[0].n;
            const v = await indiceValido(c, m[1]);
            if (v === false) malas += 1;
            console.log(`  ${v ? "· ya estaba" : v === false ? "✗ existe INVALID" : "✓ se puede crear"}: ${m[1]} ON ${m[2]}(${cols.join(",")}) · ${n} filas entrarían`);
          } else if (/\bCONCURRENTLY\b/i.test(s)) {
            console.log(`  ? no se ensaya (CONCURRENTLY no entra en una tx): ${cabeza(s)}`);
          } else {
            await c.query(s);
            console.log(`  ✓ ${cabeza(s)}`);
          }
          await c.query(`RELEASE SAVEPOINT e${i}`);
        } catch (e) {
          await c.query(`ROLLBACK TO SAVEPOINT e${i}`);
          malas += 1;
          console.log(`  ✗ ${e.message} ← ${cabeza(s)}`);
        }
      }
      await c.query("ROLLBACK");
      for (const n of fks) {
        if (!antes[n] && (await hay(n))) {
          malas += 1;
          console.log(`  ⚠️ NO HUBO ROLLBACK: ${n} quedó creada`);
        }
      }
      console.log(`[aplicar] ENSAYO → ROLLBACK · ${malas ? `${malas} con problema` : "todo se puede aplicar"}`);
      if (malas) process.exitCode = 1;
      return;
    }
    const pid = (await c.query("SELECT pg_backend_pid() AS p")).rows[0].p;
    const w = await conectar();
    let nuevas = 0;
    let yaEstaban = 0;
    try {
      for (const s of sentencias) {
        const m = RE_INDICE_CONC.exec(s);
        const conc = /\bCONCURRENTLY\b/i.test(s);
        avisos.length = 0;
        const val = /VALIDATE CONSTRAINT "(\w+)"/i.exec(s)?.[1];
        if (val && (await c.query("SELECT convalidated FROM pg_constraint WHERE conname = $1", [val])).rows[0]?.convalidated) {
          yaEstaban += 1;
          console.log(`  · ya estaba (validada): ${cabeza(s)}`);
          continue;
        }
        const t0 = Date.now();
        const vigia = vigilar(w, pid, maxSeg);
        let error = null;
        try {
          if (conc) await c.query(s);
          else {
            await c.query("BEGIN");
            await c.query("SET LOCAL lock_timeout = '5s'");
            await c.query(`SET LOCAL statement_timeout = '${Math.round(maxSeg)}s'`);
            await c.query(s);
            await c.query("COMMIT");
          }
        } catch (e) {
          if (!conc) await c.query("ROLLBACK").catch((err) => console.error("[aplicar] ROLLBACK falló:", err.message));
          error = e;
        }
        const seg = ((Date.now() - t0) / 1000).toFixed(2);
        const motivo = await vigia.parar();
        const v = m ? await indiceValido(c, m[1]) : undefined;
        if (m && v === false) {
          await c.query(`DROP INDEX CONCURRENTLY IF EXISTS "${m[1]}"`);
          throw new Error(`${m[1]} quedó INVALID${motivo ? ` (vigía: ${motivo})` : ""}${error ? ` · ${error.message}` : ""} → soltado con DROP INDEX CONCURRENTLY`);
        }
        if (error && String(error.message).includes("already exists")) {
          yaEstaban += 1;
          console.log(`  · ya estaba (${seg} s): ${cabeza(s)}`);
          continue;
        }
        if (error) throw new Error(`${error.message}${motivo ? ` (vigía: ${motivo})` : ""} ← ${cabeza(s)}`);
        if (m && v === null) throw new Error(`${m[1]} no existe después de crearlo`);
        const ya = avisos.some((a) => a.includes("already exists, skipping") || a.includes("does not exist, skipping"));
        if (ya) yaEstaban += 1;
        else nuevas += 1;
        console.log(`  ${ya ? "· ya estaba" : "✓"} (${seg} s${m ? " · válido" : ""}) ${cabeza(s)}`);
      }
    } finally {
      await w.end();
      console.log(`[aplicar] --sin-tx · ${nuevas} nuevas · ${yaEstaban} ya estaban`);
    }
  } catch (e) {
    console.error("[aplicar] CORTÓ:", e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
}

const esCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (esCli) await main();

async function main() {
const archivo = process.argv.slice(2).find((a) => a.endsWith(".sql"));
const ensayo = process.argv.includes("--ensayo");
if (!archivo) {
  console.error("Uso: node -r dotenv/config scripts/aplicar-migracion-sesion.mjs <archivo.sql> [--ensayo] dotenv_config_path=.env.local");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("[aplicar] falta DATABASE_URL (¿dotenv_config_path=.env.local?)");
  process.exit(1);
}
const url = new URL(process.env.DATABASE_URL);
if (!url.host.includes("pooler.supabase.com")) {
  console.error(`[aplicar] DATABASE_URL no apunta al pooler de Supabase (${url.host})`);
  process.exit(1);
}
url.port = "5432";
url.searchParams.delete("pgbouncer");
url.searchParams.delete("connection_limit");

const texto = readFileSync(archivo, "utf8");
const sentencias = partirSentencias(texto);
const sinComentarios = sentencias.join(";\n");
if (process.argv.includes("--sin-tx")) {
  const iMax = process.argv.indexOf("--max-seg");
  const maxSeg = iMax > 0 ? Number(process.argv[iMax + 1]) : 60;
  if (!(maxSeg > 0)) {
    console.error("[aplicar] --max-seg tiene que ser un número de segundos > 0");
    process.exit(1);
  }
  await sinTransaccion(url, sentencias, ensayo, maxSeg);
  return;
}

/** Lo que el archivo dice crear: se verifica en el ensayo antes del ROLLBACK. */
function declarado(sql) {
  const tablas = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS "(\w+)"/gi)].map((m) => m[1]);
  const columnas = [...sql.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN IF NOT EXISTS "(\w+)"/gi)].map((m) => [m[1], m[2]]);
  const indices = [...sql.matchAll(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS "(\w+)"/gi)].map((m) => m[1]);
  const funciones = [...sql.matchAll(/CREATE OR REPLACE FUNCTION "(\w+)"/gi)].map((m) => m[1]);
  const triggers = [...sql.matchAll(/CREATE OR REPLACE TRIGGER "(\w+)"/gi)].map((m) => m[1]);
  return { tablas, columnas, indices, funciones, triggers };
}

/** Definición actual de lo que un CREATE OR REPLACE va a pisar (null = no existía). */
async function definicionActual(c, s) {
  const f = /^CREATE OR REPLACE FUNCTION "(\w+)"/i.exec(s);
  if (f) {
    const r = await c.query(
      "SELECT pg_get_functiondef(p.oid) AS d FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = $1",
      [f[1]],
    );
    return r.rows[0]?.d ?? null;
  }
  const t = /^CREATE OR REPLACE TRIGGER "(\w+)"/i.exec(s);
  if (t) {
    const r = await c.query("SELECT pg_get_triggerdef(oid) AS d FROM pg_trigger WHERE tgname = $1 AND NOT tgisinternal", [t[1]]);
    return r.rows[0]?.d ?? null;
  }
  return undefined;
}

async function verificar(c) {
  const { tablas, columnas, indices, funciones, triggers } = declarado(sinComentarios);
  let faltan = 0;
  for (const t of tablas) {
    const r = await c.query(
      "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
      [t],
    );
    if (r.rows[0].n === 0) faltan += 1;
    console.log(`  ${r.rows[0].n ? "✓" : "✗"} tabla ${t}: ${r.rows[0].n} columnas`);
  }
  for (const [t, col] of columnas) {
    const r = await c.query(
      "SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2",
      [t, col],
    );
    if (!r.rows.length) faltan += 1;
    console.log(`  ${r.rows.length ? "✓" : "✗"} columna ${t}.${col}: ${r.rows[0]?.data_type ?? "NO EXISTE"}`);
  }
  for (const i of indices) {
    const r = await c.query("SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1", [i]);
    if (!r.rows.length) faltan += 1;
    console.log(`  ${r.rows.length ? "✓" : "✗"} índice ${i}`);
  }
  for (const f of funciones) {
    const r = await c.query("SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = $1", [f]);
    if (!r.rows.length) faltan += 1;
    console.log(`  ${r.rows.length ? "✓" : "✗"} función ${f}`);
  }
  for (const t of triggers) {
    const r = await c.query("SELECT tgenabled FROM pg_trigger WHERE tgname = $1 AND NOT tgisinternal", [t]);
    if (!r.rows.length) faltan += 1;
    console.log(`  ${r.rows.length ? "✓" : "✗"} trigger ${t}${r.rows[0] ? ` (enabled=${r.rows[0].tgenabled})` : ""}`);
  }
  return faltan;
}

const c = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });
const avisos = [];
c.on("notice", (n) => avisos.push(String(n.message)));
await c.connect();
console.log(`[aplicar] ${archivo} · ${url.host} (session) · ${sentencias.length} sentencias${ensayo ? " · ENSAYO (termina en ROLLBACK)" : ""}`);
let nuevas = 0;
let yaEstaban = 0;
try {
  await c.query("BEGIN");
  await c.query("SET LOCAL lock_timeout = '5s'");
  let i = 0;
  for (const s of sentencias) {
    i += 1;
    const cabeza = s.replace(/\s+/g, " ").slice(0, 110);
    await c.query(`SAVEPOINT s${i}`);
    avisos.length = 0;
    try {
      const antes = await definicionActual(c, s);
      await c.query(s);
      const igual = antes != null && antes === (await definicionActual(c, s));
      await c.query(`RELEASE SAVEPOINT s${i}`);
      // «does not exist, skipping» = un DROP … IF EXISTS que ya se había hecho
      // (K7: se suelta el CHECK viejo y se pone una v2 con otro nombre).
      if (igual || avisos.some((m) => m.includes("already exists, skipping") || m.includes("does not exist, skipping"))) {
        yaEstaban += 1;
        console.log(`  · ya estaba: ${cabeza}`);
      } else {
        nuevas += 1;
        console.log(`  ✓ ${cabeza}`);
      }
    } catch (e) {
      await c.query(`ROLLBACK TO SAVEPOINT s${i}`);
      if (String(e.message).includes("already exists")) {
        yaEstaban += 1;
        console.log(`  · ya estaba: ${cabeza}`);
        continue;
      }
      throw e;
    }
  }
  console.log(`[aplicar] ${nuevas} nuevas · ${yaEstaban} ya estaban`);
  if (ensayo) {
    const faltan = await verificar(c);
    await c.query("ROLLBACK");
    console.log(`[aplicar] ENSAYO → ROLLBACK (no quedó nada escrito) · ${faltan ? `${faltan} FALTAN` : "todo lo declarado existía dentro de la tx"}`);
    if (faltan) process.exitCode = 1;
  } else {
    await c.query("COMMIT");
    console.log("[aplicar] COMMIT");
  }
} catch (e) {
  await c.query("ROLLBACK").catch((err) => console.error("[aplicar] ROLLBACK falló:", err.message));
  console.error("[aplicar] ROLLBACK:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
}
