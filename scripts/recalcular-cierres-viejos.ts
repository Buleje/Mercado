/**
 * Recalcula los resúmenes viejos del cron (`DailySummary`, 07-04 → 18-10) con
 * el cuadre de las cajas cerradas de cada día.
 *
 * Por qué (19-10, Brandon: «guardo un respaldo y los recalculo con el cuadre de
 * las cajas de cada día»): el cron miraba la caja ABIERTA y guardó esperado 0,
 * contado vacío y diferencia 0 en 1 496 filas de 13 negocios. Desde 04b4028c6
 * guarda bien hacia adelante; esto arregla lo de atrás con la MISMA cuenta
 * (`cuadreDeCajas` + `camposDeCajaDelResumen`, vía `CajaPorDiaDB.cuadresDelRango`).
 *
 * Qué toca: SÓLO `efectivoEsperado`, `efectivoContado` y `diferenciaCaja` de
 * filas `creadoPor = "cron"` que siguen en 0 / vacío / 0, de días ya terminados
 * (hoy en Lima no). Un día sin cajas contadas queda como lo deja el cron (0 /
 * vacío / 0): no cambia. Cada UPDATE compara-y-cambia en el WHERE con
 * `tenantId` (lotes de 50, sin transacción entre lotes): correrlo dos veces no
 * cambia nada la segunda.
 *
 * Uso (desde el repo; la base es la de PRODUCCIÓN):
 *   npx tsx --env-file=.env.local scripts/recalcular-cierres-viejos.ts                     # seco: no escribe
 *   npx tsx --env-file=.env.local scripts/recalcular-cierres-viejos.ts --respaldo <f.json> # seco + respaldo (no pisa uno existente)
 *   npx tsx --env-file=.env.local scripts/recalcular-cierres-viejos.ts --aplicar --respaldo <f.json>
 *   npx tsx --env-file=.env.local scripts/recalcular-cierres-viejos.ts --revertir <f.json> # vuelve al «antes» del respaldo
 *   … --tenant <id|slug>   limita a un negocio (en todos los modos)
 * `--aplicar` exige el respaldo de ESTE plan: misma cantidad de filas, mismas
 * filas y mismos valores (huella). Si algo cambió desde el respaldo, no escribe.
 */
import Module from "node:module";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CambioDelCierre } from "@/lib/caja/recalcular-cierres-viejos";

/* Las DB classes empiezan con `import "server-only"`, que fuera de Next no
   existe: se resuelve al vacío de Next antes de cargarlas (por eso `import()`). */
const M = Module as unknown as { _resolveFilename: (pedido: string, ...resto: unknown[]) => string };
const resolverOriginal = M._resolveFilename;
M._resolveFilename = function (pedido: string, ...resto: unknown[]) {
  if (pedido === "server-only") return path.join(process.cwd(), "node_modules/next/dist/compiled/server-only/empty.js");
  return resolverOriginal.call(this, pedido, ...resto);
};

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const APLICAR = process.argv.includes("--aplicar");
const RESPALDO = arg("--respaldo");
const REVERTIR = arg("--revertir");
const SOLO = arg("--tenant");

const r2 = (v: number) => Math.round(v * 100) / 100;
const S = (v: number | null) => (v == null ? "vacío" : v.toFixed(2));
const caja = (c: CambioDelCierre["antes"]) => `${S(c.efectivoEsperado)} / ${S(c.efectivoContado)} / ${S(c.diferenciaCaja)}`;

/** Huella del plan: qué filas y con qué valores (las de un respaldo viejo no coinciden). */
const huella = (cambios: readonly CambioDelCierre[]) =>
  createHash("sha256")
    .update(JSON.stringify([...cambios].sort((a, b) => a.id.localeCompare(b.id)).map((c) => [c.id, c.tenantId, c.antes, c.despues])))
    .digest("hex")
    .slice(0, 16);

interface Negocio {
  tenantId: string;
  slug: string;
  viejas: number;
  cambios: CambioDelCierre[];
}

