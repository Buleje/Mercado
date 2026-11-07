import { describe, expect, it } from "vitest";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { TipoComercial } from "@/lib/forestal/cubicacion-tipo";
import { cuentaDesdeMovimientos, destinoPorDefecto, estadoDeCuentaDeLaCarga, filasDeLaCarga, soles, type MovimientoDelCliente } from "@/lib/forestal/estado-cuenta-carga";

type P = PiezaCubicada & { tipo?: TipoComercial; precio?: number };
let n = 0;
const pieza = (cantidad: number, pieTablar: number, largo: number, tipo: TipoComercial, precio: number, especie = "Tornillo"): P => ({
  id: `p${n++}`, cantidad, espesor: 2, ancho: 6, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies",
  especie, pieTablar, m3: pieTablar / 424, tipo, precio,
});
const precioDe = (p: PiezaCubicada) => (p as P).precio ?? 0;

/* La carga de Rivers (RIV-20261029 + corta), como la armó Brandon a mano el 03-11. */
const rivers: P[] = [
  pieza(300, 5000, 10, "Comercial", 5.9),
  pieza(261, 4050.333, 8, "Comercial", 5.9),
  pieza(76, 777.5, 6, "Comercial", 4.8),
  pieza(12, 128.917, 8, "Larga angosta", 4.5),
  pieza(21, 137.25, 4, "Corta", 4.1),
];

describe("estado de cuenta de una carga", () => {
  it("cuadra el papel de Rivers: 58,271.82 − 23,000 + 8,234 + 300 = 43,805.82", () => {
    const filas = filasDeLaCarga(rivers, precioDe);
    expect(filas.map((f) => [f.tipo, f.piezas, f.pies, f.importe])).toEqual([
      ["Comercial de 8 a 10 pies", 561, 9050.333, 53396.96],
      ["Comercial de 6 pies", 76, 777.5, 3732],
      ["Larga angosta", 12, 128.917, 580.13],
      ["Corta", 21, 137.25, 562.73],
    ]);
    const e = estadoDeCuentaDeLaCarga(filas, {
      adelantos: [{ concepto: "Adelantos que dio Don Rivers", monto: 23000 }],
      cargos: [
        { concepto: "Saldo de la carga anterior", monto: 8234, nota: "Ya descontados los depósitos" },
        { concepto: "Realización de guía", monto: 300 },
        { concepto: "Flete", monto: 0 },
      ],
    });
    expect(e.piezas).toBe(670);
    expect(e.pies).toBe(10094);
    expect(e.importeCarga).toBe(58271.82);
    expect(e.saldoCarga).toBe(35271.82);
    expect(e.total).toBe(43805.82);
    expect(e.cargos).toHaveLength(2); // el de monto 0 no sale en el papel
    expect(e.enLetras).toBe("CUARENTA Y TRES MIL OCHOCIENTOS CINCO CON 82/100 SOLES");
    expect(soles(e.total)).toBe("S/ 43,805.82");
  });

  it("con una sola especie no la repite; con dos, la pone delante del tipo", () => {
    expect(filasDeLaCarga([pieza(1, 10, 8, "Corta", 4)], precioDe)[0].tipo).toBe("Corta");
    const dos = filasDeLaCarga([pieza(1, 10, 8, "Corta", 4), pieza(1, 10, 8, "Corta", 4, "Cedro")], precioDe);
    expect(dos.map((f) => f.tipo)).toEqual(["Cedro · Corta", "Tornillo · Corta"]);
  });

  it("cuenta las filas sin precio y un saldo negativo es a favor del cliente", () => {
    const filas = filasDeLaCarga([pieza(5, 100, 8, "Comercial", 0)], precioDe);
    const e = estadoDeCuentaDeLaCarga(filas, { adelantos: [{ concepto: "Adelanto", monto: 500 }], cargos: [] });
    expect(e.sinPrecio).toBe(1);
    expect(e.total).toBe(-500);
    expect(e.enLetras).toBe("QUINIENTOS CON 00/100 SOLES");
  });

  it("la cuenta del panel: lo pasado va al saldo anterior, el adelanto de la carga aparte y la misma guía no se cobra dos veces", () => {
    const mov = (fecha: string, concepto: string, monto: number, extra: Partial<MovimientoDelCliente> = {}): MovimientoDelCliente =>
      ({ fecha, concepto, referencia: null, monto, moneda: "PEN", ...extra });
    const movs = [
      mov("2026-10-01", "Carga anterior", 26234),
      mov("2026-10-05", "Depósito", -10000),
      mov("2026-10-10", "Depósito", -8000),
      mov("2026-10-28", "Adelanto recibido", -23000),
      mov("2026-10-29", "Venta de madera", 58271.82, { conceptoForestal: "venta", gtfNumber: "019-001-0000073" }),
      mov("2026-10-30", "Flete", 50, { moneda: "USD" }),
    ];
    const destinos = movs.map((m) => destinoPorDefecto(m, "019-001-0000073"));
    expect(destinos).toEqual(["anterior", "anterior", "anterior", "anterior", "fuera", "anterior"]);
    destinos[3] = "carga";
    const c = cuentaDesdeMovimientos(movs, destinos);
    expect(c.otraMoneda).toBe(1);
    expect(c.adelantos).toEqual([{ concepto: "Adelanto recibido (28/10/2026)", monto: 23000 }]);
    expect(c.cargos[0]).toEqual({ concepto: "Saldo de la cuenta anterior", monto: 8234, nota: "Ya descontados sus pagos por S/ 18,000.00" });
    const e = estadoDeCuentaDeLaCarga(filasDeLaCarga(rivers, precioDe), { adelantos: c.adelantos, cargos: [...c.cargos, { concepto: "Realización de guía", monto: 300 }] });
    expect(e.total).toBe(43805.82);
  });
});
