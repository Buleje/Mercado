#!/usr/bin/env node
/**
 * ADR-477 · Código único de troza: las trozas que entraron al Libro TH desde
 * una guía importada con su código CRUDO («1») pasan a «1-0001» — Trozado,
 * Despacho y los items de la guía (que guardan el de la guía en `codigoGuia`).
 *
 * Modos:
 *   ENSAYO (por defecto): sólo lee, en una tx READ ONLY por guía (nunca
 *     `SET SESSION`: el 6543 es el pooler de producción). Imprime el plan
 *     (línea · sección · de → a), frena si algo no cuadra y escribe el
 *     RESPALDO en `.claude/autonomo/respaldos/codigo-unico-<tenant>-<fecha>.json`
 *     con la huella total.
 *   --aplicar --respaldo <archivo> --huella <sha>: migra cada guía del
 *     respaldo con `ForestLothCodigoUnicoDB.migrarGuia` (una tx por guía; si la
 *     huella de la guía cambió desde el ensayo, aborta esa guía). Se niega si
 *     el ensayo no cuadró (`problemas` del respaldo) o si el respaldo no lo dice.
 *   --revertir <archivo>: restaura cada guía del respaldo, sólo si sus líneas
 *     tienen hoy el código que dejó la migración.
 *
 * Uso:
 *   node scripts/migrar-codigo-unico-adr-477.mjs --tenant main > /tmp/x.log 2>&1   # ensayo
 *   node scripts/migrar-codigo-unico-adr-477.mjs --tenant blas                       # ensayo en Blas (READ ONLY)
 *   node scripts/migrar-codigo-unico-adr-477.mjs --tenant main --aplicar --respaldo <f> --huella <sha>
 *   node scripts/migrar-codigo-unico-adr-477.mjs --tenant main --revertir <f>
 *
 * Blas (el tenant REAL) sólo se escribe con el OK de Brandon (P7 de K1).
 * Esperado en Blas: 1 guía (019-001-0000001), 22 trozado + 22 despacho + 22
 * items, 0 bloqueos; después `"trozaCode" ~ '-0001$'` = 44 y `/verificar/1`
 * sigue abriendo el árbol 1.
 */
import { config } from "dotenv";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(REPO, ".env.local"), quiet: true });

const BLAS = "cmpxiv6p4000bohvzwl6bnfpv";
const ALIAS = { blas: BLAS, main: "main" };
const ESPERADO_BLAS = { guias: 1, trozado: 22, despacho: 22, items: 22 };

const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const tenantArg = arg("--tenant");
if (!tenantArg) {
  console.error("✗ falta --tenant <id|blas|main>");
  process.exit(1);
}
const TENANT = ALIAS[tenantArg] ?? tenantArg;
const aplicar = process.argv.includes("--aplicar");
const revertir = arg("--revertir");
const soloGtf = arg("--gtf");
if (!process.env.DATABASE_URL) {
  console.error("✗ falta DATABASE_URL en .env.local");
  process.exit(1);
}

/** Corre la DB class real en un `tsx` hijo (receta de ADR-437: `server-only` a un archivo vacío). */
function enTsx(cuerpo, entrada) {
  const tmp = mkdtempSync(join(tmpdir(), "adr477-"));
  writeFileSync(join(tmp, "server-only.ts"), "export {};\n");
  writeFileSync(
    join(tmp, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        baseUrl: REPO,
        paths: { "@/*": ["./*"], "server-only": [join(tmp, "server-only.ts")] },
      },
    }),
  );
  const salida = join(tmp, "salida.json");
  writeFileSync(
    join(tmp, "hijo.mts"),
    `import { writeFileSync } from "node:fs";
const mod = await import(${JSON.stringify(pathToFileURL(join(REPO, "lib/db/forest-loth-codigo-unico.db.ts")).href)});
const DB = mod.ForestLothCodigoUnicoDB ?? mod.default?.ForestLothCodigoUnicoDB;
const E = JSON.parse(process.env.ADR477_ENTRADA ?? "{}");
const T = ${JSON.stringify(TENANT)};
const out = [];
try {
${cuerpo}
} catch (e) {
  out.push({ error: (e?.codigo ?? e?.code ?? "") + " " + (e?.message ?? String(e)) });
}
writeFileSync(${JSON.stringify(salida)}, JSON.stringify(out));
process.exit(0);
`,
  );
  const hijo = spawnSync("npx", ["tsx", "--tsconfig", join(tmp, "tsconfig.json"), join(tmp, "hijo.mts")], {
    cwd: REPO,
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, ADR477_ENTRADA: JSON.stringify(entrada ?? {}) },
    timeout: 600_000,
  });
  if (!existsSync(salida)) {
    console.error(`✗ el proceso hijo no dejó salida (status ${hijo.status}).`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(salida, "utf8"));
}

