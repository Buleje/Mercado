#!/usr/bin/env node
/**
 * deploy-chequeo.mjs — «¿se puede desplegar la rama a producción?» en UNA corrida.
 *
 * Por qué (24-10): el chequeo se midió a mano 3 veces (09-10, 22-10, 24-10),
 * siempre con las mismas consultas. Memoria `deploy-produccion-bloqueos-2026-10-09`,
 * runbook `docs/runbooks/deploy-rama-a-produccion.md`.
 *
 * SÓLO LECTURA: nunca despliega, nunca corre crons ni migraciones, nunca escribe.
 *   · base: `BEGIN READ ONLY … ROLLBACK` (de transacción; jamás `SET SESSION`:
 *     el pooler lo pega en conexiones de producción — memoria `pooler-set-session-se-pega`);
 *   · migraciones: `scripts/migraciones-cruce.mjs --json` (también READ ONLY);
 *   · GitHub: sólo `gh api` GET y `gh run list`.
 * Lo que no se puede medir sale «sin medir» con su motivo, nunca como OK.
 *
 * Uso: node scripts/deploy-chequeo.mjs [--base-prod <sha>] [--rama <rama>]
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import pg from "pg";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
process.env.TZ = "UTC";

const ex = promisify(execFile);
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : d;
};
/** Commit que corre en producción (16-07). Se cambia con --base-prod cuando se despliegue. */
const BASE_PROD = arg("--base-prod", "6b4bd49d2");
const BLAS = "cmpxiv6p4000bohvzwl6bnfpv";
const MAIN = "main";
const LIMITE_CRONS = 100;
const DR_MAX_DIAS = 35;

