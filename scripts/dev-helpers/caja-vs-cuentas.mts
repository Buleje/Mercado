/**
 * caja-vs-cuentas.mts — la Caja del mes y «Cuentas» (ADR-527) lado a lado, desglosadas por fuente, en una corrida
 * (~30 s). SOLO LECTURA. Nació el 01-11-2026: cruzarlas a mano costó ~15 consultas sueltas por negocio y mes.
 *
 * Uso: scripts/dev-helpers/tsx-servidor.sh scripts/dev-helpers/caja-vs-cuentas.mts <tenantId> <YYYY-MM> [<YYYY-MM> …]
 *   (Blas = cmpxiv6p4000bohvzwl6bnfpv · la bodega de pruebas = main)
 * Si difieren, cada diferencia tiene que tener nombre (máquinas, caja manual, pago forestal fuera…: ver ADR-527).
 */
import { ResultadoNegocioDB } from "@/lib/db/resultado-negocio.db";
import { CuentasMovimientosDB } from "@/lib/db/cuentas-movimientos.db";
import { armarCaja } from "@/lib/finance/resultado-del-negocio";
import { rangoDelPeriodo } from "@/lib/finance/cuentas-del-periodo";
import { prisma } from "@/lib/prisma";

const [tenantId, ...meses] = process.argv.slice(2);
if (!tenantId || meses.length === 0 || meses.some((m) => !/^\d{4}-\d{2}$/.test(m))) {
  console.error("Uso: scripts/dev-helpers/tsx-servidor.sh scripts/dev-helpers/caja-vs-cuentas.mts <tenantId> <YYYY-MM> [...]");
  process.exit(2);
}
try {
  for (const mes of meses) {
    const [y, m] = mes.split("-").map(Number);
    const finDelMes = new Date(Date.UTC(y, m, 0, 20)); // último día del mes, 15:00 de Lima: el «hoy» del periodo cubre el mes entero
    const c = armarCaja(mes, await ResultadoNegocioDB.entradaCaja(tenantId, mes));
    const k = await CuentasMovimientosDB.delPeriodo(tenantId, rangoDelPeriodo("mes", finDelMes));
    console.log(`${mes} CAJA entró=${c.totalEntro} salió=${c.totalSalio} | CUENTAS entró=${k.entro} salió=${k.salio} queda=${k.queda} | caja sin sumar +${c.sinSumar.ingresos} −${c.sinSumar.egresos}`);
    console.log("  caja:", [...c.entro, ...c.salio].filter((r) => r.monto).map((r) => `${r.lado[0]}:${r.fuente}=${r.monto}`).join(" "));
    const por = new Map<string, number>();
    for (const x of k.movimientos) por.set(`${x.grupo}:${x.tipo}`, Math.round(((por.get(`${x.grupo}:${x.tipo}`) ?? 0) + x.monto) * 100) / 100);
    console.log("  cuentas:", [...por].map(([a, b]) => `${a}=${b}`).join(" "));
  }
} finally {
  await prisma.$disconnect();
  process.exit(0); // sin esto el pool de la base deja el programa colgado (medido: 2 min 30 s)
}