const fecha = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const huellaTotal = (guias) => createHash("sha256").update(guias.map((g) => `${g.gtf.id}:${g.huella}`).sort().join("|")).digest("hex");

// ── REVERTIR ────────────────────────────────────────────────────────────────
if (revertir) {
  const r = JSON.parse(readFileSync(resolve(revertir), "utf8"));
  if (r.tenantId !== TENANT) {
    console.error(`✗ el respaldo es del tenant ${r.tenantId}, no de ${TENANT}.`);
    process.exit(1);
  }
  console.log(`Revirtiendo ${r.guias.length} guía(s) de ${TENANT} desde ${revertir}…`);
  const res = enTsx(
    `for (const g of E.guias) {
  try { const x = await DB.revertirGuia(T, { respaldo: g }); out.push({ gtf: g.gtf.gtfNumber, ...x }); }
  catch (e) { out.push({ gtf: g.gtf.gtfNumber, error: (e?.codigo ?? "") + " " + (e?.message ?? String(e)) }); }
}`,
    /* Al revés de como se aplicaron: la última guía primero. */
    { guias: [...r.guias].reverse() },
  );
  for (const x of res) console.log(x.error ? `  ✗ ${x.gtf ?? ""}: ${x.error}` : `  ✓ ${x.gtf}: ${x.restauradas} línea(s) restauradas`);
  process.exit(res.some((x) => x.error) ? 1 : 0);
}

// ── APLICAR ─────────────────────────────────────────────────────────────────
if (aplicar) {
  const archivo = arg("--respaldo");
  const huella = arg("--huella");
  if (!archivo || !huella) {
    console.error("✗ --aplicar necesita --respaldo <archivo del ensayo> y --huella <sha total que imprimió el ensayo>.");
    process.exit(1);
  }
  const r = JSON.parse(readFileSync(resolve(archivo), "utf8"));
  if (r.tenantId !== TENANT) {
    console.error(`✗ el respaldo es del tenant ${r.tenantId}, no de ${TENANT}.`);
    process.exit(1);
  }
  if (r.huellaTotal !== huella || huellaTotal(r.guias) !== huella) {
    console.error("✗ la huella no es la del respaldo: no se escribió nada.");
    process.exit(1);
  }
  /* Los frenos del ensayo (totales de Blas, items fuera del plan, bloqueos) FRENAN:
     un respaldo que no cuadró, o de antes de que se guardaran, no se aplica. */
  if (!Array.isArray(r.problemas)) {
    console.error("✗ el respaldo no dice si el ensayo cuadró (es de antes de este freno): vuelve a ensayar.");
    process.exit(1);
  }
  if (r.problemas.length) {
    console.error(`✗ el ensayo NO cuadró: ${r.problemas.join(" · ")}. No se escribió nada.`);
    process.exit(1);
  }
  if (TENANT === BLAS) console.log("⚠ Blas es el tenant REAL: esto escribe (sólo con el OK de Brandon).");
  console.log(`Aplicando ${r.guias.length} guía(s) en ${TENANT}…`);
  const res = enTsx(
    `for (const g of E.guias) {
  try { const x = await DB.migrarGuia(T, { gtfId: g.gtf.id, huella: g.huella }); out.push({ gtf: g.gtf.gtfNumber, ...x }); }
  catch (e) { out.push({ gtf: g.gtf.gtfNumber, error: (e?.codigo ?? "") + " " + (e?.message ?? String(e)) }); }
}`,
    { guias: r.guias.map((g) => ({ gtf: g.gtf, huella: g.huella })) },
  );
  for (const x of res) console.log(x.error ? `  ✗ ${x.gtf ?? ""}: ${x.error}` : `  ✓ ${x.gtf}: ${x.cambiadas} línea(s), ${x.items} item(s), ${x.talas} tala(s)`);
  process.exit(res.some((x) => x.error) ? 1 : 0);
}

