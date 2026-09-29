/**
 * Movimientos › Proyección de caja con la caja del mes arriba (ADR-451).
 *
 * Lo que puede mentir en esta pantalla:
 *  - la planilla AUSENTE (quien no ve RRHH no la recibe) salía «S/ NaN»: va «—»;
 *  - el saldo inicial estimado se leía como el de las cuentas: dice de dónde sale;
 *  - los movimientos a mano de la caja se muestran y NO se suman;
 *  - lo ya adelantado se cruza en Liquidar: no es plata por entrar;
 *  - quien no ve la caja del negocio no la pide, y la proyección sigue;
 *  - un 403 de la proyección es una frase, no un error rojo.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { limaDateKey } from "@/lib/utils";
import type { RespuestaCaja } from "@/lib/finance/resultado-del-negocio";
import type { ProyeccionDeCaja, SemanaProyectada } from "@/hooks/use-caja-del-negocio";
import { etiquetaFuente, etiquetaViene, NOMBRE_FUENTE, NOMBRE_VIENE, nombreMes } from "@/components/admin/unified/finanzas/resultado/fuentes";
import { FUENTES_DETALLE } from "@/lib/finance/resultado-del-negocio";

const rol = vi.hoisted(() => ({ actual: "admin" as string | null }));
vi.mock("@/lib/client-cache-fetch", () => ({
  cachedJson: vi.fn(async () => (rol.actual ? { role: rol.actual } : null)),
}));

import CashflowRollingTable from "@/components/admin/finance/CashflowRollingTable";

const MES = limaDateKey().slice(0, 7);

const CAJA: RespuestaCaja = {
  caja: {
    mes: MES,
    entro: [
      { fuente: "mostrador_cobrado", lado: "entro", monto: 170, certeza: "medido", cuantos: 4, nota: "ventas" },
      { fuente: "adelanto_recibido", lado: "entro", monto: 3031, certeza: "medido", cuantos: 1, nota: "adelanto" },
      { fuente: "cobros_forestales", lado: "entro", monto: 0, certeza: "medido", cuantos: 0, nota: "cobros" },
      { fuente: "adelanto_devuelto", lado: "entro", monto: 0, certeza: "medido", cuantos: 0, nota: "devuelto" },
      /* Una fuente que la pantalla todavía no conoce (el servidor suma sin avisar). */
      { fuente: "prestamo_cobrado" as never, lado: "entro", monto: 50, certeza: "medido", cuantos: 1, nota: "nueva" },
    ],
    salio: [
      { fuente: "gastos_pagados", lado: "salio", monto: 20, certeza: "medido", cuantos: 1, nota: "gastos" },
      { fuente: "adelanto_dado", lado: "salio", monto: 0, certeza: "medido", cuantos: 0, nota: "dados" },
    ],
    totalEntro: 3251,
    totalSalio: 20,
    neto: 3231,
    estimado: false,
    sinSumar: { cuantos: 28, ingresos: 3491, egresos: 3436, nota: "se muestran y no se suman" },
    nuncaCaja: { cuantos: 0, monto: 0, nota: "cruces" },
    avisos: [{ codigo: "caja_manual_sin_sumar", texto: "28 movimientos manuales…", fuente: "caja_sin_sumar", cuantos: 28 }],
    otrasMonedas: [],
  },
  viene: {
    items: [
      {
        tipo: "te_deben_cuenta",
        lado: "entra",
        monto: 12323.02,
        certeza: "medido",
        cuantos: 1,
        quienes: [{ nombre: "WASACO", monto: 12323.02, vence: null }],
        nota: "saldo a favor",
        enlace: { tab: "plata", params: { vista: "por-cobrar" } },
      },
      {
        tipo: "recibido_para_cruzar",
        lado: "cruzar",
        monto: 3031,
        certeza: "medido",
        cuantos: 1,
        quienes: [{ nombre: "WASACO", monto: 3031, vence: null }],
        nota: "se cruza al liquidar",
        enlace: { tab: "plata", params: { vista: "adelantos", accion: "liquidar" } },
      },
      {
        tipo: "planilla_por_pagar",
        lado: "sale",
        monto: null,
        certeza: "incompleto",
        cuantos: 0,
        quienes: [],
        nota: "sin datos de asistencia",
        enlace: { tab: "rrhh", params: {} },
      },
    ],
    porCobrar: 12323.02,
    porPagar: 0,
    paraCruzar: 3031,
    estimado: true,
    otrasMonedas: [{ moneda: "USD", cuantos: 1, total: 120 }],
  },
  generadoEn: new Date().toISOString(),
};

