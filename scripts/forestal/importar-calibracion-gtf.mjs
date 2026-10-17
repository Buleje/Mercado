#!/usr/bin/env node
/**
 * Importa una calibración del talonario de la GTF (JSON medido con regla sobre
 * el papel: x, y desde el recuadro impreso; y = base del texto) como una FORMA
 * nueva del talonario de la matricial, elegida sola con la guía de su dueño
 * (permiso / titular). Brandon 17-10: «ahí está la calibración de GTF, con
 * eso calibra el modal de imprimir talonario».
 *
 * La conversión es la misma del botón «Cargar calibración» de Posiciones
 * (`aplicarCalibracion` en lib/forestal/gtf-matricial-calibracion.ts): se
 * parte de una forma existente (letras, alineación, lo que no se mide) y se
 * pone cada valor medido en su lugar. La hoja «lista» se copia tal cual.
 *
 * Modos:
 *   ENSAYO (por defecto): sólo lee. Imprime el emparejado por N° del
 *     formulario, lo que no tiene par, dónde supone el recuadro en el papel y
 *     —con --gtf-id— qué forma elegiría hoy esa guía y cuál después.
 *   --aplicar: respalda el KV ENTERO en .claude/autonomo/respaldos/ y crea la
 *     forma con `ForestGtfMatricialDB.crearForma` (bloqueo por clave, nunca
 *     SQL a mano); después relee y comprueba que las demás formas y las
 *     impresoras quedaron iguales. Audita `gtf_talonario_forma_crear`.
 *
 * Uso:
 *   node scripts/forestal/importar-calibracion-gtf.mjs --tenant main \
 *     --json ~/Escritorio/files/Calibracion_GTF_Aguachini.json \
 *     --desde-tenant blas --desde-forma f-1cd8ae122f \
 *     --permiso "19-SEC/REG-PLT-2026-117" \
 *     --nombre "19-SEC/REG-PLT-2026-117 · CN Séptimo Unidos Sta Fe Aguachini" \
 *     [--titular "<nombre>"] [--plan <planId>] [--gtf-id <id>] \
 *     [--recuadro-x 10.5 --recuadro-y 15.25] [--papel-ancho 216 --papel-alto 330] \
 *     [--aplicar]
 *
 * Sin --titular la forma vale para TODA guía de ese permiso (la de Blas,
 * 19-000004, no tiene titular). El nombre admite 60 letras.
 */
import { config } from "dotenv";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
config({ path: join(REPO, ".env.local"), quiet: true });

const ALIAS = { blas: "cmpxiv6p4000bohvzwl6bnfpv", main: "main" };
const NOMBRE_MAX = 60;

const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const num = (n) => {
  const v = arg(n);
  if (v === undefined) return undefined;
  const x = Number(v.replace(",", "."));
  if (!Number.isFinite(x)) {
    console.error(`✗ ${n} no es un número: «${v}»`);
    process.exit(1);
  }
  return x;
};
const falta = (m) => {
  console.error(`✗ ${m}`);
  process.exit(1);
};

const tenantArg = arg("--tenant");
const jsonArg = arg("--json");
if (!tenantArg || !jsonArg) falta("uso: --tenant <id|blas|main> --json <archivo> [--desde-forma <id>] [--permiso …] [--aplicar]");
if (!process.env.DATABASE_URL) falta("falta DATABASE_URL en .env.local");
const TENANT = ALIAS[tenantArg] ?? tenantArg;
const desdeTenantArg = arg("--desde-tenant");
const nombre = arg("--nombre") ?? null;
if (nombre && nombre.length > NOMBRE_MAX) falta(`el nombre tiene ${nombre.length} letras; el tope es ${NOMBRE_MAX}`);
const recuadro = Object.fromEntries(
  Object.entries({ x: num("--recuadro-x"), y: num("--recuadro-y"), anchoMm: num("--papel-ancho"), altoMm: num("--papel-alto") }).filter(([, v]) => v !== undefined),
);
const aplicar = process.argv.includes("--aplicar");
const fecha = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const respaldo = join(REPO, ".claude/autonomo/respaldos", `gtf-talonario-${tenantArg}-${fecha}.json`);