// ── ENSAYO ──────────────────────────────────────────────────────────────────
console.log(`Ensayo (sólo lee) · tenant ${TENANT}${TENANT === BLAS ? " (Blas, REAL)" : ""}\n`);
const res = enTsx(
  `const guias = E.gtf ? [{ gtfId: E.gtf }] : await DB.guiasAMigrar(T);
for (const g of guias) out.push(await DB.plan(T, g.gtfId));`,
  { gtf: soloGtf ?? null },
);
const error = res.find((x) => x.error);
if (error) {
  console.error(`✗ ${error.error}`);
  process.exit(1);
}
const problemas = [];
for (const p of res) {
  console.log(`── GTF ${p.gtfNumber} (${p.gtfId}) · plan ${p.planId ?? "—"} · huella ${p.huella}`);
  for (const c of p.cambios) console.log(`   #${String(c.lineNo).padStart(4)} ${c.section.padEnd(15)} ${c.de} → ${c.a}`);
  console.log(`   items ${p.items.length} · talas ${p.talas.length} · bloqueos ${p.bloqueos.length} · saltadas ${p.saltadas.length}`);
  for (const b of p.bloqueos) console.log(`   ✗ ${b}`);
  for (const s of p.saltadas.slice(0, 10)) console.log(`   · ${s}`);
  if (p.bloqueos.length) problemas.push(`GTF ${p.gtfNumber}: ${p.bloqueos.length} bloqueo(s)`);
  const ids = new Set(p.cambios.map((c) => c.lineaId));
  const sinLinea = p.items.filter((i) => i.trozadoId && !ids.has(i.trozadoId));
  if (sinLinea.length) problemas.push(`GTF ${p.gtfNumber}: ${sinLinea.length} item(s) con trozadoId fuera del plan`);
}
const tot = {
  guias: res.length,
  trozado: res.reduce((a, p) => a + p.cambios.filter((c) => c.section === "trozado").length, 0),
  despacho: res.reduce((a, p) => a + p.cambios.filter((c) => c.section === "despacho_troza").length, 0),
  items: res.reduce((a, p) => a + p.items.length, 0),
  bloqueos: res.reduce((a, p) => a + p.bloqueos.length, 0),
};
console.log(`\nTotales: ${tot.guias} guía(s) · ${tot.trozado} trozado + ${tot.despacho} despacho + ${tot.items} items · ${tot.bloqueos} bloqueo(s)`);
if (TENANT === BLAS) {
  for (const k of Object.keys(ESPERADO_BLAS)) if (tot[k] !== ESPERADO_BLAS[k]) problemas.push(`${k}: ${tot[k]} (se esperaba ${ESPERADO_BLAS[k]})`);
}
if (!res.length) {
  console.log("Nada que migrar.");
  process.exit(0);
}
const guias = res.map((p) => ({ tenantId: TENANT, fecha, ...p.respaldo }));
const respaldo = { tenantId: TENANT, fecha, adr: "ADR-477", huellaTotal: huellaTotal(guias), totales: tot, problemas, guias };
const dir = join(REPO, ".claude/autonomo/respaldos");
mkdirSync(dir, { recursive: true });
const ruta = join(dir, `codigo-unico-${tenantArg}-${fecha}.json`);
writeFileSync(ruta, JSON.stringify(respaldo, null, 2));
console.log(`Respaldo: ${ruta}`);
console.log(`Huella total: ${respaldo.huellaTotal}`);
if (problemas.length) {
  console.log(`\n✗ NO cuadra: ${problemas.join(" · ")}. No apliques.`);
  process.exit(1);
}
console.log(`\n✓ Cuadra. Para aplicar: --tenant ${tenantArg} --aplicar --respaldo ${ruta} --huella ${respaldo.huellaTotal}`);
process.exit(0);
