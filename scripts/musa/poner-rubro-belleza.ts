/**
 * Pone a Musa (tenant `cmv1v4b8e0002rlvz6ibrullo`) en el rubro «belleza»
 * (ADR-509, Brandon 2026-10-20 eligió «Rubro Belleza»). Hasta hoy figuraba
 * como «bodega» porque el enum `Industry` no tenía su rubro.
 *
 * IDEMPOTENTE: si ya es «belleza» no escribe (2.ª corrida = 0 cambios). Todo
 * por `TenantsDB.cambiarRubro` (nada de prisma ni SQL de escritura acá).
 * Guarda el rubro de antes en `.claude/autonomo/respaldos/`. Volver atrás =
 * correrlo con `--volver` (pone el rubro del respaldo más nuevo).
 *
 * ORDEN OBLIGATORIO — un valor de enum nuevo rompe a los clientes de Prisma
 * viejos: el runtime tira «Value 'belleza' not found in enum 'Industry'» al
 * LEER la fila de Musa (y cualquier listado de todos los negocios que traiga
 * `industry`, p. ej. el resumen de cobros del superadmin). Por eso:
 *   1. el dev server se reinicia DESPUÉS del `npx prisma generate` (el
 *      cliente vive en `globalThis` y sobrevive al HMR) — el script lo revisa
 *      solo y no escribe si el next-server arrancó antes del generate;
 *   2. producción (misma base) tiene que estar desplegada con el cliente
 *      nuevo — eso el script no lo puede ver: pide `--prod-al-dia`.
 *
 * Uso (desde la raíz del repo):
 *   npx tsx -r ./scripts/musa/_preload.cjs -r dotenv/config \
 *     scripts/musa/poner-rubro-belleza.ts dotenv_config_path=.env.local [--simulacro] [--prod-al-dia] [--volver]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { TenantsDB } from "@/lib/db/tenants.db";
import type { Industry } from "@/lib/generated/prisma/client";

const TENANT = "cmv1v4b8e0002rlvz6ibrullo";
const SLUG = "musa";
const SIMULACRO = process.argv.includes("--simulacro");
const PROD_AL_DIA = process.argv.includes("--prod-al-dia");
const VOLVER = process.argv.includes("--volver");
const DIR_RESPALDOS = path.resolve(process.cwd(), ".claude/autonomo/respaldos");
const PREFIJO_RESPALDO = "musa-rubro-belleza-";

/** Next-servers vivos que arrancaron ANTES del último `prisma generate` (siguen con el enum viejo). */
function devServersViejos(): string[] {
  const generado = fs.statSync(path.resolve(process.cwd(), "lib/generated/prisma/enums.ts")).mtimeMs;
  let pids: string[] = [];
  try {
    pids = execFileSync("pgrep", ["-f", "next-server"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  } catch {
    return []; // pgrep sale con 1 si no hay ninguno
  }
  return pids.filter((pid) => {
    const inicio = execFileSync("ps", ["-o", "lstart=", "-p", pid], { encoding: "utf8" }).trim();
    return inicio && new Date(inicio).getTime() < generado;
  });
}

function rubroDelUltimoRespaldo(): Industry | null {
  if (!fs.existsSync(DIR_RESPALDOS)) return null;
  const ultimo = fs.readdirSync(DIR_RESPALDOS).filter((f) => f.startsWith(PREFIJO_RESPALDO)).sort().pop();
  if (!ultimo) return null;
  const r = JSON.parse(fs.readFileSync(path.join(DIR_RESPALDOS, ultimo), "utf8")) as { antes?: Industry };
  return r.antes ?? null;
}

async function main() {
  const destino: Industry | null = VOLVER ? rubroDelUltimoRespaldo() : "belleza";
  if (!destino) throw new Error("--volver sin respaldo previo en .claude/autonomo/respaldos/");
  console.log(`${SIMULACRO ? "SIMULACRO (no escribe)" : "CAMBIO REAL"} · tenant ${TENANT} (${SLUG}) → ${destino}`);

  const viejos = devServersViejos();
  if (viejos.length) console.log(`⚠ next-server ${viejos.join(", ")} arrancó antes del prisma generate: reinícialo primero.`);
  if (!PROD_AL_DIA && destino === "belleza") console.log("⚠ falta --prod-al-dia: producción comparte la base y su cliente viejo no conoce «belleza».");
  const bloqueado = destino === "belleza" && (viejos.length > 0 || !PROD_AL_DIA);

  if (SIMULACRO || bloqueado) {
    // Lectura con el cliente nuevo (este proceso): conoce «belleza».
    const ahora = await TenantsDB.publicoPorSlugOId(TENANT);
    if (!ahora) throw new Error(`no existe el tenant ${TENANT}`);
    const cambiaria = ahora.industry !== destino;
    console.log(`rubro hoy: ${ahora.industry} · ${cambiaria ? `cambiaría a ${destino}` : "ya está, 0 cambios"}`);
    if (bloqueado && !SIMULACRO) console.log("NO se escribió nada.");
    process.exit(bloqueado && !SIMULACRO ? 2 : 0);
  }

  const r = await TenantsDB.cambiarRubro(TENANT, destino);
  if (!r) throw new Error(`no existe el tenant ${TENANT}`);
  if (!r.cambio) {
    console.log(`rubro hoy: ${r.antes} · ya está, 0 cambios`);
    process.exit(0);
  }
  fs.mkdirSync(DIR_RESPALDOS, { recursive: true });
  const sello = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
  const archivo = path.join(DIR_RESPALDOS, `${PREFIJO_RESPALDO}${sello}-antes.json`);
  if (!VOLVER) fs.writeFileSync(archivo, JSON.stringify({ tenant: TENANT, cuando: new Date().toISOString(), antes: r.antes }, null, 2));
  console.log(`rubro: ${r.antes} → ${r.despues}${VOLVER ? "" : ` · respaldo: ${archivo}`}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("FALLÓ:", e);
  process.exit(1);
});