const entrada = {
  archivo: jsonArg.split("/").pop(),
  json: JSON.parse(readFileSync(resolve(jsonArg), "utf8")),
  desdeTenant: desdeTenantArg ? (ALIAS[desdeTenantArg] ?? desdeTenantArg) : null,
  desdeForma: arg("--desde-forma") ?? "empresa",
  dueno: { titular: arg("--titular") ?? null, permiso: arg("--permiso") ?? null, planId: arg("--plan") ?? null },
  nombre,
  recuadro: Object.keys(recuadro).length ? recuadro : null,
  gtfId: arg("--gtf-id") ?? null,
  aplicar,
  respaldo,
  usuario: arg("--usuario") ?? "importar-calibracion",
};

/** Corre los módulos reales en un `tsx` hijo (receta de ADR-437: `server-only` a un archivo vacío). */
function enTsx(cuerpo) {
  const tmp = mkdtempSync(join(tmpdir(), "calib-gtf-"));
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
  const mod = (p) => JSON.stringify(pathToFileURL(join(REPO, p)).href);
  writeFileSync(
    join(tmp, "hijo.mts"),
    `import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
const de = (m, n) => m[n] ?? m.default?.[n];
const S = await import(${mod("lib/db/platform-settings.db.ts")});
const D = await import(${mod("lib/db/forest-gtf-matricial.db.ts")});
const F = await import(${mod("lib/forestal/gtf-matricial-formas.ts")});
const Ti = await import(${mod("lib/forestal/gtf-matricial-titulares.ts")});
const C = await import(${mod("lib/forestal/gtf-matricial-calibracion.ts")});
const A = await import(${mod("lib/forestal/ctp-audit.ts")});
const PS = de(S, "PlatformSettingsDB"), DB = de(D, "ForestGtfMatricialDB"), clave = de(D, "claveTalonario");
const normalizar = de(Ti, "normalizarAlmacen");
const E = JSON.parse(process.env.CALIB_ENTRADA ?? "{}");
const T = ${JSON.stringify(TENANT)};
const out = {};
try {
${cuerpo}
} catch (e) {
  out.error = (e?.codigo ?? e?.code ?? "") + " " + (e?.message ?? String(e));
}
writeFileSync(${JSON.stringify(salida)}, JSON.stringify(out));
process.exit(0);
`,
  );
  const hijo = spawnSync("npx", ["tsx", "--tsconfig", join(tmp, "tsconfig.json"), join(tmp, "hijo.mts")], {
    cwd: REPO,
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, CALIB_ENTRADA: JSON.stringify(entrada) },
    timeout: 300_000,
  });
  if (!existsSync(salida)) falta(`el proceso hijo no dejó salida (status ${hijo.status}).`);
  return JSON.parse(readFileSync(salida, "utf8"));
}

