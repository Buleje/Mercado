import { describe, expect, it } from "vitest";
import { rotuloDelMenu } from "@/components/admin/shared/rotulo-del-menu";
import type { TabCategory } from "@/app/admin/_lib/tab-categories";

const icono = () => null;
const cat = (id: string, label: string, tabs: string[]): TabCategory =>
  ({ id, label, icon: icono, tabs }) as unknown as TabCategory;

const MENU = [
  cat("inicio", "Inicio", ["vendor-dashboard"]),
  cat("ventas", "Ventas", ["ventas-caja", "pedidos"]),
  cat("compras", "Compras", ["compras"]),
  cat("finanzas", "Finanzas", ["plata"]),
];
const SECCIONES = { ventas: "Operaciones", finanzas: "Gestión" };

describe("rotuloDelMenu", () => {
  it("sección · categoría cuando ninguna repite el título", () => {
    expect(rotuloDelMenu("ventas-caja", "Ventas & Caja", MENU, SECCIONES)).toBe("Operaciones · Ventas");
    expect(rotuloDelMenu("plata", "Mi Plata", MENU, SECCIONES)).toBe("Gestión · Finanzas");
  });

  it("la sección se hereda de la categoría de arriba en el menú", () => {
    expect(rotuloDelMenu("compras", "Pedidos a proveedor", MENU, SECCIONES)).toBe("Operaciones · Compras");
  });

  it("no repite el título (sin importar tildes, mayúsculas ni &)", () => {
    expect(rotuloDelMenu("compras", "Compras", MENU, SECCIONES)).toBe("Operaciones");
    expect(rotuloDelMenu("plata", "finanzas", MENU, SECCIONES)).toBe("Gestión");
  });

  it("sin rótulo si no hay nada distinto que decir o la pestaña no está en el menú", () => {
    expect(rotuloDelMenu("vendor-dashboard", "Inicio", MENU, SECCIONES)).toBeUndefined();
    expect(rotuloDelMenu("no-existe", "X", MENU, SECCIONES)).toBeUndefined();
    expect(rotuloDelMenu(null, "X", MENU, SECCIONES)).toBeUndefined();
  });

  it("con el menú real, Ventas & Caja cae en Operaciones · Ventas", () => {
    expect(rotuloDelMenu("ventas-caja", "Ventas & Caja")).toBe("Operaciones · Ventas");
  });
});
