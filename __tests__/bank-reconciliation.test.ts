/**
 * Cuadrar con el banco (11-10): leer el extracto como lo baja el banco y cruzarlo
 * con lo del sistema en cuatro grupos.
 *
 * Antes `parseBankCsv` leía por posición y `new Date("15/10/2026")` era inválido:
 * con un extracto real del BCP ninguna fila cruzaba por fecha. Y la referencia
 * igual daba «coincide» aunque el monto fuera otro.
 */
import { describe, it, expect } from "vitest";
import {
  cuadrarConElBanco,
  leerCsv,
  leerExtracto,
  medioDigital,
  mediosDeLaCuenta,
  normalizarFecha,
  parseBankCsv,
  parseMonto,
  periodoDelExtracto,
  resumirCuadre,
  type BankRow,
  type SystemPayment,
} from "@/lib/finance/bank-reconciliation";

const BCP = [
  "Movimientos de la cuenta;;;;",
  "Cuenta Corriente Soles 191-1234567-0-12;;;;",
  ";;;;",
  "Fecha;Fecha valuta;Descripción operación;Monto;Saldo;Sucursal - agencia;Operación - Número;Operación - Hora",
  "15/10/2026;15/10/2026;YAPE DE JUAN PEREZ;25.50;15,025.50;LIMA;00123456;10:15",
  '16/10/2026;16/10/2026;"PAGO PROVEEDOR, ARROZ";-1,200.00;13,825.50;LIMA;00123457;11:00',
  "Saldo final;;;;13,825.50;;;",
].join("\r\n");

const INTERBANK = [
  "Fecha de operación,Fecha de proceso,Nro. de operación,Movimiento,Descripción,Cargo,Abono",
  "01/10/2026,01/10/2026,778899,ABONO,PLIN MARIA,,40.00",
  "02/10/2026,02/10/2026,778900,CARGO,COMISION MANTENIMIENTO,12.00,",
].join("\n");

describe("leer el extracto", () => {
  it("BCP: salta el título, reconoce las columnas por nombre, fecha dd/mm y monto con miles", () => {
    const r = leerExtracto(leerCsv(BCP));
    expect(r.formato).toBe("cabecera");
    expect(r.filas).toEqual([
      { date: "2026-10-15", description: "YAPE DE JUAN PEREZ", amount: 25.5, reference: "00123456" },
      { date: "2026-10-16", description: "PAGO PROVEEDOR, ARROZ", amount: -1200, reference: "00123457" },
    ]);
    expect(r.descartadas).toBe(1); // «Saldo final»
  });

  it("Interbank: Cargo y Abono en columnas aparte dan el monto con signo", () => {
    const r = leerExtracto(leerCsv(INTERBANK));
    expect(r.filas.map((f) => [f.date, f.amount, f.reference, f.description])).toEqual([
      ["2026-10-01", 40, "778899", "PLIN MARIA"],
      ["2026-10-02", -12, "778900", "COMISION MANTENIMIENTO"],
    ]);
  });

  it("formato simple fecha,descripción,monto,referencia (con o sin cabecera)", () => {
    expect(parseBankCsv("fecha,descripcion,monto,referencia\n2026-10-03,Venta Yape,15.00,OP1")).toEqual([
      { date: "2026-10-03", description: "Venta Yape", amount: 15, reference: "OP1" },
    ]);
    expect(parseBankCsv("2026-10-03,Venta Yape,15.00\n03/10/2026,Otra,-2.5")).toEqual([
      { date: "2026-10-03", description: "Venta Yape", amount: 15 },
      { date: "2026-10-03", description: "Otra", amount: -2.5 },
    ]);
  });

  it("celdas de Excel: Date y número de serie", () => {
    const r = leerExtracto([
      ["Fecha", "Concepto", "Importe"],
      [new Date(Date.UTC(2026, 9, 5)), "Depósito", 100],
      [46301, "Retiro", -30],
    ]);
    expect(r.filas.map((f) => [f.date, f.amount])).toEqual([
      ["2026-10-05", 100],
      ["2026-10-06", -30],
    ]);
  });

  it("montos: miles, coma decimal, paréntesis, signo al final y símbolo", () => {
    expect(parseMonto("1,234.56")).toBe(1234.56);
    expect(parseMonto("1.234,56")).toBe(1234.56);
    expect(parseMonto("-1,234")).toBe(-1234);
    expect(parseMonto("(50.00)")).toBe(-50);
    expect(parseMonto("50.00-")).toBe(-50);
    expect(parseMonto("S/ -7.10")).toBe(-7.1);
    expect(parseMonto("")).toBeNull();
    expect(parseMonto("—")).toBeNull();
  });

  it("fechas: dd/mm/aaaa, dd-mm-aa, ISO, mes en letras; inválidas = null", () => {
    expect(normalizarFecha("15/10/2026")).toBe("2026-10-15");
    expect(normalizarFecha("15-10-26")).toBe("2026-10-15");
    expect(normalizarFecha("2026-10-15T10:00")).toBe("2026-10-15");
    expect(normalizarFecha("15-oct-2026")).toBe("2026-10-15");
    expect(normalizarFecha("15SET2026")).toBe("2026-09-15");
    expect(normalizarFecha("10/15/2026")).toBe("2026-10-15"); // extracto en inglés
    expect(normalizarFecha("31/02/2026")).toBeNull();
    expect(normalizarFecha("Saldo final")).toBeNull();
  });

  it("periodo = primer y último día del extracto", () => {
    expect(periodoDelExtracto(leerExtracto(leerCsv(BCP)).filas)).toEqual({ desde: "2026-10-15", hasta: "2026-10-16" });
    expect(periodoDelExtracto([])).toBeNull();
  });
});