const r = enTsx(`
const crudo = await PS.getFresco(clave(T));
const alm = normalizar(crudo);
const almDe = E.desdeTenant && E.desdeTenant !== T ? normalizar(await PS.getFresco(clave(E.desdeTenant))) : alm;
const base = de(F, "disposicionDe")(almDe, E.desdeForma);
if (!base) throw new Error("no existe la forma " + E.desdeForma + " en " + (E.desdeTenant ?? T));
const cal = de(C, "calibracionSchema").safeParse(E.json);
if (!cal.success) throw new Error("el JSON no es una calibración: " + cal.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; "));
const res = de(C, "aplicarCalibracion")(base.guia, cal.data, E.recuadro ?? undefined);
const datos = { nombre: E.nombre, guia: res.hoja, lista: base.lista };
const firma = { en: new Date().toISOString(), por: E.usuario };
const sim = de(F, "crearForma")(alm, E.dueno, datos, firma, "f-0000000000");
out.pares = res.pares; out.sinPar = res.sinPar; out.recuadro = res.recuadro;
out.antes = Object.values(alm.formas).map((f) => ({ id: f.id, nombre: f.nombre }));
out.ensayo = sim.ok ? { nombre: sim.forma.nombre } : { error: sim.error };
const guia = sim.ok ? sim.forma.guia : null;
out.muestra = guia ? Object.fromEntries(["2", "3", "6", "12"].map((id) => [id, guia.campos[id]]).filter(([, c]) => c)) : null;
out.tabla = guia ? { y: guia.tabla.y, altoFilaMm: guia.tabla.altoFilaMm, maxFilas: guia.tabla.maxFilas, letraPt: guia.tabla.letraPt } : null;
out.hojaPapel = guia ? { anchoMm: guia.anchoMm, altoMm: guia.altoMm, marco: guia.marco } : null;
if (E.gtfId) {
  const d = await DB.duenoDeLaGuia(T, E.gtfId);
  if (!d) throw new Error("la guía " + E.gtfId + " no existe en " + T);
  const elige = (a) => { const x = de(F, "resolverForma")(a, d); return x?.forma ? x.forma.nombre + " (" + x.coincide + ")" : "ninguna: " + (x?.origen ?? "—"); };
  out.guia = { dueno: d, hoy: elige(alm), despues: sim.ok ? elige(sim.almacen) : null };
}
if (E.aplicar && sim.ok) {
  mkdirSync(dirname(E.respaldo), { recursive: true });
  writeFileSync(E.respaldo, JSON.stringify({ tenantId: T, clave: clave(T), en: firma.en, valor: crudo }, null, 1));
  const w = await DB.crearForma(T, E.dueno, datos, E.usuario);
  if (!w.ok) throw new Error("crearForma: " + w.error);
  await de(A, "auditCtpEsperando")({ tenantId: T, action: "gtf_talonario_forma_crear", entity: "ForestGtfTalonario", entityId: w.forma.id,
    detail: "Forma del talonario «" + w.forma.nombre + "» creada con la calibración " + E.archivo, user: E.usuario });
  const ahora = normalizar(await PS.getFresco(clave(T)));
  const ids = (a) => Object.keys(a.formas);
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  out.aplicado = {
    id: w.forma.id, nombre: w.forma.nombre,
    nuevas: ids(ahora).filter((k) => !alm.formas[k]),
    borradas: ids(alm).filter((k) => !ahora.formas[k]),
    cambiadas: ids(alm).filter((k) => ahora.formas[k] && !igual(alm.formas[k], ahora.formas[k])),
    perfilesIguales: igual(alm.perfiles, ahora.perfiles),
  };
}
`);

if (r.error) falta(r.error);
const rec = r.recuadro;
console.log(`Tenant ${TENANT} · base «${entrada.desdeForma}»${entrada.desdeTenant ? ` de ${entrada.desdeTenant}` : ""} · ${aplicar ? "APLICAR" : "ENSAYO (sólo lee)"}`);
console.log(`Papel ${rec.papel ?? "de la hoja"} ${rec.anchoMm} × ${rec.altoMm} mm · recuadro a ${rec.x} / ${rec.y} mm del borde izquierdo / de arriba`);
console.log(`\nEmparejado (${r.pares.length}):`);
for (const p of r.pares) console.log(`  ${p.clave.padEnd(22)} ${p.tipo.padEnd(8)} → ${p.ids.join(" + ")}`);
console.log(`\nSin par (${r.sinPar.length}):`);
for (const s of r.sinPar) console.log(`  ${s.clave.padEnd(22)} ${s.motivo}`);
console.log(`\nMuestra: ${JSON.stringify(r.muestra)}\nTabla: ${JSON.stringify(r.tabla)}\nHoja: ${JSON.stringify(r.hojaPapel)}`);
console.log(`\nFormas hoy (${r.antes.length}): ${r.antes.map((f) => `${f.id} «${f.nombre}»`).join(" · ")}`);
console.log(`Forma nueva: ${r.ensayo.error ? `✗ ${r.ensayo.error}` : `«${r.ensayo.nombre}»`}`);
if (r.guia) console.log(`Guía ${entrada.gtfId}: dueño ${JSON.stringify(r.guia.dueno)} · hoy elige ${r.guia.hoy} · después ${r.guia.despues}`);
if (r.aplicado) {
  const a = r.aplicado;
  const limpio = a.nuevas.length === 1 && !a.borradas.length && !a.cambiadas.length && a.perfilesIguales;
  console.log(`\n${limpio ? "✓" : "✗"} creada ${a.id} «${a.nombre}» · nuevas ${a.nuevas.join(",")} · borradas ${a.borradas.length} · cambiadas ${a.cambiadas.length} · impresoras iguales ${a.perfilesIguales}`);
  console.log(`  Respaldo: ${respaldo}`);
  if (!limpio) process.exit(2);
} else if (!aplicar) {
  console.log("\n(ensayo: agrega --aplicar para crearla)");
}
