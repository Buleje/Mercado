import { describe, expect, it } from "vitest";
import {
  diaDeVencimiento, fechaConDia, filtrar, ordenar, proveedoresConCuentas, resumir, sumarDias, vencimiento, venceConCredito, type CuentaPorPagar,
} from "@/components/admin/cuentas-por-pagar/resumen-cuentas";
import { cuerpoDelProveedor, diasDeEntrega, EMPTY_FORM, formDesdeProveedor } from "@/components/admin/proveedores/proveedor-form-datos";

const cuenta = (p: Partial<CuentaPorPagar>): CuentaPorPagar => ({
  id: "c", supplierId: "s1", supplierName: "Distribuidora Ucayali", description: "", amount: 100, paidAmount: 0,
  status: "pendiente", dueDate: "2026-10-15T00:00:00.000Z", payments: [], createdAt: "2026-10-01T00:00:00.000Z", ...p,
});
const HOY = "2026-10-09";

describe("vencimiento de una cuenta por pagar", () => {
  it("fecha del calendario (medianoche UTC) se lee tal cual; la de una OC, en hora de Lima", () => {
    expect(diaDeVencimiento("2026-10-15T00:00:00.000Z")).toBe("2026-10-15");
    // 02:00 UTC del 16 = 21:00 del 15 en Lima
    expect(diaDeVencimiento("2026-10-16T02:00:00.000Z")).toBe("2026-10-15");
  });

  it("«jueves 15/10» y el chip según los días", () => {
    expect(fechaConDia("2026-10-15")).toBe("jueves 15/10");
    expect(vencimiento(cuenta({}), HOY)).toMatchObject({ tono: "pronto", texto: "Vence en 6 días" });
    expect(vencimiento(cuenta({ dueDate: "2026-10-09T00:00:00.000Z" }), HOY).texto).toBe("Vence hoy");
    expect(vencimiento(cuenta({ dueDate: "2026-10-06T00:00:00.000Z" }), HOY)).toMatchObject({ tono: "vencida", texto: "Venció hace 3 días" });
    expect(vencimiento(cuenta({ dueDate: "2026-11-30T00:00:00.000Z" }), HOY).tono).toBe("al-dia");
    expect(vencimiento(cuenta({ paidAmount: 100, status: "pagado", dueDate: "2026-10-01T00:00:00.000Z" }), HOY).tono).toBe("pagada");
  });
});

describe("resumen, orden y filtro", () => {
  const cuentas = [
    cuenta({ id: "a", dueDate: "2026-11-30T00:00:00.000Z", amount: 50 }),
    cuenta({ id: "b", dueDate: "2026-10-06T00:00:00.000Z", amount: 80, paidAmount: 30, status: "parcial" }),
    cuenta({ id: "c", dueDate: "2026-10-12T00:00:00.000Z", supplierId: "s2", supplierName: "Molino Pucallpa" }),
    cuenta({ id: "d", amount: 40, paidAmount: 40, status: "pagado" }),
  ];

  it("suma lo que falta, lo vencido y lo que vence en 7 días", () => {
    expect(resumir(cuentas, HOY)).toEqual({ porPagar: 200, pendientes: 3, vencido: 50, vencidas: 1, pronto: 100, prontoN: 1, pagado: 70 });
  });

  it("vencidas primero, pagadas al final", () => {
    expect(ordenar(cuentas).map((c) => c.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("filtra por estado y proveedor; el proveedor que más se le debe va primero", () => {
    expect(filtrar(cuentas, "pagadas", "").map((c) => c.id)).toEqual(["d"]);
    expect(filtrar(cuentas, "pendientes", "s2").map((c) => c.id)).toEqual(["c"]);
    expect(proveedoresConCuentas(cuentas)[0]).toMatchObject({ id: "s1", debe: 100, n: 3 });
  });
});

describe("días de entrega del proveedor", () => {
  it("vacío = null (usa lo medido); se guarda entero entre 0 y 365", () => {
    expect(diasDeEntrega("")).toBeNull();
    expect(diasDeEntrega("4")).toBe(4);
    expect(diasDeEntrega("2.6")).toBe(3);
    expect(diasDeEntrega("900")).toBe(365);
  });

  it("viaja de la ficha al formulario y del formulario al cuerpo", () => {
    expect(formDesdeProveedor({ name: "X", leadTimeDias: 5 }).leadTimeDias).toBe("5");
    expect(formDesdeProveedor({ name: "X" }).leadTimeDias).toBe("");
    expect(cuerpoDelProveedor({ ...EMPTY_FORM, name: "X", leadTimeDias: "5" }).leadTimeDias).toBe(5);
    expect(cuerpoDelProveedor({ ...EMPTY_FORM, name: "X" }).leadTimeDias).toBeNull();
  });
});

describe("«Vence» de una cuenta nueva con los días de crédito del proveedor", () => {
  it("hoy + días de crédito, cruzando el fin de mes", () => {
    expect(venceConCredito("2026-10-09", 15)).toEqual({ fecha: "2026-10-24", linea: "a 15 días de crédito" });
    expect(venceConCredito("2026-10-20", 30).fecha).toBe("2026-11-19");
    expect(venceConCredito("2026-10-09", 1).linea).toBe("a 1 día de crédito");
  });

  it("sin días, 0 o basura: vence hoy y lo dice", () => {
    for (const d of [0, null, undefined, -3, Number.NaN]) {
      expect(venceConCredito(HOY, d)).toEqual({ fecha: HOY, linea: "sin días de crédito en su ficha: vence hoy" });
    }
  });

  it("sumarDias trabaja la fecha del calendario (año bisiesto y cambio de año)", () => {
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(sumarDias("2026-12-25", 10)).toBe("2027-01-04");
    expect(sumarDias("2026-10-09", 0)).toBe("2026-10-09");
  });
});