const b = (date: string, amount: number, reference?: string): BankRow => ({ date, description: "", amount, ...(reference ? { reference } : {}) });
const s = (id: string, date: string, amount: number, reference?: string): SystemPayment => ({ id, date, amount, ...(reference ? { reference } : {}) });

describe("cuadrar con el banco", () => {
  it("misma referencia y monto = coinciden; misma referencia y otro monto = con diferencia", () => {
    const c = cuadrarConElBanco(
      [b("2026-10-15", 25.5, "00123456"), b("2026-10-15", 99, "777")],
      [s("v1", "2026-10-14", 25.5, "123456"), s("v2", "2026-10-15", 100, "777")],
    );
    expect(c.coinciden.map((p) => p.sistema.id)).toEqual(["v1"]);
    expect(c.conDiferencia).toEqual([expect.objectContaining({ diferencia: -1 })]);
    expect(c.conDiferencia[0].sistema.id).toBe("v2");
  });

  it("cinco Yape de S/ 5 el mismo día cuadran de a uno (no quedan ambiguos)", () => {
    const banco = Array.from({ length: 5 }, () => b("2026-10-10", 5));
    const sistema = Array.from({ length: 6 }, (_, i) => s(`y${i}`, "2026-10-10", 5));
    const c = cuadrarConElBanco(banco, sistema);
    expect(c.coinciden).toHaveLength(5);
    expect(new Set(c.coinciden.map((p) => p.sistema.id)).size).toBe(5);
    expect(c.soloSistema.map((x) => x.id)).toEqual(["y5"]);
  });

  it("con varios candidatos elige el de fecha más cercana", () => {
    const c = cuadrarConElBanco([b("2026-10-10", 30)], [s("lejos", "2026-10-07", 30), s("cerca", "2026-10-11", 30)]);
    expect(c.coinciden[0].sistema.id).toBe("cerca");
  });

  it("la comisión de la tarjeta (≈4,5 %) queda «con diferencia»; más del 5 % son movimientos distintos", () => {
    const c = cuadrarConElBanco(
      [b("2026-10-12", 95.5), b("2026-10-12", 80)],
      [s("tarjeta", "2026-10-11", 100), s("otra", "2026-10-12", 90)],
    );
    expect(c.conDiferencia.map((p) => [p.sistema.id, p.diferencia])).toEqual([["tarjeta", -4.5]]);
    expect(c.soloBanco.map((x) => x.amount)).toEqual([80]);
    expect(c.soloSistema.map((x) => x.id)).toEqual(["otra"]);
  });

  it("no cruza lo que sale con lo que entra, ni a más de 3 días", () => {
    const c = cuadrarConElBanco([b("2026-10-10", -50), b("2026-10-10", 20)], [s("ingreso", "2026-10-10", 50), s("viejo", "2026-10-01", 20)]);
    expect(c.coinciden).toHaveLength(0);
    expect(c.conDiferencia).toHaveLength(0);
    expect(c.soloBanco).toHaveLength(2);
    expect(c.soloSistema).toHaveLength(2);
  });

  it("montos en céntimos: 1,13 vs 1,12 NO es el mismo monto; 1,10 vs 0,60 sí entra en el tope de S/ 0,50", () => {
    // En float 1,13 − 1,12 = 0,00999… y pasaba por «coinciden».
    const c = cuadrarConElBanco([b("2026-10-15", 1.13)], [s("v1", "2026-10-15", 1.12)]);
    expect(c.coinciden).toHaveLength(0);
    expect(c.conDiferencia).toEqual([expect.objectContaining({ diferencia: 0.01 })]);
    // 1,10 − 0,60 = 0,5000…1 en float y quedaba fuera del tope.
    const d = cuadrarConElBanco([b("2026-10-15", 1.1)], [s("v1", "2026-10-15", 0.6)]);
    expect(d.conDiferencia).toEqual([expect.objectContaining({ diferencia: 0.5 })]);
  });

  it("medios: forma única y qué se cruza contra cada cuenta", () => {
    expect(["Yape", "card", "Depósito", "efectivo", "MIXTO", null].map(medioDigital)).toEqual(["yape", "tarjeta", "deposito", null, null, null]);
    expect(mediosDeLaCuenta(null)).toBeNull();
    expect(mediosDeLaCuenta({ tipo: "BANCO_CORRIENTE", nombre: "BCP" })).toBeNull();
    expect([...(mediosDeLaCuenta({ tipo: "CAJA_FISICA", nombre: "Caja" }) ?? ["x"])]).toEqual([]);
    expect([...(mediosDeLaCuenta({ tipo: "MONEDERO_DIGITAL", nombre: "Yape del negocio" }) ?? [])]).toEqual(["yape"]);
    expect(mediosDeLaCuenta({ tipo: "MONEDERO_DIGITAL", nombre: "Billetera" })).toBeNull();
  });

  it("resumen: cantidad y monto con signo por grupo", () => {
    const c = cuadrarConElBanco(
      [b("2026-10-10", 10), b("2026-10-10", 95.5), b("2026-10-10", -7)],
      [s("a", "2026-10-10", 10), s("t", "2026-10-10", 100), s("x", "2026-10-10", 3)],
    );
    expect(resumirCuadre(c)).toEqual({
      coinciden: { cantidad: 1, monto: 10 },
      conDiferencia: { cantidad: 1, monto: -4.5 },
      soloBanco: { cantidad: 1, monto: -7 },
      soloSistema: { cantidad: 1, monto: 3 },
    });
  });
});