interface Respaldo {
  generado: string;
  hoy: string;
  qué: string;
  total: number;
  huella: string;
  porNegocio: Array<{ tenantId: string; slug: string; filas: number; sumaDiferencias: number }>;
  filas: Array<CambioDelCierre & { fecha: string }>;
}

async function main() {
  const { DailySummaryDB } = await import("@/lib/db/daily-summary.db");
  const { CajaPorDiaDB } = await import("@/lib/db/caja-por-dia.db");
  const { cambioDelCierreViejo, cuadreDe, diaDelResumen } = await import("@/lib/caja/recalcular-cierres-viejos");
  const { limaDateKey } = await import("@/lib/utils");

  const hoy = limaDateKey(new Date());
  const antesDe = new Date(`${hoy}T00:00:00.000Z`);

  /* ── Revertir: vuelve al «antes» del respaldo las filas que siguen en su «después». */
  if (REVERTIR) {
    const r = JSON.parse(readFileSync(REVERTIR, "utf8")) as Respaldo;
    const porTenant = new Map<string, Respaldo["filas"]>();
    // `--tenant` acepta el slug o el id: el respaldo trae los dos en `porNegocio`.
    const soloId = SOLO ? (r.porNegocio.find((n) => n.slug === SOLO || n.tenantId === SOLO)?.tenantId ?? SOLO) : null;
    for (const f of r.filas) if (!soloId || f.tenantId === soloId) porTenant.set(f.tenantId, [...(porTenant.get(f.tenantId) ?? []), f]);
    let total = 0;
    for (const [tenantId, filas] of porTenant) {
      const n = await DailySummaryDB.cambiarCajaDelCron(tenantId, filas.map((f) => ({ id: f.id, antes: f.despues, despues: f.antes })));
      console.log(`  ${tenantId}: ${n} de ${filas.length} vueltas al «antes»`);
      total += n;
    }
    console.log(`✓ revertidas ${total} de ${r.filas.length} filas del respaldo ${REVERTIR}`);
    return;
  }

  /* ── El plan: por negocio, las filas viejas y lo que cambiaría cada una. */
  const negocios: Negocio[] = [];
  for (const n of await DailySummaryDB.negociosConCronSinCuadre(antesDe)) {
    if (SOLO && n.tenantId !== SOLO && n.slug !== SOLO) continue;
    const viejas = await DailySummaryDB.cronSinCuadre(n.tenantId, antesDe);
    if (viejas.length === 0) continue;
    const cuadres = await CajaPorDiaDB.cuadresDelRango(n.tenantId, diaDelResumen(viejas[0].fecha), diaDelResumen(viejas[viejas.length - 1].fecha));
    const cambios = viejas
      .map((f) => cambioDelCierreViejo(f, cuadreDe(cuadres, diaDelResumen(f.fecha)), hoy))
      .filter((c): c is CambioDelCierre => c !== null);
    negocios.push({ ...n, viejas: viejas.length, cambios });
  }
  const todos = negocios.flatMap((n) => n.cambios);
  const plan = huella(todos);

  console.log(`Hoy (Lima): ${hoy} — sólo días anteriores.`);
  console.log(`Negocio                                             | viejas | cambian | Σ esperado | Σ contado | Σ diferencia`);
  for (const n of negocios) {
    const suma = (k: "efectivoEsperado" | "efectivoContado" | "diferenciaCaja") => r2(n.cambios.reduce((s, c) => s + (c.despues[k] ?? 0), 0));
    console.log(
      `${n.slug.padEnd(51)} | ${String(n.viejas).padStart(6)} | ${String(n.cambios.length).padStart(7)} | ${suma("efectivoEsperado").toFixed(2).padStart(10)} | ${suma("efectivoContado").toFixed(2).padStart(9)} | ${suma("diferenciaCaja").toFixed(2).padStart(12)}`,
    );
  }
  const sumaDif = r2(todos.reduce((s, c) => s + c.despues.diferenciaCaja, 0));
  console.log(`TOTAL: ${negocios.reduce((s, n) => s + n.viejas, 0)} viejas, ${todos.length} cambian, Σ diferencia ${sumaDif.toFixed(2)} · huella ${plan}`);

  /* 10 ejemplos repartidos entre negocios (el más nuevo de cada uno primero). */
  const colas = negocios.filter((n) => n.cambios.length > 0).map((n) => ({ slug: n.slug, cola: [...n.cambios].reverse() }));
  const ejemplos: Array<{ slug: string; c: CambioDelCierre }> = [];
  for (let i = 0; ejemplos.length < 10 && colas.some((x) => x.cola.length > i); i++) {
    for (const { slug, cola } of colas) if (cola[i] && ejemplos.length < 10) ejemplos.push({ slug, c: cola[i] });
  }
  console.log(`\nEjemplos (esperado / contado / diferencia):`);
  for (const { slug, c } of ejemplos) {
    console.log(`  ${slug.slice(0, 28).padEnd(28)} ${c.dia} · ${c.cajas} cajas (${c.sinConteo} sin conteo) · ${caja(c.antes)} → ${caja(c.despues)}`);
  }

  /* ── Respaldo (seco): las filas que tocaría con sus valores de antes. Nunca pisa uno existente. */
  if (RESPALDO && !APLICAR) {
    if (existsSync(RESPALDO)) {
      console.error(`✗ ${RESPALDO} ya existe: no se pisa un respaldo (podría ser el «antes» de una corrida aplicada).`);
      process.exitCode = 1;
      return;
    }
    const filaDe = (c: CambioDelCierre) => ({ ...c, fecha: `${c.dia}T00:00:00.000Z` });
    const respaldo: Respaldo = {
      generado: new Date().toISOString(),
      hoy,
      qué: "DailySummary del cron sin cuadre → cuadre de las cajas cerradas del día (efectivoEsperado, efectivoContado, diferenciaCaja)",
      total: todos.length,
      huella: plan,
      porNegocio: negocios.map((n) => ({
        tenantId: n.tenantId,
        slug: n.slug,
        filas: n.cambios.length,
        sumaDiferencias: r2(n.cambios.reduce((s, c) => s + c.despues.diferenciaCaja, 0)),
      })),
      filas: todos.map(filaDe),
    };
    mkdirSync(path.dirname(RESPALDO), { recursive: true });
    writeFileSync(RESPALDO, JSON.stringify(respaldo, null, 2));
    console.log(`\n✓ respaldo: ${RESPALDO} (${todos.length} filas, huella ${plan})`);
    console.log(`  Para aplicar: npx tsx --env-file=.env.local scripts/recalcular-cierres-viejos.ts --aplicar --respaldo ${RESPALDO}${SOLO ? ` --tenant ${SOLO}` : ""}`);
    return;
  }

  if (!APLICAR) {
    console.log(`\n(seco: no se escribió nada; para guardar el respaldo: --respaldo <archivo>)`);
    return;
  }

  /* ── Aplicar: sólo con el respaldo de ESTE plan. */
  if (!RESPALDO || !existsSync(RESPALDO)) {
    console.error(`✗ --aplicar necesita --respaldo <archivo> ya escrito (corré primero sólo --respaldo).`);
    process.exitCode = 1;
    return;
  }
  const r = JSON.parse(readFileSync(RESPALDO, "utf8")) as Respaldo;
  if (r.filas.length !== todos.length || r.huella !== plan) {
    console.error(`✗ el respaldo no es de este plan (respaldo ${r.filas.length} filas, huella ${r.huella}; hoy ${todos.length}, ${plan}). No se escribió nada: sacá un respaldo nuevo.`);
    process.exitCode = 1;
    return;
  }
  let escritas = 0;
  for (const n of negocios) {
    if (n.cambios.length === 0) continue;
    const k = await DailySummaryDB.cambiarCajaDelCron(n.tenantId, n.cambios);
    console.log(`  ${n.slug}: ${k} de ${n.cambios.length}`);
    escritas += k;
  }
  console.log(`✓ aplicadas ${escritas} de ${todos.length} filas.`);
}

main()
  .catch((err: unknown) => {
    console.error("✗", err instanceof Error ? err.stack : String(err));
    process.exitCode = 1;
  })
  /* El pool de prisma mantiene vivo el proceso: se sale a mano. */
  .finally(() => process.exit(process.exitCode ?? 0));
