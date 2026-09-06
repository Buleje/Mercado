/**
 * El patio físico no desaparece porque el m³ del libro quede en negativo.
 *
 * Caso real del tenant forestal (verificado contra el endpoint el 2026-09-05):
 *
 *     porEspecie[0] = { especie: "TORNILLO", ingresoM3: 32.933,
 *                       consumidoM3: 114.74, saldoM3: -81.807,
 *                       piezasDisponibles: 57 }
 *
 * Son dos cuentas distintas y las dos están bien: el m³ resta el consumo contra
 * el ingreso VALIDADO —y esa planta declaró producción sobre inventario de
 * apertura—, mientras que `piezasDisponibles` cuenta trozas que se pueden
 * mandar a la sierra hoy. El bug era de la pantalla, que con una sola lectura
 * afirmaba «No hay rolliza en el patio» sobre 57 trozas paradas, y a dos
 * bloques de distancia mostraba esas mismas piezas en Antigüedad.
 *
 * Acá se fijan las dos piezas puras que sostienen la corrección.
 */
import { describe, expect, it } from "vitest";

import {
  composicionPiezas,
  composicionSaldo,
  type EspecieSaldo,
} from "@/lib/forestal/ctp-saldos-analisis";
import { filasDeTrozas, resumir, type SaldoEspecie } from "@/lib/forestal/ctp-saldos-vista";

/**
 * La fixture cumple los DOS contratos a la vez porque los dos módulos la ven:
 * la vista (`SaldoEspecie`, con `cites`/`pendienteM3` opcionales) y el análisis
 * (`EspecieSaldo`, que los exige). Tipar sólo con el laxo compila en la vista y
 * revienta al pasarla a la dona — que es exactamente el camino que se testea.
 */
const tornillo: SaldoEspecie & EspecieSaldo = {
  especie: "TORNILLO",
  scientific: "Cedrelinga cateniformis",
  cites: false,
  ingresoM3: 32.933,
  consumidoM3: 114.74,
  saldoM3: -81.807,
  pendienteM3: 0,
  ingresosCount: 3,
  piezasDisponibles: 57,
};

describe("resumir: piezas físicas vs. m³ disponible", () => {
  const r = resumir(filasDeTrozas([tornillo]));

  it("el m³ disponible es 0: un saldo negativo no es stock", () => {
    expect(r.disponibleM3).toBe(0);
    expect(r.conStock).toBe(0);
    expect(r.enNegativo).toBe(1);
  });

  it("`piezas` sigue contando sólo las filas positivas — no cambió", () => {
    expect(r.piezas).toBe(0);
  });

  it("`piezasTotales` SÍ ve las 57 trozas: es el conteo del patio", () => {
    expect(r.piezasTotales).toBe(57);
  });

  it("hay una fila que mostrar aunque no haya volumen: es la que hay que corregir", () => {
    // El gate de la pantalla pasó de `resumir().principal` a `filas.length`.
    expect(r.principal).toBeNull();
    expect(filasDeTrozas([tornillo])).toHaveLength(1);
  });
});

describe("composición: m³ primero, piezas de repuesto", () => {
  it("sin m³ positivo no hay dona que dibujar", () => {
    expect(composicionSaldo([tornillo])).toHaveLength(0);
  });

  it("las piezas sí dan una rebanada, con el conteo entero", () => {
    const p = composicionPiezas([tornillo]);
    expect(p).toEqual([{ name: "TORNILLO", value: 57, especies: 1 }]);
  });

  it("una especie sin piezas no inventa rebanada", () => {
    expect(composicionPiezas([{ ...tornillo, piezasDisponibles: 0 }])).toHaveLength(0);
    // Y el campo es opcional: los saldos cacheados de antes no lo traen.
    expect(composicionPiezas([{ ...tornillo, piezasDisponibles: undefined }])).toHaveLength(0);
  });

  it("con saldo positivo manda el m³ y las piezas quedan de lado", () => {
    const conSaldo = { ...tornillo, consumidoM3: 10, saldoM3: 22.933 };
    expect(composicionSaldo([conSaldo])).toEqual([{ name: "TORNILLO", value: 22.93, especies: 1 }]);
  });

  it("agrupa la cola en «Otras» igual que el m³, y suma piezas enteras", () => {
    const especies = Array.from({ length: 8 }, (_, i) => ({
      ...tornillo,
      especie: `ESP-${i}`,
      piezasDisponibles: 10 - i,
    }));
    const p = composicionPiezas(especies, 3);
    expect(p).toHaveLength(3);
    expect(p[2]).toEqual({ name: "Otras", value: 8 + 7 + 6 + 5 + 4 + 3, especies: 6 });
  });
});
