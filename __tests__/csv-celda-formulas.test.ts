/**
 * Seguridad 17-10, punto 6: un texto que empieza con = + - @ llegaba a Excel
 * como fórmula en los CSV de retiros del reparto y de adelantos (sólo ponían
 * comillas). Ahora todos usan `lib/csv/celda.ts`.
 */
import { describe, expect, it } from "vitest";
import { celdaCsv, sinFormula } from "@/lib/csv/celda";
import { celdaCsv as celdaAdelantos } from "@/lib/adelantos/exportar-csv";
import { csvDeRetiros, type RetiroParaCsv } from "@/lib/delivery/retiros-conciliacion";

describe("celdaCsv común", () => {
  it.each(["=HYPERLINK(\"http://x\")", "+cmd|' /C calc'!A0", "-2+3", "@SUMA(A1)", "\tX"])(
    "«%s» sale como texto (apóstrofo delante)",
    (formula) => {
      expect(sinFormula(formula).startsWith("'")).toBe(true);
    },
  );

  it("los números (también negativos y con separadores) se dejan para que Excel sume", () => {
    expect(celdaCsv(-50)).toBe("-50");
    expect(celdaCsv("-50.00")).toBe("-50.00");
    expect(celdaCsv("-81,807")).toBe("-81,807");
    expect(celdaCsv("+5")).toBe("+5");
    expect(celdaCsv("1,250.50")).toBe("1,250.50");
  });

  it("la fórmula con ; además va entre comillas, con el apóstrofo adentro", () => {
    expect(celdaCsv("=SUMA(A1;A2)")).toBe(`"'=SUMA(A1;A2)"`);
  });

  it("texto normal, null y comillas siguen como antes", () => {
    expect(celdaCsv("Juan Pérez")).toBe("Juan Pérez");
    expect(celdaCsv(null)).toBe("");
    expect(celdaCsv('dijo "ya"')).toBe('"dijo ""ya"""');
  });

  it("adelantos reexporta la misma celda", () => {
    expect(celdaAdelantos("=1+1")).toBe("'=1+1");
  });
});

describe("CSV de retiros del reparto", () => {
  it("una nota o nombre que empieza con = no llega como fórmula", () => {
    const retiro: RetiroParaCsv = {
      id: "r1",
      partnerId: "p1",
      partnerName: "=HYPERLINK(\"http://malo\";\"clic\")",
      partnerPhone: "+cmd|' /C calc'!A0",
      yapeNumber: "987654321",
      amount: 25,
      status: "rejected",
      note: "@robo",
      createdAt: "2026-10-17T15:00:00.000Z",
      resolvedAt: null,
    };
    const csv = csvDeRetiros([retiro]);
    const fila = csv.split("\r\n")[1];
    expect(fila).toContain(`"'=HYPERLINK(""http://malo"";""clic"")"`);
    expect(fila).toContain(";'+cmd|");
    expect(fila).not.toMatch(/(^|;)[=+@]/);
  });
});
