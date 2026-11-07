import { describe, expect, it } from "vitest";
import { etiquetaCorta, pestanasDeLaBarra } from "@/lib/admin/barra-inferior";
import { CLAVE_DESDE, type ContadorDeUso } from "@/lib/admin/orden-por-uso";

const DIA = 86_400_000;
const AHORA = Date.UTC(2026, 9, 29, 15);
const BODEGA = ["vendor-dashboard", "ventas-caja", "inventario", "compras", "plata", "clientes", "rrhh", "pedidos"];
const ASERRADERO = ["vendor-dashboard", "rrhh", "documentos", "ctp-libro-operaciones", "loth-libro-operaciones", "camaras"];

/** Contador con `dias` de datos y aperturas `[clave «tab:vista», veces, hace cuántos días]`. */
function contador(dias: number, usos: [string, number, number][]): ContadorDeUso {
  const c: ContadorDeUso = { [CLAVE_DESDE]: { n: 0, ultima: AHORA - dias * DIA } };
  for (const [clave, n, hace] of usos) c[clave] = { n, ultima: AHORA - hace * DIA };
  return c;
}

describe("pestanasDeLaBarra", () => {
  it("sin datos: Inicio + las de siempre, en el orden del menú", () => {
    expect(pestanasDeLaBarra(BODEGA, null, true, AHORA)).toEqual(["vendor-dashboard", "ventas-caja", "inventario", "pedidos"]);
  });

  it("con «Orden de siempre» no mira el uso", () => {
    const c = contador(20, [["compras:ordenes", 50, 1]]);
    expect(pestanasDeLaBarra(BODEGA, c, false, AHORA)).toEqual(["vendor-dashboard", "ventas-caja", "inventario", "pedidos"]);
  });

  it("menos de 7 días de datos: las de siempre", () => {
    const c = contador(3, [["compras:ordenes", 50, 1]]);
    expect(pestanasDeLaBarra(BODEGA, c, true, AHORA)).not.toContain("compras");
  });

  it("las 3 más abiertas, sumando todas sus vistas", () => {
    const c = contador(20, [
      ["plata:resumen", 4, 1],
      ["plata:gastos", 4, 2],
      ["rrhh:asistencia", 6, 1],
      ["compras:ordenes", 7, 1],
      ["ventas-caja:pos", 2, 1],
    ]);
    expect(pestanasDeLaBarra(BODEGA, c, true, AHORA)).toEqual(["vendor-dashboard", "compras", "plata", "rrhh"]);
  });

  it("lo abierto hace más de 30 días no cuenta; los huecos se llenan con las de siempre", () => {
    const c = contador(60, [
      ["clientes:lista", 90, 40],
      ["rrhh:asistencia", 3, 1],
    ]);
    // Rellena en el orden de prioridad de siempre (Vender, Pedidos, Stock) y se muestra en el del menú.
    expect(pestanasDeLaBarra(BODEGA, c, true, AHORA)).toEqual(["vendor-dashboard", "ventas-caja", "rrhh", "pedidos"]);
  });

  it("aserradero sin ninguna de las de siempre: rellena con el menú, nunca queda Inicio solo", () => {
    expect(pestanasDeLaBarra(ASERRADERO, null, true, AHORA)).toEqual(["vendor-dashboard", "rrhh", "documentos", "ctp-libro-operaciones"]);
    const c = contador(10, [
      ["loth-libro-operaciones:plan", 9, 1],
      ["ctp-libro-operaciones:ingresos", 5, 1],
      ["camaras:vivo", 2, 1],
    ]);
    expect(pestanasDeLaBarra(ASERRADERO, c, true, AHORA)).toEqual([
      "vendor-dashboard",
      "ctp-libro-operaciones",
      "loth-libro-operaciones",
      "camaras",
    ]);
  });

  it("sin permiso de Inicio no lo inventa", () => {
    expect(pestanasDeLaBarra(["pedidos", "clientes"], null, true, AHORA)).toEqual(["pedidos", "clientes"]);
  });
});

describe("etiquetaCorta", () => {
  it("rótulos fijos y genéricos que entran en el casillero", () => {
    expect(etiquetaCorta("loth-libro-operaciones", "Libro Títulos Hab. (Forestal)")).toBe("Libro TH");
    expect(etiquetaCorta("documentos", "Documentos")).toBe("Documentos");
    expect(etiquetaCorta("cotizaciones", "Cotizaciones")).toBe("Cotizaciones");
    expect(etiquetaCorta("x", "Delivery en Vivo")).toBe("Delivery");
    expect(etiquetaCorta("y", "Funnel de Leads")).toBe("Funnel");
  });
});
