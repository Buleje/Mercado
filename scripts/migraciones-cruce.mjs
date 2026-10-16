#!/usr/bin/env node
/**
 * migraciones-cruce.mjs — cruza `prisma/migrations/` con `_prisma_migrations`
 * y, si se pide, verifica objeto por objeto que lo que una migración crea ya
 * está en la base. SOLO LECTURA: todo corre en `BEGIN READ ONLY … ROLLBACK`
 * (de transacción, nunca `SET SESSION`: memoria `pooler-set-session-se-pega`).
 *
 * Por qué (16-10): la revisión de seguridad encontró 10 carpetas sin fila en
 * `_prisma_migrations` con sus tablas ya creadas a mano; el cruce y el chequeo
 * se hicieron a mano. Así un `prisma migrate deploy` futuro no las repite.
 *
 * Uso:
 *   node scripts/migraciones-cruce.mjs                 # resumen + pendientes + anomalías
 *   node scripts/migraciones-cruce.mjs --todas         # la tabla de todas las carpetas
 *   node scripts/migraciones-cruce.mjs --verificar     # chequea cada pendiente en el catálogo
 *   node scripts/migraciones-cruce.mjs --verificar <carpeta> [<carpeta>…]  # ésas, aplicadas o no
 *   node scripts/migraciones-cruce.mjs --verificar prisma/migrations/adr-430-….sql  # un .sql suelto
 *
 * Probado (16-10) con un .sql de control con 11 errores plantados (tipo, NULL,
 * default, columnas/único/WHERE de índice, ON DELETE de FK, tabla/índice/enum
 * inexistentes, INSERT): 11 de 11 salen ✗ o «MANUAL», ninguno ✓.
 *   --json                                             # salida JSON
 *
 * Qué verifica: CREATE TABLE (columna, tipo, NOT NULL, DEFAULT, PK), ADD COLUMN,
 * CREATE [UNIQUE] INDEX (columnas, único, WHERE), ADD CONSTRAINT (FK con
 * ON DELETE/UPDATE, UNIQUE, PK, CHECK por nombre), DROP CONSTRAINT/COLUMN,
 * ALTER COLUMN, CREATE TYPE … AS ENUM / ADD VALUE, extensiones, funciones,
 * triggers y policies por nombre; lo de dentro de `DO $$`. INSERT/UPDATE/DELETE
 * y lo no reconocido salen como «MANUAL»: no se dan por buenos.
 * Una migración «OK» se marca con
 *   node scripts/prisma-session.mjs migrate resolve --applied <carpeta>
 * (este script NO la marca).
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "dotenv";
import { partirSentencias } from "./aplicar-migracion-sesion.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(repo, ".env.local"), quiet: true });
config({ path: resolve(repo, ".env"), quiet: true });
process.env.TZ = "UTC";

const args = process.argv.slice(2);
const json = args.includes("--json");
const todas = args.includes("--todas");
const verificar = args.includes("--verificar");
// `--verificar <carpeta>` o `--verificar ruta/a/archivo.sql` (p. ej. los .sql
// sueltos de prisma/migrations, que Prisma no registra).
const elegidas = args.filter((a) => !a.startsWith("--"));
const DIR = resolve(repo, "prisma/migrations");

const q = (s) => s.replace(/"/g, "");
const t63 = (s) => Buffer.from(q(s)).subarray(0, 63).toString(); // NAMEDATALEN
const normExpr = (s) =>
  String(s ?? "").replace(/::("[^"]+"|[A-Za-z ]+)(\(\d+(,\d+)?\))?(\[\])?/g, "").toLowerCase().replace(/now\(\)/g, "current_timestamp").replace(/["()\s]/g, "");
function normTipo(t) {
  let s = t.trim().replace(/\s+/g, " ");
  const arr = s.endsWith("[]");
  if (arr) s = s.slice(0, -2).trim();
  // Tipo entre comillas (enum propio): sensible a mayúsculas, se compara tal cual.
  if (s.includes('"')) return `${s.replace(/"/g, "")}${arr ? "[]" : ""}`;
  s = s.toLowerCase().replace(/^char$/, "character(1)").replace(/^char\b/, "character").replace(/\(\s*(\d+)\s*,\s*(\d+)\s*\)/, "($1,$2)");
  s = s.replace(/^decimal/, "numeric").replace(/^(int|int4)$/, "integer").replace(/^int8$/, "bigint").replace(/^int2$/, "smallint")
    .replace(/^bool$/, "boolean").replace(/^varchar/, "character varying").replace(/^float8$/, "double precision").replace(/^serial$/, "integer");
  if (/^timestamptz(\(\d+\))?$/.test(s)) s = s.replace("timestamptz", "timestamp") + " with time zone";
  if (/^timestamp(\(\d+\))?$/.test(s)) s += " without time zone";
  return arr ? `${s}[]` : s;
}
const ACCION = { cascade: "c", "set null": "n", restrict: "r", "no action": "a", "set default": "d" };
const partirComas = (s) => {
  const out = []; let cur = ""; let p = 0;
  for (const ch of s) { if (ch === "(") p++; if (ch === ")") p--; if (ch === "," && p === 0) { out.push(cur); cur = ""; } else cur += ch; }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
};
const cols = (s) => partirComas(s).map((c) => q(c.replace(/\s+(asc|desc)\b.*$/i, "")).trim());

// ── catálogo ──────────────────────────────────────────────────────────────
async function leerCatalogo(c) {
  // En fila: un pg.Client no acepta consultas en paralelo. Los `name[]`
  // (attname, enumlabel) se castean a text: si no, `pg` los entrega como "{a,b}".
  let cola = Promise.resolve();
  const r = (sql) => (cola = cola.then(() => c.query(sql)).then((x) => x.rows));
  const [columnas, indices, restricciones, enums, ext, fun, trg, pol] = await Promise.all([
    r(`select c.relname t, a.attname col, format_type(a.atttypid,a.atttypmod) tipo, a.attnotnull nn, pg_get_expr(d.adbin,d.adrelid) def
       from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
       left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
       where n.nspname='public' and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped`),
    r(`select t.relname t, i.relname nombre, x.indisunique uni, pg_get_expr(x.indpred,x.indrelid,true) pred,
       array(select pg_get_indexdef(x.indexrelid,k,true) from generate_series(1,x.indnkeyatts) k order by k) cols
       from pg_index x join pg_class i on i.oid=x.indexrelid join pg_class t on t.oid=x.indrelid
       join pg_namespace n on n.oid=t.relnamespace where n.nspname='public'`),
    r(`select t.relname t, k.conname nombre, k.contype tipo, ft.relname ft, k.confdeltype del, k.confupdtype upd,
       array(select a.attname::text from unnest(k.conkey) with ordinality u(n,o) join pg_attribute a on a.attrelid=k.conrelid and a.attnum=u.n order by o) cols,
       array(select a.attname::text from unnest(k.confkey) with ordinality u(n,o) join pg_attribute a on a.attrelid=k.confrelid and a.attnum=u.n order by o) fcols
       from pg_constraint k join pg_class t on t.oid=k.conrelid join pg_namespace n on n.oid=t.relnamespace
       left join pg_class ft on ft.oid=k.confrelid where n.nspname='public'`),
    r(`select t.typname nombre, array_agg(e.enumlabel::text order by e.enumsortorder) vals from pg_type t join pg_enum e on e.enumtypid=t.oid group by t.typname`),
    r(`select extname nombre from pg_extension`),
    r(`select p.proname nombre from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`),
    r(`select t.tgname nombre, c.relname t from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal`),
    r(`select tablename t, policyname nombre from pg_policies where schemaname='public'`),
  ]);
  const col = new Map(columnas.map((x) => [`${x.t}.${x.col}`, x]));
  return {
    col, tablas: new Set(columnas.map((x) => x.t)),
    idx: new Map(indices.map((x) => [x.nombre, x])),
    con: new Map(restricciones.map((x) => [`${x.t}.${x.nombre}`, x])),
    enums: new Map(enums.map((x) => [x.nombre, x.vals])),
    ext: new Set(ext.map((x) => x.nombre)), fun: new Set(fun.map((x) => x.nombre)),
    trg: new Set(trg.map((x) => `${x.t}.${x.nombre}`)), pol: new Set(pol.map((x) => `${x.t}.${x.nombre}`)),
  };
}

// ── verificador ───────────────────────────────────────────────────────────
function verificarColumna(K, tabla, def, out) {
  const m = /^"?(\w+)"?\s+([\s\S]*)$/.exec(def.trim());
  if (!m) return out.push(["MANUAL", `columna no leída: ${def}`]);
  const [, nombre, resto] = m;
  const corte = /\s(NOT\s+NULL|NULL|DEFAULT|PRIMARY\s+KEY|REFERENCES|UNIQUE|CHECK|CONSTRAINT|GENERATED|COLLATE)\b/i.exec(` ${resto}`);
  const tipo = normTipo(corte ? ` ${resto}`.slice(0, corte.index) : resto);
  const pk = /PRIMARY\s+KEY/i.test(resto);
  const nn = /NOT\s+NULL/i.test(resto) || pk;
  const dm = /\bDEFAULT\s+([\s\S]+?)(?=\s+(NOT\s+NULL|NULL|PRIMARY|REFERENCES|UNIQUE|CHECK|CONSTRAINT)\b|$)/i.exec(resto);
  const real = K.col.get(`${tabla}.${nombre}`);
  const id = `${tabla}.${nombre}`;
  if (!real) return out.push(["FALTA", `columna ${id} ${tipo}${nn ? " NOT NULL" : ""}`]);
  const dif = [];
  if (real.tipo.replace(/"/g, "") !== tipo) dif.push(`tipo ${real.tipo} ≠ ${tipo}`);
  if (real.nn !== nn) dif.push(`${real.nn ? "NOT NULL" : "NULL"} en la base ≠ ${nn ? "NOT NULL" : "NULL"}`);
  if (normExpr(real.def) !== normExpr(dm?.[1])) dif.push(`default ${real.def ?? "(ninguno)"} ≠ ${dm?.[1] ?? "(ninguno)"}`);
  out.push(dif.length ? ["DIFIERE", `${id}: ${dif.join(" · ")}`] : ["ok", `${id} ${tipo}${nn ? " NOT NULL" : ""}${dm ? ` DEFAULT ${dm[1]}` : ""}`]);
  if (pk) verificarRestriccion(K, tabla, `CONSTRAINT "${tabla}_pkey" PRIMARY KEY ("${nombre}")`, out);
}

function verificarRestriccion(K, tabla, def, out) {
  const m = /^CONSTRAINT\s+"?(\w+)"?\s+([\s\S]+)$/i.exec(def.trim());
  if (!m) return out.push(["MANUAL", `restricción sin nombre: ${def}`]);
  const [, nombre, cuerpo] = m;
  const real = K.con.get(`${tabla}.${t63(nombre)}`);
  const id = `${tabla}.${nombre}`;
  if (!real) return out.push(["FALTA", `restricción ${id}: ${cuerpo.replace(/\s+/g, " ")}`]);
  const dif = [];
  const pk = /^PRIMARY\s+KEY\s*\(([^)]*)\)/i.exec(cuerpo);
  const uq = /^UNIQUE\s*\(([^)]*)\)/i.exec(cuerpo);
  const fk = /^FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+"?(\w+)"?\s*\(([^)]*)\)([\s\S]*)$/i.exec(cuerpo);
  if (pk || uq) {
    if (real.tipo !== (pk ? "p" : "u")) dif.push(`tipo ${real.tipo}`);
    if (cols((pk ?? uq)[1]).join(",") !== real.cols.join(",")) dif.push(`columnas ${real.cols} ≠ ${cols((pk ?? uq)[1])}`);
  } else if (fk) {
    const del = ACCION[(/ON\s+DELETE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION|SET\s+DEFAULT)/i.exec(fk[4])?.[1] ?? "no action").toLowerCase().replace(/\s+/g, " ")];
    const upd = ACCION[(/ON\s+UPDATE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION|SET\s+DEFAULT)/i.exec(fk[4])?.[1] ?? "no action").toLowerCase().replace(/\s+/g, " ")];
    if (real.tipo !== "f") dif.push(`tipo ${real.tipo} ≠ f`);
    if (cols(fk[1]).join(",") !== real.cols.join(",")) dif.push(`columnas ${real.cols} ≠ ${cols(fk[1])}`);
    if (real.ft !== fk[2] || cols(fk[3]).join(",") !== real.fcols.join(",")) dif.push(`apunta a ${real.ft}(${real.fcols}) ≠ ${fk[2]}(${cols(fk[3])})`);
    if (real.del !== del) dif.push(`ON DELETE ${real.del} ≠ ${del}`);
    if (real.upd !== upd) dif.push(`ON UPDATE ${real.upd} ≠ ${upd}`);
  } else if (!/^CHECK\b/i.test(cuerpo)) return out.push(["MANUAL", `restricción no leída: ${def}`]);
  out.push(dif.length ? ["DIFIERE", `${id}: ${dif.join(" · ")}`] : ["ok", `${id} ${cuerpo.split(/\s/)[0].toUpperCase()}${fk ? ` → ${fk[2]}` : ""}`]);
}

function verificarSentencia(K, s, out, borradas) {
  const S = s.replace(/\s+/g, " ").trim();
  let m;
  if ((m = /^CREATE TABLE (?:IF NOT EXISTS )?(?:"?public"?\.)?"?(\w+)"? \(([\s\S]*)\)$/i.exec(S))) {
    const [, tabla, cuerpo] = m;
    if (!K.tablas.has(tabla)) return out.push(["FALTA", `tabla ${tabla}`]);
    out.push(["ok", `tabla ${tabla}`]);
    for (const item of partirComas(cuerpo)) {
      if (/^CONSTRAINT\b/i.test(item)) verificarRestriccion(K, tabla, item, out);
      else if (/^(PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK)\b/i.test(item)) out.push(["MANUAL", `restricción sin nombre en ${tabla}: ${item}`]);
      else verificarColumna(K, tabla, item, out);
    }
    return;
  }
  if ((m = /^CREATE (UNIQUE )?INDEX (?:CONCURRENTLY )?(?:IF NOT EXISTS )?"?(\w+)"? ON (?:ONLY )?(?:"?public"?\.)?"?(\w+)"? ?(?:USING \w+ ?)?\((.*?)\)(?: WHERE (.+))?$/i.exec(S))) {
    const [, uni, nombre, tabla, lista, where] = m;
    const real = K.idx.get(t63(nombre));
    if (!real) return out.push(["FALTA", `índice ${nombre} ON ${tabla}(${cols(lista)})${where ? ` WHERE ${where}` : ""}`]);
    const dif = [];
    if (real.t !== tabla) dif.push(`está en ${real.t}`);
    if (real.uni !== Boolean(uni)) dif.push(real.uni ? "es UNIQUE" : "no es UNIQUE");
    if (normExpr(real.cols.join(",")) !== normExpr(cols(lista).join(","))) dif.push(`columnas ${real.cols.map(q)} ≠ ${cols(lista)}`);
    if (normExpr(real.pred) !== normExpr(where)) dif.push(`WHERE ${real.pred ?? "(ninguno)"} ≠ ${where ?? "(ninguno)"}`);
    return out.push(dif.length ? ["DIFIERE", `índice ${nombre}: ${dif.join(" · ")}`] : ["ok", `índice ${uni ? "único " : ""}${nombre}${where ? " (parcial)" : ""}`]);
  }
  if ((m = /^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?(?:"?public"?\.)?"?(\w+)"? ([\s\S]+)$/i.exec(S))) {
    const [, tabla, acciones] = m;
    for (const a of partirComas(acciones)) {
      let x;
      if ((x = /^ADD (?:COLUMN )?(?:IF NOT EXISTS )?("?\w+"? [\s\S]+)$/i.exec(a)) && !/^ADD CONSTRAINT/i.test(a)) verificarColumna(K, tabla, x[1], out);
      else if ((x = /^ADD (CONSTRAINT [\s\S]+)$/i.exec(a))) verificarRestriccion(K, tabla, x[1], out);
      else if ((x = /^DROP CONSTRAINT (?:IF EXISTS )?"?(\w+)"?/i.exec(a)))
        borradas.push([`${tabla}.${x[1]}`, () => K.con.has(`${tabla}.${t63(x[1])}`), `restricción ${tabla}.${x[1]}`]);
      else if ((x = /^DROP (?:COLUMN )?(?:IF EXISTS )?"?(\w+)"?/i.exec(a)))
        out.push(K.col.has(`${tabla}.${x[1]}`) ? ["DIFIERE", `${tabla}.${x[1]} debería no existir`] : ["ok", `${tabla}.${x[1]} borrada`]);
      else if ((x = /^ALTER (?:COLUMN )?"?(\w+)"? (SET NOT NULL|DROP NOT NULL|DROP DEFAULT|SET DEFAULT (.+)|(?:SET DATA )?TYPE (.+?)(?: USING .+)?)$/i.exec(a))) {
        const r = K.col.get(`${tabla}.${x[1]}`); const id = `${tabla}.${x[1]}`;
        if (!r) { out.push(["FALTA", `columna ${id}`]); continue; }
        const v = x[2].toUpperCase();
        const ok = v === "SET NOT NULL" ? r.nn : v === "DROP NOT NULL" ? !r.nn : v === "DROP DEFAULT" ? !r.def
          : x[3] ? normExpr(r.def) === normExpr(x[3]) : r.tipo.replace(/"/g, "") === normTipo(x[4]);
        out.push(ok ? ["ok", `${id} ${x[2]}`] : ["DIFIERE", `${id}: ${x[2]} no se ve (tipo ${r.tipo}, ${r.nn ? "NOT NULL" : "NULL"}, default ${r.def ?? "-"})`]);
      } else if (/^(ENABLE|FORCE) ROW LEVEL SECURITY$/i.test(a)) out.push(["MANUAL", `${tabla}: ${a}`]);
      else out.push(["MANUAL", `${tabla}: ${a}`]);
    }
    return;
  }
  if ((m = /^DROP (INDEX|TABLE|TYPE) (?:CONCURRENTLY )?(?:IF EXISTS )?(?:"?public"?\.)?"?(\w+)"?/i.exec(S))) {
    const [, clase, nombre] = m; const k = clase.toUpperCase();
    const existe = () => (k === "INDEX" ? K.idx.has(t63(nombre)) : k === "TABLE" ? K.tablas.has(nombre) : K.enums.has(nombre));
    return borradas.push([nombre, existe, `${k.toLowerCase()} ${nombre}`]);
  }
  // DROP TRIGGER … ON t: ausencia, salvo que el mismo archivo lo vuelva a crear (DROP IF EXISTS + CREATE).
  if ((m = /^DROP TRIGGER (?:IF EXISTS )?"?(\w+)"? ON (?:"?public"?\.)?"?(\w+)"?/i.exec(S)))
    return borradas.push([m[1], () => K.trg.has(`${m[2]}.${m[1]}`), `trigger ${m[1]}`]);
  if ((m = /^CREATE TYPE "?(\w+)"? AS ENUM \((.*)\)$/i.exec(S))) {
    const vals = [...m[2].matchAll(/'((?:[^']|'')*)'/g)].map((v) => v[1]);
    const real = K.enums.get(m[1]);
    if (!real) return out.push(["FALTA", `enum ${m[1]} (${vals})`]);
    const faltan = vals.filter((v) => !real.includes(v));
    return out.push(faltan.length ? ["DIFIERE", `enum ${m[1]}: faltan ${faltan}`] : ["ok", `enum ${m[1]} (${vals.length} valores)`]);
  }
  if ((m = /^ALTER TYPE "?(\w+)"? ADD VALUE (?:IF NOT EXISTS )?'([^']*)'/i.exec(S)))
    return out.push(K.enums.get(m[1])?.includes(m[2]) ? ["ok", `enum ${m[1]} ∋ ${m[2]}`] : ["FALTA", `enum ${m[1]} valor '${m[2]}'`]);
  if ((m = /^CREATE EXTENSION (?:IF NOT EXISTS )?"?([\w-]+)"?/i.exec(S))) return out.push(K.ext.has(m[1]) ? ["ok", `extensión ${m[1]}`] : ["FALTA", `extensión ${m[1]}`]);
  if ((m = /^CREATE (?:OR REPLACE )?FUNCTION (?:"?public"?\.)?"?(\w+)"?/i.exec(S))) return out.push(K.fun.has(m[1]) ? ["ok", `función ${m[1]} (existe; cuerpo sin comparar)`] : ["FALTA", `función ${m[1]}`]);
  if ((m = /^CREATE (?:OR REPLACE )?(?:CONSTRAINT )?TRIGGER "?(\w+)"? .* ON (?:"?public"?\.)?"?(\w+)"?/i.exec(S))) return out.push(K.trg.has(`${m[2]}.${m[1]}`) ? ["ok", `trigger ${m[1]}`] : ["FALTA", `trigger ${m[1]} en ${m[2]}`]);
  if ((m = /^CREATE POLICY "?([^"]+)"? ON (?:"?public"?\.)?"?(\w+)"?/i.exec(S))) return out.push(K.pol.has(`${m[2]}.${m[1]}`) ? ["ok", `policy ${m[1]}`] : ["FALTA", `policy ${m[1]} en ${m[2]}`]);
  if (/^DO (\$\w*\$)/i.test(S)) {
    const cuerpo = S.replace(/^DO (\$\w*\$)([\s\S]*)\1$/i, "$2").replace(/EXCEPTION WHEN [\w ]+ THEN NULL;?/gi, "");
    for (let p of cuerpo.split(";")) {
      p = p.replace(/^\s*(BEGIN|END IF|END|ELSE)\b/gi, "").replace(/^\s*IF [\s\S]+? THEN\b/i, "").trim();
      if (!p || /^(END|NULL|BEGIN)$/i.test(p)) continue;
      if (/^(ALTER|CREATE)\b/i.test(p)) verificarSentencia(K, p, out, borradas);
      else out.push(["MANUAL", `dentro de DO: ${p.slice(0, 90)}`]);
    }
    return;
  }
  if (/^(INSERT|UPDATE|DELETE|MERGE|COPY)\b/i.test(S)) return out.push(["MANUAL", `escribe datos: ${S.slice(0, 90)}`]);
  if (/^SELECT \d+$/i.test(S)) return out.push(["ok", `sin efecto (no-op): ${S}`]);
  if (/^(COMMENT ON|GRANT|REVOKE|SET LOCAL)\b/i.test(S)) return out.push(["ok", `sin efecto de estructura: ${S.slice(0, 60)}`]);
  out.push(["MANUAL", `no reconocida: ${S.slice(0, 90)}`]);
}

function verificarMigracion(K, carpeta) {
  const ruta = carpeta.endsWith(".sql") ? resolve(carpeta) : resolve(DIR, carpeta, "migration.sql");
  const sql = readFileSync(ruta, "utf8");
  const out = []; const borradas = [];
  for (const s of partirSentencias(sql)) verificarSentencia(K, s, out, borradas);
  // Un DROP que el mismo archivo vuelve a crear (DROP IF EXISTS + ADD) no se
  // chequea como ausencia: ya lo cubre el chequeo del CREATE/ADD.
  const creados = out.filter(([e]) => e !== "MANUAL").map(([, d]) => d);
  for (const [clave, existe, rotulo] of borradas) {
    const re = new RegExp(`(^|[^\\w])${clave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\w]|$)`);
    if (creados.some((d) => re.test(d))) continue;
    out.push(existe() ? ["DIFIERE", `${rotulo} debería no existir (DROP)`] : ["ok", `${rotulo} borrado`]);
  }
  const malas = out.filter(([e]) => e !== "ok");
  return { carpeta, veredicto: malas.length ? (malas.some(([e]) => e === "MANUAL") && !malas.some(([e]) => e !== "MANUAL") ? "MANUAL" : "FALTA") : "OK", chequeos: out };
}

// ── main ──────────────────────────────────────────────────────────────────
const carpetas = readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const sueltos = readdirSync(DIR).filter((f) => f.endsWith(".sql")).length;
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
let filas; let K;
try {
  await c.query("BEGIN READ ONLY");
  filas = (await c.query(`select migration_name n, checksum ck, finished_at fin, rolled_back_at rb, applied_steps_count pasos, started_at ini from _prisma_migrations order by started_at`)).rows;
  if (verificar) K = await leerCatalogo(c);
} finally {
  await c.query("ROLLBACK").catch((err) => console.error("[cruce] rollback", String(err)));
  await c.end();
}

const porNombre = Map.groupBy(filas, (f) => f.n);
const cruce = carpetas.map((carpeta) => {
  const rs = porNombre.get(carpeta) ?? [];
  const archivo = resolve(DIR, carpeta, "migration.sql");
  const ck = existsSync(archivo) ? createHash("sha256").update(readFileSync(archivo)).digest("hex") : null;
  const viva = rs.find((r) => r.fin && !r.rb);
  const estado = !ck ? "SIN migration.sql" : viva ? "aplicada" : rs.length === 0 ? "SIN FILA" : rs.some((r) => !r.fin && !r.rb) ? "FALLIDA" : "sólo rolled_back";
  return { carpeta, filas: rs.length, estado, checksum: viva ? (viva.ck === ck ? "igual" : "DISTINTO") : "—", rolledBack: rs.filter((r) => r.rb).length };
});
const filasSinCarpeta = [...porNombre.keys()].filter((n) => !carpetas.includes(n));
const pendientes = cruce.filter((x) => x.estado !== "aplicada");
const rbConViva = cruce.filter((x) => x.estado === "aplicada" && x.rolledBack > 0);
const ckDistinto = cruce.filter((x) => x.checksum === "DISTINTO");
const objetivo = elegidas.length ? elegidas : pendientes.filter((p) => p.estado === "SIN FILA" || p.estado === "sólo rolled_back").map((p) => p.carpeta);
const verificadas = verificar ? objetivo.map((x) => verificarMigracion(K, x)) : [];

if (json) {
  console.log(JSON.stringify({ carpetas: carpetas.length, filas: filas.length, sueltos, cruce: todas ? cruce : undefined, pendientes, filasSinCarpeta, rbConViva, ckDistinto, verificadas }, null, 1));
} else {
  console.log(`${carpetas.length} carpetas · ${filas.length} filas en _prisma_migrations · ${sueltos} .sql sueltos en prisma/migrations (Prisma los ignora)`);
  if (todas) console.table(cruce);
  console.log(`\nPendientes (${pendientes.length}):`); if (pendientes.length) console.table(pendientes.map(({ carpeta, estado, filas: f }) => ({ carpeta, estado, filas: f })));
  console.log(`Filas sin carpeta: ${filasSinCarpeta.length ? filasSinCarpeta.join(", ") : "0"}`);
  console.log(`rolled_back con su duplicado aplicado: ${rbConViva.map((x) => x.carpeta).join(", ") || "0"}`);
  console.log(`Checksum distinto del archivo (aplicadas): ${ckDistinto.length}${ckDistinto.length ? ` → ${ckDistinto.map((x) => x.carpeta).join(", ")}` : ""}`);
  for (const v of verificadas) {
    console.log(`\n── ${v.carpeta} → ${v.veredicto}`);
    for (const [e, d] of v.chequeos) console.log(`   ${e === "ok" ? "✓" : e === "MANUAL" ? "?" : "✗"} ${e === "ok" ? "" : `${e} `}${d}`);
  }
  // Sólo carpetas sin fila viva: un .sql suelto no es una migración de Prisma.
  const ok = verificadas.filter((v) => v.veredicto === "OK" && cruce.some((x) => x.carpeta === v.carpeta && x.estado !== "aplicada"));
  if (ok.length) console.log(`\nPasan el chequeo (marcar de a una, este script NO lo hace):\n${ok.map((v) => `  node scripts/prisma-session.mjs migrate resolve --applied ${v.carpeta}`).join("\n")}`);
}
