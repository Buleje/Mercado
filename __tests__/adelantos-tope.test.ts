import { describe, expect, it } from "vitest";
import { estadoDeCredito } from "@/lib/adelantos/limite-credito";
import { conviene, soles, textoDeTope, topeSugerido } from "@/lib/adelantos/tope";
import { cuerpoPatch, faltanDatos, queFalta } from "@/lib/adelantos/datos-persona";
import { cumpleFiltro } from "@/lib/adelantos/ordenar-personas";

const ad = (monto: number, status: string, extra: Record<string, unknown> = {}) => ({
  montoAdelantado: monto,
  saldoPendiente: status === "LIQUIDADO" ? 0 : monto,
  status,
  ...extra,
});

describe("soles", () => {
  it("sin ceros sobrantes y con miles", () => {
    expect(soles(1000)).toBe("S/ 1,000");
    expect(soles(600.5)).toBe("S/ 600.50");
  });
});

describe("textoDeTope", () => {
  it("sin tope no dice nada", () => expect(textoDeTope(estadoDeCredito(null, 100))).toBeNull());
  it("holgado: cuánto más puede pedir", () => {
    expect(textoDeTope(estadoDeCredito(1000, 400))?.texto).toBe("Puede pedir S/ 600 más · tope S/ 1,000");
  });
  it("justo en el tope", () => {
    const t = textoDeTope(estadoDeCredito(1000, 1000));
    expect(t?.tono).toBe("atencion");
    expect(t?.texto).toContain("Ya no puede pedir más");
  });
  it("pasado: dice por cuánto", () => {
    expect(textoDeTope(estadoDeCredito(1000, 1300))?.texto).toBe("Pasó su tope por S/ 300 · tope S/ 1,000");
  });
});

describe("topeSugerido", () => {
  it("el más alto que devolvió completo, sólo soles y dados", () => {
    const s = topeSugerido([
      ad(500, "LIQUIDADO"),
      ad(900, "LIQUIDADO"),
      ad(5000, "ABIERTO"),
      ad(7000, "CANCELADO"),
      ad(3000, "LIQUIDADO", { moneda: "USD" }),
      ad(4000, "LIQUIDADO", { direccion: "RECIBIDO" }),
    ]);
    expect(s?.monto).toBe(900);
    expect(s?.basadoEn).toBe(2);
  });
  it("sin historia no sugiere", () => expect(topeSugerido([ad(500, "ABIERTO")])).toBeNull());
  it("no ofrece «Usar» si ya es ese tope", () => {
    const s = topeSugerido([ad(900, "LIQUIDADO")]);
    expect(conviene(s, 900)).toBe(false);
    expect(conviene(s, null)).toBe(true);
  });
});

describe("datos de la persona", () => {
  it("qué falta", () => {
    expect(faltanDatos({ telefono: "", documento: "123" })).toBe(true);
    expect(queFalta({ telefono: null, documento: null })).toEqual(["DNI/RUC", "teléfono"]);
    expect(faltanDatos({ telefono: "987654321", documento: "12345678" })).toBe(false);
  });
  it("filtros", () => {
    const p = { nombre: "A", saldoPendiente: {}, totalAdelantado: {}, totalEntregado: {}, telefono: null, documento: "1" } as never;
    expect(cumpleFiltro(p, "sin-telefono")).toBe(true);
    expect(cumpleFiltro(p, "faltan-datos")).toBe(true);
  });
  it("el PATCH conserva el resto de la ficha", () => {
    const b = cuerpoPatch({ nombre: " Ana ", documento: "12345678", limiteCredito: 1000, notas: "x", banco: "BCP" }, { telefono: " 987654321 " });
    expect(b).toMatchObject({ nombre: "Ana", documento: "12345678", telefono: "987654321", limiteCredito: 1000, notas: "x", banco: "BCP" });
  });
  it("el padrón sólo completa lo vacío y demo no verifica", () => {
    const real = cuerpoPatch({ nombre: "A", direccion: "Mi casa" }, { documento: "1234 5678", padron: { tipo: "DNI", direccion: "Otra", distrito: "Callería" } });
    expect(real).toMatchObject({ documento: "12345678", direccion: "Mi casa", distrito: "Callería", tipoDocumento: "DNI" });
    expect(real.verificadoEn).toBeTruthy();
    const demo = cuerpoPatch({ nombre: "A" }, { documento: "12345678", padron: { tipo: "DNI", demo: true } });
    expect(demo.verificadoEn).toBeNull();
  });
});

describe("cuerpoPatch con tope", () => {
  it("cambia sólo el tope y deja el teléfono", () => {
    const b = cuerpoPatch({ nombre: "A", telefono: "987654321", limiteCredito: 500 }, { limiteCredito: 900 });
    expect(b).toMatchObject({ limiteCredito: 900, telefono: "987654321" });
  });
});
