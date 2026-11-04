/**
 * Siembra la DEMO de aserradero en un negocio de prueba (slug `demo-…`).
 *
 * Ensayo (por defecto, NO abre la base ni transacciones): imprime la secuencia
 * de llamadas con sus cifras.
 *   npx tsx scripts/demo/sembrar-demo-aserradero.mts --tenant=<id>
 * De verdad (escribe en la base compartida con producción):
 *   scripts/dev-helpers/tsx-servidor.sh scripts/demo/sembrar-demo-aserradero.mts --tenant=<id> --si-estoy-seguro
 */
import { parseArgs } from "node:util";
import { pasosDelPlan, planDemoAserradero, verificarCuadre, esTenantDemo, TENANTS_PROHIBIDOS } from "../../lib/onboarding/demo-aserradero-datos";

const { values } = parseArgs({
  options: { tenant: { type: "string" }, "si-estoy-seguro": { type: "boolean", default: false } },
  strict: true,
});
const tenantId = values.tenant?.trim() ?? "";
if (!tenantId) {
  console.error("Uso: … sembrar-demo-aserradero.mts --tenant=<id> [--si-estoy-seguro]");
  process.exit(2);
}
if (TENANTS_PROHIBIDOS.includes(tenantId)) {
  console.error(`✋ «${tenantId}» nunca recibe datos de demo.`);
  process.exit(3);
}

const plan = planDemoAserradero();
const errores = verificarCuadre(plan);

if (!values["si-estoy-seguro"]) {
  console.log(`ENSAYO (no escribe nada) · negocio ${tenantId}`);
  console.log(`El negocio tiene que tener slug «demo-…»: ${esTenantDemo({ id: tenantId, slug: tenantId }) ? "este id ya lo parece" : "se valida contra la base al correr de verdad"}.`);
  pasosDelPlan(plan).forEach((p, i) => console.log(`${String(i + 1).padStart(2)}. ${p.llamada.padEnd(38)} ${p.detalle}`));
  console.log(errores.length === 0 ? "Cuadre: OK (saldo = ingreso − consumo · producido ≤ 75 % · GTF ≤ producido)" : `Cuadre: FALLA → ${errores.join("; ")}`);
  console.log("Para escribir: agregar --si-estoy-seguro (y correr con scripts/dev-helpers/tsx-servidor.sh).");
  process.exit(errores.length === 0 ? 0 : 1);
}

// Solo acá se carga la base: el ensayo no importa ninguna DB class.
const { sembrarDemoAserradero } = await import("../../lib/onboarding/demo-aserradero");
const { prisma } = await import("../../lib/prisma");
try {
  const r = await sembrarDemoAserradero(tenantId);
  console.log(r.yaSembrado ? "Ya estaba sembrada: no se escribió nada." : "Demo sembrada.", JSON.stringify(r.filas));
} catch (err) {
  console.error("✋ No se sembró:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  process.exit(process.exitCode ?? 0); // el pool deja el programa colgado sin esto
}
