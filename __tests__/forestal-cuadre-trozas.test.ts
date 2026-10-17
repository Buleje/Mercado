import { describe, expect, it } from "vitest";
import { cuadreDeIngreso, descuadra, TOLERANCIA_M3 } from "@/lib/forestal/cuadre-trozas";

/**
 * El cuadre lo leen dos pantallas (la tabla del libro y la lista de trozas
 * dentro del ingreso). Lo que se protege acá es que la regla sea UNA: el bug
 * que motivó el helper fue justamente que cada una respondiera distinto.
 */
describe("cuadreDeIngreso", () => {
  it("sin piezas cargadas no opina: un ingreso viejo sin detalle no está mal", () => {
    expect(cuadreDeIngreso(10, null, 0).estado).toBe("sin-piezas");
    // Con piezas pero ninguna con volumen tampoco hay con qué comparar.
    expect(cuadreDeIngreso(10, null, 5).estado).toBe("sin-piezas");
  });

  it("sin volumen declarado tampoco: no se compara contra un dato que no existe", () => {
    expect(cuadreDeIngreso(null, 5, 3).estado).toBe("sin-piezas");
    expect(cuadreDeIngreso(0, 5, 3).estado).toBe("sin-piezas");
  });

  it("cuadra cuando las piezas suman lo declarado", () => {
    const c = cuadreDeIngreso(13.939, 13.939, 4);
    expect(c.estado).toBe("cuadra");
    expect(descuadra(c)).toBe(false);
  });

  it("avisa cuánto falta por detallar", () => {
    const c = cuadreDeIngreso(10, 5, 6);
    expect(c.estado).toBe("faltan");
    expect(descuadra(c) && c.aviso).toBe("faltan 5.000 m³ por detallar");
  });

  it("avisa también cuando las piezas se pasan del ingreso", () => {
    const c = cuadreDeIngreso(5, 8.25, 9);
    expect(c.estado).toBe("sobran");
    expect(descuadra(c) && c.aviso).toBe("3.250 m³ de más en las piezas");
  });

  /**
   * La tolerancia es el redondeo de SERFOR (4 decimales), no un margen de
   * cortesía: 0.002 es una diferencia real y tiene que verse. Si alguien la
   * afloja "para que no moleste", este test se cae.
   */
  it("perdona el redondeo de SERFOR pero no una diferencia real", () => {
    expect(cuadreDeIngreso(10, 10 - TOLERANCIA_M3, 3).estado).toBe("cuadra");
    expect(cuadreDeIngreso(10, 9.998, 3).estado).toBe("faltan");
  });

  /**
   * Los volúmenes vienen de sumar decimales de Postgres: sin redondear, un
   * 0.1 + 0.2 clásico haría que un ingreso perfecto dijera "faltan 0.0000 m³".
   */
  it("no inventa descuadre por el error de coma flotante", () => {
    expect(cuadreDeIngreso(0.3, 0.1 + 0.2, 2).estado).toBe("cuadra");
  });
});
