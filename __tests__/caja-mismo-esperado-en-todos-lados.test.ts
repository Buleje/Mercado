/**
 * La misma caja da el MISMO esperado en el servidor, en la pantalla, en el correo
 * de cierre y en el asistente (F4, 3ª pasada de seguridad de ADR-448).
 *
 * Antes había siete copias de la cuenta: el cierre, `CashRegisterTab`,
 * `TurnosModule`, el correo, `caja.agent`, el reporte del día y el Tablero. Con un adelanto pagado por Yape la
 * pantalla restaba lo que el cierre ya no resta, y el asistente ni siquiera
 * sumaba las ventas en efectivo. Ahora todas pasan por `saldoEsperadoDeCaja`.
 *
 * El cruce contra el cierre REAL (base, tenant `main`) está en
 * `caja-cierre-carrera-db.test.ts` («un egreso por Yape…»).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const { mockGetOpen, cajaDelTablero } = vi.hoisted(() => ({ mockGetOpen: vi.fn(), cajaDelTablero: { valor: null as unknown } }));
vi.mock("@/lib/db/sales.db", () => ({ CashRegistersDB: { getOpen: mockGetOpen }, SalesDB: { getAll: async () => [] } }));
vi.mock("@/lib/db/orders.db", () => ({ OrdersDB: { getAllFiltered: async () => [] } }));
vi.mock("@/lib/db/products.db", () => ({ ProductsDB: { getAll: async () => [] } }));
vi.mock("@/lib/db/customers.db", () => ({ CustomersDB: { getAll: async () => [] } }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: async () => ({ tenantId: "t1", username: "qa", role: "admin" }) }));
vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
/* El Tablero lee con Prisma: todo vacío salvo la caja abierta. */
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_t, modelo) => ({
        findMany: async () => [],
        findFirst: async () => (modelo === "cashRegister" ? cajaDelTablero.valor : null),
      }),
    },
  ),
}));

import { saldoEsperadoDeCaja, lineaFueraDelCajon } from "@/lib/caja/saldo-esperado";
import { cuentasDeCajaParaPantalla } from "@/lib/caja/cuentas-de-pantalla";
import { resumenCierreDeCaja } from "@/lib/caja/resumen-cierre";
import { htmlResumenCierreCaja } from "@/lib/mailer";
import { escapeHtml } from "@/lib/email/escape-html";
import { cajaAgent } from "@/lib/agents/domains/caja.agent";
import { GET as reporteDelDia } from "@/app/api/daily-report/route";
import { VentasOverviewDB } from "@/lib/db/ventas-overview.db";
import { NextRequest } from "next/server";

/** Un día con de todo: ventas en efectivo y Yape, un adelanto pagado por Yape, un ingreso por transferencia. */
const APERTURA = 100;
const MOVS = [
  { type: "apertura", method: "efectivo", amount: 100 },
  { type: "venta", method: "efectivo", amount: 50 },
  { type: "venta", method: "yape", amount: 30 },
  { type: "ingreso", method: "efectivo", amount: 20 },
  { type: "egreso", method: "yape", amount: 80 },
  { type: "egreso", method: "efectivo", amount: 15 },
  { type: "ingreso", method: "transferencia", amount: 40 },
];
/** 100 + 50 + 20 − 15. Ni los 80 de Yape ni los 40 de la transferencia pasan por el cajón. */
const ESPERADO = 155;
const soles = (n: number) => `S/ ${n.toFixed(2)}`;

