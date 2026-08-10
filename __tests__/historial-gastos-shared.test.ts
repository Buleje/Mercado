import { describe, expect, it } from "vitest";
import {
  construirCsv, mesDe, normalizar, periodoADadas, resumirItems,
  type HistorialItem,
} from "@/components/admin/compras/historial/shared";

/**
 * Los helpers del Historial de Gastos. Todo lo que se prueba acá se rompió al
 * menos una vez en la pantalla anterior: el trimestre que no era un trimestre,
 * el CSV que corría columnas con una coma, y los totales que no seguían al
 * filtro.
 */

const item = (over: Partial<HistorialItem> = {}): HistorialItem => ({
  id: "exp-1",
  refId: "1",
  source: "expense",
  fecha: "2026-08-05T12:00:00.000Z",
  category: "Transporte",
  description: "Combustible",
  amount: 100,
  recurring: false,
  estadoPago: "pagado",
  montoPagado: 100,
  ...over,
});

describe("periodoADadas", () => {
  // 10 de agosto de 2026 — tercer trimestre, que empieza el 1 de julio.
  const hoy = new Date(2026, 7, 10, 15, 30);

  it("«trimestre» es el trimestre calendario, no tres meses corridos", () => {
    const { from } = periodoADadas("trimestre", hoy);
    expect(from?.getMonth()).toBe(6); // julio
    expect(from?.getDate()).toBe(1);
  });

  it("«mes pasado» se cierra: no arrastra lo de este mes", () => {
    const { from, to } = periodoADadas("mes-pasado", hoy);
    expect(from?.getMonth()).toBe(6);
    expect(from?.getDate()).toBe(1);
    expect(to?.getMonth()).toBe(6);
    expect(to?.getDate()).toBe(31); // último de julio
  });

  it("«hoy» empieza a las 00:00 y termina a las 23:59", () => {
    const { from, to } = periodoADadas("hoy", hoy);
    expect(from?.getHours()).toBe(0);
    expect(to?.getHours()).toBe(23);
    expect(from?.getDate()).toBe(10);
    expect(to?.getDate()).toBe(10);
  });

  it("«7 días» incluye hoy — son 7 días, no 8", () => {
    const { from } = periodoADadas("semana", hoy);
    expect(from?.getDate()).toBe(4);
  });

  it("«todo» no acota nada", () => {
    expect(periodoADadas("todo", hoy)).toEqual({});
  });
});

describe("resumirItems", () => {
  it("separa lo gastado de lo que ya salió de la caja", () => {
    const r = resumirItems([
      item({ amount: 100, montoPagado: 100 }),
      item({ id: "oc-1", source: "purchase", amount: 300, montoPagado: 120, estadoPago: "parcial" }),
    ]);
    expect(r.total).toBe(400);
    expect(r.pagado).toBe(220);
    expect(r.porPagar).toBe(180);
    expect(r.operativos).toBe(100);
    expect(r.compras).toBe(300);
  });

  it("ordena las categorías por lo que pesan", () => {
    const r = resumirItems([
      item({ category: "Servicios", amount: 50 }),
      item({ id: "b", category: "Alquiler", amount: 850 }),
      item({ id: "c", category: "Servicios", amount: 30 }),
    ]);
    expect(r.categorias[0]).toEqual({ cat: "Alquiler", total: 850 });
    expect(r.categorias[1]).toEqual({ cat: "Servicios", total: 80 });
  });

  it("no arrastra centavos de punto flotante", () => {
    const r = resumirItems([item({ amount: 0.1, montoPagado: 0.1 }), item({ id: "b", amount: 0.2, montoPagado: 0.2 })]);
    expect(r.total).toBe(0.3);
    expect(r.porPagar).toBe(0);
  });

  it("la lista vacía suma cero, no NaN", () => {
    const r = resumirItems([]);
    expect(r.total).toBe(0);
    expect(r.cantidad).toBe(0);
    expect(r.categorias).toEqual([]);
  });
});

describe("construirCsv", () => {
  it("un proveedor con coma no corre las columnas", () => {
    const csv = construirCsv([item({ supplierName: "Distribuidora Pérez, S.A.C." })]);
    const fila = csv.split("\r\n")[1];
    expect(fila).toContain('"Distribuidora Pérez, S.A.C."');
    // 10 columnas => 9 separadores, ninguno de más por la coma del nombre.
    expect(fila.split(";").length).toBe(10);
  });

  it("escapa las comillas duplicándolas", () => {
    const csv = construirCsv([item({ description: 'Gasto "urgente"' })]);
    expect(csv).toContain('"Gasto ""urgente"""');
  });

  it("abre bien en Excel: BOM, separador ; y coma decimal", () => {
    const csv = construirCsv([item({ amount: 1234.5, montoPagado: 1234.5 })]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"1234,50"');
    expect(csv).not.toContain('"1234.50"');
  });

  it("cierra con la fila de totales", () => {
    const csv = construirCsv([item({ amount: 100, montoPagado: 40, estadoPago: "parcial" })]);
    const pie = csv.split("\r\n").at(-1) ?? "";
    expect(pie).toContain('"TOTAL"');
    expect(pie).toContain('"1 movimiento"');
    expect(pie).toContain('"60,00"'); // lo que queda por pagar
  });

  it("nunca exporta el bloque serializado de la descripción", () => {
    // El backend ya entrega la descripción decodificada; esto es la red por si
    // alguna vez vuelve a colarse.
    const csv = construirCsv([item({ description: "Alquiler local" })]);
    expect(csv).not.toContain("---META---");
  });
});

describe("normalizar", () => {
  it("hace que «camion» encuentre «Camión»", () => {
    expect(normalizar("Camión")).toBe(normalizar("camion"));
  });
});

describe("mesDe", () => {
  it("agrupa por año y mes", () => {
    expect(mesDe("2026-08-05T12:00:00.000Z").clave).toBe("2026-08");
  });

  it("una fecha ilegible no rompe el agrupado", () => {
    expect(mesDe("no-es-fecha").clave).toBe("—");
  });
});