const filas = []; // { freno, hoy, ok: true|false|null, fuente }
const add = (freno, hoy, ok, fuente) => filas.push({ freno, hoy, ok, fuente });
const run = async (cmd, args, opts = {}) => {
  try {
    const { stdout } = await ex(cmd, args, { maxBuffer: 32 * 1024 * 1024, timeout: 120000, ...opts });
    return { ok: true, out: stdout };
  } catch (e) {
    return { ok: false, out: String(e?.stderr || e?.message || e).slice(0, 200) };
  }
};
const git = (...a) => run("git", a);
const cronNombre = (p) => p.replace(/^\/api\/cron\//, "").replace(/^\/api\//, "");
const leerCrons = (txt) => (JSON.parse(txt).crons ?? []).map((c) => ({ ...c, nombre: cronNombre(c.path) }));

/* ── 1. Crons ─────────────────────────────────────────────────────────── */
const actuales = leerCrons(readFileSync("vercel.json", "utf8"));
const base = await git("show", `${BASE_PROD}:vercel.json`);
const enBase = base.ok ? new Set(leerCrons(base.out).map((c) => c.nombre)) : null;
const nuevos = enBase ? actuales.filter((c) => !enBase.has(c.nombre)) : [];
add(
  "Crons en vercel.json",
  `${actuales.length} (límite ${LIMITE_CRONS})` + (enBase ? `; ${nuevos.length} nuevos y ${[...enBase].filter((n) => !actuales.some((c) => c.nombre === n)).length} quitados vs ${BASE_PROD}` : "; sin base para comparar"),
  actuales.length <= LIMITE_CRONS,
  `vercel.json${enBase ? ` vs git show ${BASE_PROD}:vercel.json` : ""}`
);

/** Crons que borran/cierran datos reales en su 1.ª corrida y su SELECT de alcance. */
const DESTRUCTIVOS = [
  {
    nombre: "documentos-papelera",
    que: "borra para siempre la papelera >30 días",
    sql: `select count(*)::int n from "Document" where "tenantId"=$1 and "deletedAt" < now() - interval '30 days'`,
  },
  {
    nombre: "auto-close-register",
    que: "cierra sin conteo las cajas abiertas",
    sql: `select count(*)::int n from "CashRegister" where "tenantId"=$1 and status='abierta'`,
  },
];
/** Crons que mandan WhatsApp/correo/Telegram; no hay SELECT de alcance fiable → sin medir. */
const AVISAN = /^(documentos-vencimiento|contratos-vencimiento|tramites-vencimiento|tramites-sin-respuesta|forestal-plazos|loth-plan-vencimiento|camaras-resumen|cacao-precio-diario|asistente-avisos|ia-salud)$/;

let db = null;
try {
  db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  await db.query("BEGIN READ ONLY");
} catch (e) {
  db = null;
  var errDb = String(e?.message ?? e).slice(0, 120);
}
const sel = async (sql, params = []) => {
  if (!db) return null;
  try {
    return (await db.query(sql, params)).rows;
  } catch (e) {
    return { error: String(e?.message ?? e).slice(0, 100) };
  }
};

for (const d of DESTRUCTIVOS) {
  const activo = actuales.find((c) => c.nombre === d.nombre);
  const [b, m] = [await sel(d.sql, [BLAS]), await sel(d.sql, [MAIN])];
  const n = (r) => (Array.isArray(r) ? r[0].n : null);
  const cuenta = db ? (n(b) === null || n(m) === null ? "conteo falló" : `Blas ${n(b)} · main ${n(m)}`) : "sin medir (sin base)";
  const afecta = (n(b) ?? 0) + (n(m) ?? 0) > 0;
  add(
    `Cron ${d.nombre}`,
    `${activo ? "ACTIVO" : "pausado"}: ${d.que} → ${cuenta}`,
    db && n(b) !== null ? !(activo && afecta) : activo ? false : null,
    `vercel.json + SELECT READ ONLY`
  );
}
const avisan = actuales.filter((c) => AVISAN.test(c.nombre));
add(
  "Crons que avisan (WhatsApp/correo/Telegram)",
  `${avisan.length} activos; cuántos mensajes saldrían de Blas: sin medir (no hay SELECT fiable). Madrugada (hora Lima <06:00): ` +
    (avisan.filter((c) => { const [mi, h] = c.schedule.split(" "); return /^\d+$/.test(h) && ((Number(h) - 5 + 24) % 24) < 6; }).map((c) => c.nombre).join(", ") || "ninguno"),
  null,
  "vercel.json (lista fija AVISAN en el script)"
);

/* ── 2. Migraciones pendientes ────────────────────────────────────────── */
{
  const r = await run("node", ["scripts/migraciones-cruce.mjs", "--verificar", "--json"]);
  let j = null;
  try { j = JSON.parse(r.out.slice(r.out.indexOf("{"))); } catch { /* cae a sin medir */ }
  if (j && Array.isArray(j.pendientes)) {
    add("Migraciones pendientes", `${j.pendientes.length} pendientes (${j.carpetas} carpetas, ${j.filas} filas en _prisma_migrations)`, j.pendientes.length === 0, "scripts/migraciones-cruce.mjs --verificar");
  } else {
    add("Migraciones pendientes", `sin medir (${r.out.replace(/\s+/g, " ").slice(0, 80)})`, null, "scripts/migraciones-cruce.mjs");
  }
}

/* ── 3. Valores de enum nuevos desde la base de producción ────────────── */
{
  const parseEnums = (txt) => {
    const o = {};
    for (const m of txt.matchAll(/^enum (\w+) \{([\s\S]*?)^\}/gm)) {
      o[m[1]] = m[2].split("\n").map((l) => l.replace(/\/\/.*$/, "").trim().split(/\s+/)[0]).filter((x) => /^\w+$/.test(x));
    }
    return o;
  };
  const sch = readFileSync("prisma/schema.prisma", "utf8");
  const viejo = await git("show", `${BASE_PROD}:prisma/schema.prisma`);
  if (!viejo.ok) {
    add("Enums nuevos usados en la base", "sin medir (no hay schema base)", null, `git show ${BASE_PROD}:prisma/schema.prisma`);
  } else {
    const A = parseEnums(viejo.out), B = parseEnums(sch);
    const nuevosV = [];
    for (const [e, vals] of Object.entries(B)) for (const v of vals) if (A[e] && !A[e].includes(v)) nuevosV.push([e, v]);
    for (const e of Object.keys(B)) if (!A[e]) for (const v of B[e]) nuevosV.push([e, v]);
    // modelos: tabla + campos de tipo enum
    const modelos = [];
    for (const m of sch.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
      const map = m[2].match(/@@map\("(\w+)"\)/);
      const campos = [...m[2].matchAll(/^\s+(\w+)\s+(\w+)(\[\])?\??\s/gm)].map((x) => ({ campo: x[1], tipo: x[2], lista: !!x[3] }));
      modelos.push({ tabla: map ? map[1] : m[1], campos });
    }
    const partes = [];
    let usado = false, fallo = false;
    for (const [e, v] of nuevosV) {
      if (!A[e]) continue; // enum entero nuevo: ningún cliente viejo lo lee todavía → sólo cuenta si hay columna
      let total = 0, midioAlgo = false;
      for (const mo of modelos) for (const c of mo.campos) {
        if (c.tipo !== e || c.lista || !/^\w+$/.test(mo.tabla) || !/^\w+$/.test(c.campo)) continue;
        const r = await sel(`select count(*)::int n from "${mo.tabla}" where "${c.campo}"::text = $1`, [v]);
        if (Array.isArray(r)) { total += r[0].n; midioAlgo = true; } else fallo = true;
      }
      if (midioAlgo && total > 0) usado = true;
      partes.push(`${e}.${v}=${midioAlgo ? total : "?"}`);
    }
    add(
      "Enums nuevos usados en la base (cliente del 16-07 no los conoce)",
      !db ? `sin medir (sin base: ${errDb})` : `${partes.length} valores nuevos; filas que los usan: ${partes.filter((p) => !p.endsWith("=0")).join(", ") || "ninguna"}`,
      !db ? null : fallo ? null : !usado,
      `diff de enums schema ${BASE_PROD}→HEAD + SELECT count (si hay filas, producción vieja ya falla al leerlas; el pase lo arregla)`
    );
  }
}
if (db) { await db.query("ROLLBACK").catch((e) => console.error("rollback:", e.message)); await db.end().catch((e) => console.error("end:", e.message)); }

/* ── 4. Builds, preview y backup (gh, sólo lectura) ───────────────────── */
const gh = await run("gh", ["--version"]);
if (!gh.ok) {
  add("Últimos builds (Vercel)", "sin medir (gh no disponible)", null, "gh api");
  add("Workflow backup-offsite", "sin medir (gh no disponible)", null, "gh run list");
} else {
  const remote = (await git("remote", "get-url", "origin")).out.trim();
  const repo = (remote.match(/github\.com[:/](.+?)(?:\.git)?$/) || [])[1];
  const rama = arg("--rama", (await git("rev-parse", "--abbrev-ref", "HEAD")).out.trim());
  if (!repo) {
    add("Últimos builds (Vercel)", "sin medir (origin no es GitHub)", null, "git remote");
  } else {
    const lista = await run("gh", ["api", `repos/${repo}/commits?sha=${encodeURIComponent(rama)}&per_page=40`, "--jq", ".[].sha"]);
    if (!lista.ok) {
      add("Últimos builds (Vercel)", `sin medir (${lista.out.replace(/\s+/g, " ")})`, null, "gh api commits");
    } else {
      const shas = lista.out.trim().split("\n").filter(Boolean);
      const res = await Promise.all(
        shas.map(async (sha) => {
          const r = await run("gh", ["api", `repos/${repo}/commits/${sha}/statuses?per_page=30`, "--jq", '[.[]|select(.context=="Vercel")]|sort_by(.created_at)|last|[.state,.created_at]|@tsv']);
          const [estado, cuando] = r.ok ? r.out.trim().split("\t") : [];
          return estado && estado !== "null" ? { sha: sha.slice(0, 7), estado, cuando } : null;
        })
      );
      const con = res.filter(Boolean).slice(0, 6);
      if (!con.length) add("Últimos builds (Vercel)", `sin medir (ningún commit de ${rama} con estado Vercel en GitHub)`, null, "gh api commits/<sha>/statuses");
      else {
        const fall = con.filter((x) => x.estado === "failure" || x.estado === "error").length;
        add(
          "Últimos builds (Vercel)",
          `${fall} de ${con.length} fallaron; el último ${con[0].sha} = ${con[0].estado} (${con[0].cuando}). Causa: leer el log (MCP Vercel / panel), el script no la ve`,
          con[0].estado === "success",
          `gh api repos/${repo}/commits/<sha>/statuses (contexto Vercel)`
        );
      }
    }
    const bk = await run("gh", ["run", "list", "--workflow", "backup-offsite.yml", "--limit", "20", "--json", "conclusion,createdAt"]);
    if (!bk.ok) add("Workflow backup-offsite", `sin medir (${bk.out.replace(/\s+/g, " ")})`, null, "gh run list");
    else {
      const rs = JSON.parse(bk.out);
      const ok = rs.filter((r) => r.conclusion === "success").length;
      add("Workflow backup-offsite", `${ok} éxitos en las últimas ${rs.length}; la última: ${rs[0]?.conclusion ?? "ninguna"} (${rs[0]?.createdAt ?? "-"})`, rs.length > 0 && rs[0].conclusion === "success", "gh run list --workflow backup-offsite.yml");
    }
    // Armado gratis en Actions (ci.yml → deploy-preview, `vercel build` + `--prebuilt`): sólo pide VERCEL_TOKEN.
    const sec = await run("gh", ["secret", "list", "--json", "name", "--jq", ".[].name"]);
    if (!sec.ok) add("Secreto VERCEL_TOKEN (armado en Actions)", `sin medir (${sec.out.replace(/\s+/g, " ")})`, null, "gh secret list");
    else {
      const nombres = sec.out.trim().split("\n").filter(Boolean);
      const tiene = nombres.includes("VERCEL_TOKEN");
      add("Secreto VERCEL_TOKEN (armado en Actions)", tiene ? `cargado (${nombres.length} secretos en el repo)` : `falta (el repo tiene ${nombres.length}: ${nombres.join(", ") || "ninguno"})`, tiene, "gh secret list (sólo nombres)");
    }
  }
}

/* ── 4b. Copia manual de la base (scripts/copia-base.sh) ───────────────── */
{
  const dir = `${process.env.HOME}/copias-base`;
  const copias = existsSync(dir) ? readdirSync(dir).filter((f) => /^bsm-base-.*\.dump$/.test(f)).sort().reverse() : [];
  if (!copias.length) add("Copia manual de la base (< 24 h)", "ninguna en ~/copias-base", false, "bash scripts/copia-base.sh");
  else {
    const m = /bsm-base-(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})\.dump/.exec(copias[0]);
    const horas = m ? (Date.now() - Date.parse(`${m[1]}T${m[2]}:${m[3]}:00-05:00`)) / 3600000 : NaN;
    const resumen = existsSync(`${dir}/${copias[0]}.txt`) ? readFileSync(`${dir}/${copias[0]}.txt`, "utf8") : "";
    const nFilas = /Filas dentro de la copia: (\d+)/.exec(resumen)?.[1] ?? "?";
    add("Copia manual de la base (< 24 h)", `${copias[0]} · hace ${Number.isFinite(horas) ? horas.toFixed(1) : "?"} h · ${nFilas} filas`, Number.isFinite(horas) && horas < 24, `~/copias-base/${copias[0]}.txt`);
  }
}