describe("un solo esperado para la misma caja", () => {
  it("servidor (la cuenta del cierre)", () => {
    expect(saldoEsperadoDeCaja(APERTURA, MOVS).esperado).toBe(ESPERADO);
  });

  it("pantalla de caja: el esperado y la línea aparte", () => {
    const c = cuentasDeCajaParaPantalla(APERTURA, MOVS, soles);
    expect(c.expectedCash).toBe(ESPERADO);
    expect(c.totalOut).toBe(15);
    expect(c.salesDigital).toBe(30);
    expect(c.fueraDelCajon).toBe("Por Yape/transferencia: entraron S/ 40.00 · salieron S/ 80.00 — no está en el cajón");
  });

  it("correo de cierre: sus renglones suman el esperado y trae la línea aparte", () => {
    const reg = { id: "c1", openedAt: "2026-09-29T13:00:00.000Z", closedAt: "2026-09-29T23:00:00.000Z", openingAmount: APERTURA, expectedAmount: ESPERADO, closingAmount: ESPERADO, difference: 0, movements: MOVS };
    const r = resumenCierreDeCaja(reg, ESPERADO);
    expect(r.expectedAmount).toBe(ESPERADO);
    expect(r.openingAmount + r.salesEfectivo + r.totalIn - r.totalOut).toBe(ESPERADO);
    const html = htmlResumenCierreCaja(r);
    expect(html).toContain("S/155.00");
    expect(html).toContain(escapeHtml(lineaFueraDelCajon(r.otrosMedios, (n) => `S/${n.toFixed(2)}`)));
    expect(html).toContain("no está en el cajón");
    /* Sin cerrar todavía (el cierre no devolvió esperado): lo calcula igual. */
    expect(resumenCierreDeCaja({ ...reg, expectedAmount: undefined, difference: undefined, closingAmount: undefined }, 150).difference).toBe(-5);
  });

  it("el correo escapa lo que viene de la base (el medio es texto libre de la ruta de caja)", () => {
    const r = resumenCierreDeCaja(
      { id: "c2", openedAt: "2026-09-29T13:00:00.000Z", openingAmount: 0, movements: [{ type: "egreso", method: "<img src=x>", amount: 1 }] },
      0,
      "<b>nota</b>",
    );
    const html = htmlResumenCierreCaja(r);
    expect(html).not.toContain("<img src=x>");
    expect(html).not.toContain("<b>nota</b>");
  });

  it("asistente («¿cómo viene la caja?»)", async () => {
    mockGetOpen.mockResolvedValue({ openedAt: "2026-09-29T13:00:00.000Z", openingAmount: APERTURA, movements: MOVS });
    const tarea = { id: "t", domain: "caja", action: "estado", payload: {}, priority: "normal", status: "running", tenantId: "t1", createdAt: "2026-09-29T00:00:00.000Z", traceId: "tr" };
    const r = await cajaAgent.execute(tarea as never, { tenantId: "t1", traceId: "tr" } as never);
    const d = r.data as { efectivoEsperado: number; fueraDelCajon: { egresos: number; ingresos: number } };
    expect(d.efectivoEsperado).toBe(ESPERADO);
    expect(d.fueraDelCajon).toMatchObject({ ingresos: 40, egresos: 80 });
  });

  it("reporte del día («saldo en caja»)", async () => {
    mockGetOpen.mockResolvedValue({ openedAt: "2026-09-29T13:00:00.000Z", openingAmount: APERTURA, movements: MOVS });
    const r = await reporteDelDia(new NextRequest("http://localhost/api/daily-report"));
    expect(r.status).toBe(200);
    expect(((await r.json()) as { cashBalance: number }).cashBalance).toBe(ESPERADO);
  });

  it("Tablero de ventas: el saldo de la caja abierta, con los movimientos de días anteriores", async () => {
    const ahora = new Date();
    const ayer = new Date(ahora.getTime() - 36 * 3_600_000);
    /* El primer movimiento es de ayer: la copia vieja sólo miraba los de hoy. */
    const movs = MOVS.map((m, i) => ({ ...m, createdAt: i === 1 ? ayer : ahora }));
    cajaDelTablero.valor = { openingAmount: APERTURA, movements: movs };
    const d = await VentasOverviewDB.get("t1", "hoy");
    expect(d.cash.saldoActual).toBe(ESPERADO);
    /* Los flujos del día, en efectivo: sin la venta de ayer ni la transferencia. */
    expect(d.cash).toMatchObject({ abierta: true, ingresos: 20, egresos: 15 });
  });

  it("ninguna pantalla vuelve a copiar la cuenta a mano", () => {
    for (const archivo of ["components/admin/CashRegisterTab.tsx", "components/admin/TurnosModule.tsx", "app/api/cash-registers/[id]/route.ts", "lib/agents/domains/caja.agent.ts", "app/api/daily-report/route.ts", "lib/db/ventas-overview.db.ts"]) {
      const src = readFileSync(path.join(process.cwd(), archivo), "utf8");
      expect(src, `${archivo} suma egresos a mano`).not.toMatch(/type === "egreso"\)\s*\.reduce/);
    }
    expect(readFileSync(path.join(process.cwd(), "components/admin/CashRegisterTab.tsx"), "utf8")).toContain("cuentasDeCajaParaPantalla(");
    expect(readFileSync(path.join(process.cwd(), "components/admin/TurnosModule.tsx"), "utf8")).toContain("cuentasDeCajaParaPantalla(");
  });
});