function semana(n: number): SemanaProyectada {
  return {
    weekNumber: n,
    weekStart: new Date(Date.UTC(2026, 8, 28 + (n - 1) * 7, 5)).toISOString(),
    weekEnd: new Date(Date.UTC(2026, 9, 5 + (n - 1) * 7, 4, 59)).toISOString(),
    openingBalance: 1000,
    expectedCollections: 0,
    creditCollections: 0,
    supplierPayments: n === 2 ? 1200 : 0,
    // payroll AUSENTE: el rol no ve lo ganado de RRHH.
    loans: 0,
    otherExpenses: 0,
    advanceCollections: 0,
    closingBalance: 1000,
    isNegative: false,
  };
}

const PROYECCION: ProyeccionDeCaja = {
  tenantId: "t",
  generatedAt: new Date().toISOString(),
  startingBalance: 20500,
  weeks: Array.from({ length: 13 }, (_, i) => semana(i + 1)),
  criticalWeek: null,
  saldoInicial: { monto: 20500, fuente: "neto_30_dias", estimado: true },
  payrollFuente: "sin_permiso",
  adelantosConVencimiento: { monto: 0, cuantos: 0 },
  sinFecha: { porCobrar: 5156.34, cuantosPorCobrar: 14, porPagar: 0, cuantosPorPagar: 0 },
};

const mockFetch = vi.fn();
function responder(o: { proyeccion?: number } = {}) {
  mockFetch.mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes("/api/finanzas/caja-del-negocio")) return Promise.resolve({ ok: true, json: async () => CAJA });
    if (u.includes("/api/finance/cashflow-rolling")) {
      return o.proyeccion
        ? Promise.resolve({ ok: false, status: o.proyeccion, json: async () => ({ error: "forbidden" }) })
        : Promise.resolve({ ok: true, json: async () => PROYECCION });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}
const pidio = (parte: string) => mockFetch.mock.calls.some(([u]) => String(u).includes(parte));

beforeEach(() => {
  rol.actual = "admin";
  mockFetch.mockReset();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});
afterEach(() => vi.clearAllMocks());

describe("la caja del mes, arriba de la proyección", () => {
  it("dos columnas Entró / Salió con sus totales, y lo que está en cero plegado", async () => {
    responder();
    render(<CashflowRollingTable />);
    expect(await screen.findByText(`Caja de ${nombreMes(MES)}`)).toBeTruthy();
    expect(screen.getByText("S/ 3,251.00")).toBeTruthy();
    /* El total de «Salió» y su único renglón, «Gastos pagados». */
    expect(screen.getAllByText("S/ 20.00")).toHaveLength(2);
    expect(screen.getByText("+ S/ 3,231.00")).toBeTruthy();
    expect(screen.getByRole("button", { name: "+2 sin movimiento" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "+1 sin movimiento" })).toBeTruthy();
    expect(mockFetch.mock.calls.some(([u]) => String(u) === `/api/finanzas/caja-del-negocio?mes=${MES}`)).toBe(true);
  });

  it("los movimientos a mano se muestran en «Sin sumar» y su aviso no se repite", async () => {
    responder();
    render(<CashflowRollingTable />);
    expect(await screen.findByText("Sin sumar:")).toBeTruthy();
    expect(screen.getByText(/28 movimientos a mano en la caja · entraron S\/ 3,491\.00 · salieron S\/ 3,436\.00/)).toBeTruthy();
    expect(screen.queryByText("28 movimientos manuales…")).toBeNull();
  });

  it("lo que ya te adelantaron se cruza en Liquidar, y la planilla sin dato es «—»", async () => {
    responder();
    render(<CashflowRollingTable />);
    expect(await screen.findByRole("button", { name: "Ya te adelantaron: para cruzar: S/ 3,031.00. Cruzar en Liquidar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Planilla por pagar: —. Ver planilla" })).toBeTruthy();
    /* Lo que está en dólares se dice y no se suma a los soles. */
    expect(screen.getByText(/1 movimiento en USD por/)).toBeTruthy();
    /* «Te van a pagar» es lo que entra: no suma lo que se cruza. */
    expect(screen.getAllByText("S/ 12,323.02").length).toBeGreaterThan(0);
  });
});

