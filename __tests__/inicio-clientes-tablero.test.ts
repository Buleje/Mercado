/**
 * Inicio › Clientes: qué se muestra según los datos (Brandon 2026-10-09:
 * «ocultar gráficos que no tienen ninguna información» y, sin ningún cliente
 * en el rango, sólo el estado vacío del paiche).
 */
import { describe, expect, it } from "vitest";
import {
  SIN_CLIENTE,
  calcularClientes,
  hayClientesEnRango,
  mesCorto,
  nombreDeCliente,
  queSeMuestraClientes,
  sinAnonimos,
  type ClientesCrudos,
} from "@/components/admin/inicio/clientes-tablero";
import { calcularAvanzado, queSeMuestraAvanzado } from "@/components/admin/inicio/clientes-avanzado";
import type { DateRange } from "@/components/admin/inicio/DashboardDateRange";

const AHORA = new Date(2026, 9, 9, 15, 0, 0); // jueves 09/10/2026, hora local
const OCTUBRE: DateRange = { preset: "mensual", from: new Date(2026, 9, 1), to: new Date(2026, 9, 31, 23, 59, 59) };
const dia = (d: number, h = 10) => new Date(2026, 9, d, h).toISOString();
const vacio: ClientesCrudos = { customers: [], orders: [], sales: [], reviews: [] };

describe("calcularClientes · nombres y ventas sin cliente", () => {
  const raw: ClientesCrudos = {
    customers: [{ phone: "911", name: "María Quispe", totalSpent: 120 }],
    orders: [],
    sales: [
      { total: 40, customerPhone: "911", createdAt: dia(2) },
      { total: 300, customerPhone: "", createdAt: dia(3) },
      { total: 15, customerPhone: "922", createdAt: dia(4) },
    ],
    reviews: [],
  };
  const d = calcularClientes(raw, OCTUBRE, AHORA);

  it("el nombre sale de la lista de clientes; sin lista queda el teléfono", () => {
    const nombres = d.topClientes.map((c) => c.nombre);
    expect(nombres).toContain("María Quispe");
    expect(nombres).toContain("922");
  });

  it("las ventas sin cliente no encabezan el ranking", () => {
    expect(d.topClientes[0].telefono).toBe(SIN_CLIENTE); // la cuenta las junta (no se tocó)…
    expect(sinAnonimos(d.topClientes).map((c) => c.telefono)).toEqual(["911", "922"]); // …el ranking no
    expect(queSeMuestraClientes(d).top).toBe("lista");
  });

  it("los días se rotulan «02 oct» y la clave queda para el tooltip", () => {
    expect(d.clientesPorDia.map((x) => x.dia)).toEqual(["02 oct", "04 oct"]);
    expect(d.clientesPorDia[0].clave).toBe("2026-10-02");
  });
});

describe("queSeMuestraClientes · R1/R2", () => {
  it("sin datos: estado vacío de la pestaña y todo oculto", () => {
    const d = calcularClientes(vacio, OCTUBRE, AHORA);
    expect(hayClientesEnRango(d)).toBe(false);
    expect(queSeMuestraClientes(d)).toEqual({
      top: "oculto", retencion: false, porDia: false, gasto: false, frecuencia: false, ticket: "oculto",
    });
  });

  it("clientes registrados pero ninguno compró en el rango → vacío igual", () => {
    const d = calcularClientes({ ...vacio, customers: [{ phone: "1", name: "A", totalSpent: 0 }] }, OCTUBRE, AHORA);
    expect(d.totalClientes).toBe(1);
    expect(hayClientesEnRango(d)).toBe(false);
  });

  it("una sola compra: lista corta, sin tendencia por día ni gasto histórico en cero", () => {
    const d = calcularClientes(
      { ...vacio, customers: [{ phone: "1", name: "A", totalSpent: 0 }], sales: [{ total: 10, customerPhone: "1", createdAt: dia(5) }] },
      OCTUBRE,
      AHORA,
    );
    const q = queSeMuestraClientes(d);
    expect(hayClientesEnRango(d)).toBe(true);
    expect(q.top).toBe("lista");
    expect(q.porDia).toBe(false); // 1 día no es tendencia
    expect(q.gasto).toBe(false); // todos con gasto 0: una barra sola
    expect(q.frecuencia).toBe(true);
  });
});

describe("queSeMuestraAvanzado", () => {
  it("sin compras: nada se muestra", () => {
    expect(Object.values(queSeMuestraAvanzado(calcularAvanzado(vacio, AHORA.getTime())))).not.toContain(true);
  });

  it("cohorte sólo del mes en curso no tiene «mes siguiente»: oculta", () => {
    const a = calcularAvanzado({ ...vacio, sales: [{ total: 10, customerPhone: "1", createdAt: dia(3) }] }, AHORA.getTime());
    expect(queSeMuestraAvanzado(a).cohorte).toBe(false);
    expect(queSeMuestraAvanzado(a).rfm).toBe(false); // 1 cliente no arma grupos
  });

  it("cohorte de setiembre que volvió en octubre: se muestra; el nombre sale de la lista", () => {
    const a = calcularAvanzado(
      {
        ...vacio,
        customers: [{ phone: "1", name: "Rosa", totalSpent: 50 }],
        sales: [
          { total: 10, customerPhone: "1", createdAt: new Date(2026, 8, 10).toISOString() },
          { total: 10, customerPhone: "1", createdAt: dia(3) },
        ],
      },
      AHORA.getTime(),
    );
    expect(queSeMuestraAvanzado(a).cohorte).toBe(true);
    expect(a.cohort.find((c) => c.cohorte === "set")?.m1).toBe(100);
    expect(a.rfm.rows[0].name).toBe("Rosa");
  });
});

describe("etiquetas", () => {
  it("mesCorto escribe el año sólo si no es el actual", () => {
    expect(mesCorto(new Date(2026, 9, 1), AHORA)).toBe("oct");
    expect(mesCorto(new Date(2025, 11, 1), AHORA)).toBe("dic 2025");
  });
  it("nombreDeCliente: lista > nombre propio > teléfono", () => {
    const m = new Map([["1", "Ana"]]);
    expect(nombreDeCliente("1", "otro", m)).toBe("Ana");
    expect(nombreDeCliente("2", "Luis", m)).toBe("Luis");
    expect(nombreDeCliente("3", undefined, m)).toBe("3");
  });
});
