import { describe, expect, it } from "vitest";
import {
  CATEGORIA_COMPRAS_TOTAL,
  armarPresupuestoCompras,
  categoriaDeProveedor,
  esCategoriaDeCompras,
  mesDeLima,
} from "@/lib/compras/presupuesto-compras";

describe("presupuesto de compras (N02)", () => {
  const ordenes = [
    { supplierId: "a", supplierName: "Alicorp", total: 3000, status: "recibido" },
    { supplierId: "a", supplierName: "Alicorp", total: 200, status: "pendiente" },
    { supplierId: "b", supplierName: "Gloria", total: 1500, status: "parcial" },
    { supplierId: "b", supplierName: "Gloria", total: 999, status: "cancelado" },
    { supplierId: "c", supplierName: "Auto", total: 5000, status: "auto_generated" },
  ];

  it("suma recibido y por recibir, sin canceladas ni automáticas", () => {
    const r = armarPresupuestoCompras("2026-10", ordenes, []);
    expect(r.total.recibido).toBe(3000);
    expect(r.total.porRecibir).toBe(1700);
    expect(r.total.comprado).toBe(4700);
    expect(r.total.presupuesto).toBeNull();
    expect(r.hayPresupuesto).toBe(false);
    expect(r.proveedores.map((p) => p.nombre)).toEqual(["Alicorp", "Gloria"]);
  });

  it("te quedan y te pasaste, por mes y por proveedor", () => {
    const r = armarPresupuestoCompras("2026-10", ordenes, [
      { category: CATEGORIA_COMPRAS_TOTAL, montoMensual: 8000 },
      { category: categoriaDeProveedor("a"), montoMensual: 3000 },
      { category: categoriaDeProveedor("z"), montoMensual: 500 },
    ], { z: "Laive" });
    expect(r.total.quedan).toBe(3300);
    expect(r.total.usadoPct).toBe(58.8);
    const a = r.proveedores.find((p) => p.supplierId === "a")!;
    expect(a.quedan).toBe(-200);
    expect(a.usadoPct).toBe(106.7);
    const z = r.proveedores.find((p) => p.supplierId === "z")!;
    expect(z).toMatchObject({ nombre: "Laive", comprado: 0, quedan: 500 });
    expect(r.hayPresupuesto).toBe(true);
  });

  it("las categorías «compras:» no son gasto de Mi Plata", () => {
    expect(esCategoriaDeCompras(CATEGORIA_COMPRAS_TOTAL)).toBe(true);
    expect(esCategoriaDeCompras(categoriaDeProveedor("a"))).toBe(true);
    expect(esCategoriaDeCompras("Luz")).toBe(false);
  });

  it("el mes es el de Lima: el 1 a las 03:00 UTC todavía es el mes anterior", () => {
    expect(mesDeLima(new Date("2026-11-01T03:00:00Z")).clave).toBe("2026-10");
    const { desde, hasta } = mesDeLima(new Date("2026-10-17T12:00:00Z"));
    expect(desde.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(hasta.toISOString()).toBe("2026-11-01T05:00:00.000Z");
  });
});