describe("la proyección de 13 semanas", () => {
  it("la planilla que no viaja es «—», nunca «S/ NaN», y el saldo inicial dice que es estimado", async () => {
    responder();
    const { container } = render(<CashflowRollingTable />);
    const fila = (await screen.findByText("Planilla", { selector: "th span" })).closest("tr") as HTMLElement;
    expect(within(fila).getAllByText("—")).toHaveLength(13);
    expect(container.textContent).not.toMatch(/NaN/);
    expect(screen.getByText("Saldo de hoy, estimado")).toBeTruthy();
    expect(screen.getByText("≈ S/ 20,500.00")).toBeTruthy();
  });

  it("lo que no cae en ninguna semana va en una línea aparte", async () => {
    responder();
    render(<CashflowRollingTable />);
    expect(await screen.findByText("Sin fecha, te deben")).toBeTruthy();
    expect(screen.getByText(/S\/ 5,156\.34 · 14 pendientes/)).toBeTruthy();
  });

  it("en el celular, una línea por semana con sólo lo que se mueve", async () => {
    responder();
    render(<CashflowRollingTable />);
    const lista = await screen.findByRole("list", { name: "Las próximas 13 semanas" });
    expect(within(lista).getAllByRole("listitem").filter((li) => li.parentElement === lista)).toHaveLength(13);
    /* Sólo la semana 2 paga a proveedores: las otras 12 dicen «Sin movimientos». */
    expect(within(lista).getByText("− Pagos a proveedores")).toBeTruthy();
    expect(within(lista).getAllByText("Sin movimientos")).toHaveLength(12);
  });

  it("un 403 de la proyección es una frase, y la caja del mes sigue", async () => {
    responder({ proyeccion: 403 });
    render(<CashflowRollingTable />);
    expect(await screen.findByText("Tu usuario no ve la proyección de caja.")).toBeTruthy();
    expect(await screen.findByText(`Caja de ${nombreMes(MES)}`)).toBeTruthy();
  });

  it("el cajero ve la proyección pero no pide la caja del negocio", async () => {
    rol.actual = "cajero";
    responder();
    render(<CashflowRollingTable />);
    expect(await screen.findByText("Saldo de hoy, estimado")).toBeTruthy();
    expect(pidio("/api/finanzas/caja-del-negocio")).toBe(false);
    expect(screen.queryByText(`Caja de ${nombreMes(MES)}`)).toBeNull();
  });
});

describe("ninguna fuente se pinta con su id crudo", () => {
  it("cada fuente y cada renglón de «lo que viene» del contrato tiene su rótulo", () => {
    const sinRotulo = FUENTES_DETALLE.filter((f) => !(f in NOMBRE_FUENTE));
    expect(sinRotulo).toEqual([]);
    for (const t of ["te_deben_cuenta", "le_debes_cuenta", "recibido_para_cruzar", "adelantos_por_cobrar", "fiados", "por_pagar_proveedores", "planilla_por_pagar"]) {
      expect(t in NOMBRE_VIENE).toBe(true);
    }
  });

  it("lo que llega sin rótulo se lee como palabras, no como id", () => {
    expect(etiquetaFuente("prestamo_cobrado")).toBe("Prestamo cobrado");
    expect(etiquetaViene("cuotas_por_cobrar")).toBe("Cuotas por cobrar");
    expect(etiquetaFuente("recibido_devuelto")).toBe("Adelantos que devolviste");
  });

  it("en pantalla, la fuente nueva sale legible y se puede abrir", async () => {
    responder();
    render(<CashflowRollingTable />);
    expect(await screen.findByRole("button", { name: /^Prestamo cobrado: S\/ 50\.00/ })).toBeTruthy();
    expect(screen.queryByText("prestamo_cobrado")).toBeNull();
  });
});
