import { describe, expect, it } from "vitest";
import { adelantosACsv, celdaCsv } from "@/lib/adelantos/exportar-csv";
import type { DbAdelanto } from "@/lib/db/adelantos.db";

const adel = (p: Partial<DbAdelanto> & { id: string }): DbAdelanto =>
  ({
    tenantId: "t1",
    beneficiarioId: "b1",
    modalidad: "CUENTA_CORRIENTE",
    montoAdelantado: 500,
    moneda: "PEN",
    fechaAdelanto: "2026-03-10T17:00:00.000Z",
    status: "ABIERTO",
    saldoPendiente: 200,
    totalEntregado: 300,
    entregas: [],
    entregasPactadas: [],
    createdAt: "2026-03-10T17:00:00.000Z",
    updatedAt: "2026-03-10T17:00:00.000Z",
    ...p,
  }) as DbAdelanto;

describe("celdaCsv", () => {
  it("deja pasar el texto simple sin comillas", () => {
    expect(celdaCsv("Adelanto de sueldo")).toBe("Adelanto de sueldo");
    expect(celdaCsv(1250.5)).toBe("1250.5");
  });

  it("entrecomilla lo que trae el separador", () => {
    expect(celdaCsv("uno; dos")).toBe('"uno; dos"');
  });

  it("duplica las comillas internas, que es como se escapan en CSV", () => {
    expect(celdaCsv('dijo "urgente"')).toBe('"dijo ""urgente"""');
  });

  it("entrecomilla los saltos de línea de un motivo escrito a mano", () => {
    expect(celdaCsv("linea 1\nlinea 2")).toBe('"linea 1\nlinea 2"');
  });

  it("null y undefined son celda vacía, no la palabra «null»", () => {
    expect(celdaCsv(null)).toBe("");
    expect(celdaCsv(undefined)).toBe("");
  });

  it("NO entrecomilla por una coma: el separador es ; justamente para eso", () => {
    // Excel es-PE usa la coma como decimal; con separador «,» un monto
    // «1,250.50» partiría la fila en dos columnas.
    expect(celdaCsv("S/ 1,250.50")).toBe("S/ 1,250.50");
  });
});

describe("adelantosACsv", () => {
  it("abre con BOM para que Excel no rompa las tildes", () => {
    expect(adelantosACsv([])).toMatch(/^﻿/);
  });

  it("la cabecera trae las columnas nuevas del listado", () => {
    const cabecera = adelantosACsv([]).replace(/^﻿/, "").split("\n")[0].split(";");
    expect(cabecera).toContain("Código");
    expect(cabecera).toContain("Motivo");
    expect(cabecera).toContain("Modalidad");
    expect(cabecera).toContain("Cuotas cumplidas");
  });

  it("escribe una fila por adelanto, con lo entregado y el avance calculados", () => {
    const csv = adelantosACsv([
      adel({ id: "a", codigoOperacion: "ADL-2026-0007", montoAdelantado: 500, saldoPendiente: 200 }),
    ]);
    const fila = csv.split("\n")[1].split(";");
    expect(fila[0]).toBe("ADL-2026-0007");
    expect(fila).toContain("500.00"); // adelantado
    expect(fila).toContain("300.00"); // entregado
    expect(fila).toContain("200.00"); // saldo
    expect(fila).toContain("60"); // avance %
  });

  it("cuenta las cuotas pactadas y las cumplidas", () => {
    const csv = adelantosACsv([
      adel({
        id: "b",
        modalidad: "ENTREGAS_PACTADAS",
        entregasPactadas: [
          { id: "p1", numero: 1, descripcionEsperada: "Cuota 1", valorEsperado: 250, cumplidaEn: "2026-04-01T12:00:00.000Z" },
          { id: "p2", numero: 2, descripcionEsperada: "Cuota 2", valorEsperado: 250, cumplidaEn: null },
        ],
      }),
    ]);
    const fila = csv.split("\n")[1].split(";");
    expect(fila.at(-2)).toBe("2"); // pactadas
    expect(fila.at(-1)).toBe("1"); // cumplidas
  });

  it("un motivo con punto y coma no parte la fila en columnas de más", () => {
    const csv = adelantosACsv([adel({ id: "c", notas: "insumos; flete; adelanto" })]);
    const fila = csv.split("\n")[1];
    expect(fila).toContain('"insumos; flete; adelanto"');
    // 16 columnas ⇒ 15 separadores reales fuera de las comillas.
    const fuera = fila.split('"insumos; flete; adelanto"').join("");
    expect(fuera.split(";").length - 1).toBe(15);
  });

  it("un adelanto sin código ni motivo deja celdas vacías, no «null»", () => {
    const fila = adelantosACsv([adel({ id: "d", codigoOperacion: null, notas: null })]).split("\n")[1];
    expect(fila).not.toContain("null");
    expect(fila.startsWith(";")).toBe(true);
  });
});