/* ── 5. Commits por delante de origin ─────────────────────────────────── */
{
  const r = await git("rev-list", "--left-right", "--count", "@{u}...HEAD");
  if (!r.ok) add("Commits locales sin subir", `sin medir (${r.out.replace(/\s+/g, " ").slice(0, 60)})`, null, "git rev-list @{u}...HEAD");
  else {
    const [det, del] = r.out.trim().split(/\s+/).map(Number);
    add("Commits locales sin subir a origin", `${del} por delante` + (det ? `, ${det} por detrás (divergió)` : ""), del === 0 && det === 0, "git rev-list --left-right --count @{u}...HEAD (último fetch local)");
  }
}

/* ── 6. Días desde el último DR drill ─────────────────────────────────── */
{
  const fechas = [];
  for (const dir of ["docs/security", "reports/dr-drills", "docs/runbooks"]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const m = /dr-?drill.*?(\d{4}-\d{2}-\d{2})/i.exec(f);
      if (m) fechas.push({ f: `${dir}/${f}`, d: m[1] });
    }
  }
  fechas.sort((a, b) => b.d.localeCompare(a.d));
  if (!fechas.length) add("Días desde el último DR drill", "sin medir (no hay archivo dr-drill-*-AAAA-MM-DD)", null, "docs/security, reports/dr-drills");
  else {
    const dias = Math.floor((Date.now() - Date.parse(fechas[0].d)) / 86400000);
    add("Días desde el último DR drill", `${dias} días (${fechas[0].d}; regla < ${DR_MAX_DIAS})`, dias < DR_MAX_DIAS, fechas[0].f);
  }
}

/* ── Salida ───────────────────────────────────────────────────────────── */
const marca = (ok) => (ok === true ? "OK" : ok === false ? "NO" : "sin medir");
console.log(`\nChequeo de despliegue — ${new Date().toISOString()} — base de producción ${BASE_PROD} — sólo lectura\n`);
console.log("| Freno | Hoy | OK/NO | Fuente |\n|---|---|---|---|");
for (const f of filas) console.log(`| ${f.freno} | ${f.hoy} | ${marca(f.ok)} | ${f.fuente} |`);
const no = filas.filter((f) => f.ok === false).length, sm = filas.filter((f) => f.ok === null).length;
console.log(`\n${no === 0 && sm === 0 ? "Sin frenos medidos." : `${no} freno(s) en NO, ${sm} sin medir.`} Lo que este script no ve: causa del build, secretos cargados en Vercel, mensajes exactos de WhatsApp, archivos de Supabase Storage (la copia no los trae).`);
process.exit(0);
