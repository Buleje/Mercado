import { describe, expect, it } from "vitest";
import {
  contarVeredictos,
  cuadrarGuias,
  type GtfRegistrada,
  type TrozaParaCuadre,
} from "@/lib/forestal/loth-cuadre-guias";

// Datos medidos en la base de Blas (30-09-2026).
const troza = (code: string, gtf: string | null, volumenM3: number | null): TrozaParaCuadre => ({
  code,
  gtf,
  volumenM3,
  estado: gtf ? "despachada" : "disponible",
});

const GTF_BLAS: GtfRegistrada = {
  gtfNumber: "019-0000002",
  gtfDate: "2026-09-29T00:00:00.000Z",
  volumenTotalM3: "6.6102",
  piezasTotal: 2,
  placaVehiculo: "W2D-835",
  status: "emitida",
};

const TROZAS_BLAS = [
  troza("111-A", "019-0000002", 4.951),
  troza("113-A", "019-0000002", 1.659),
  troza("001-TOR-A", "001-0045678", 3.2),
  troza("200-A", null, 2), // en patio: no cita guía, no entra al cruce
];

describe("cuadrarGuias · datos de Blas", () => {
  const filas = cuadrarGuias(TROZAS_BLAS, [GTF_BLAS]);
  const por = (n: string) => filas.find((f) => f.gtf === n)!;

  it("019-0000002 cuadra: 4,951 + 1,659 = 6,610 vs 6,6102", () => {
    const f = por("019-0000002");
    expect(f.veredicto).toBe("cuadra");
    expect(f.libroM3).toBe(6.61);
    expect(f.declaradoM3).toBe(6.6102);
    expect(f.diferenciaM3).toBe(-0.0002);
    expect(f.libroTrozas).toBe(2);
    expect(f.piezasCuadran).toBe(true);
    expect(f.placa).toBe("W2D-835");
    expect(f.codigos).toEqual(["111-A", "113-A"]);
  });

  it("001-0045678 está citada en el libro y no existe entre las emitidas", () => {
    const f = por("001-0045678");
    expect(f.veredicto).toBe("citada_sin_registrar");
    expect(f.declaradoM3).toBeNull();
    expect(f.diferenciaM3).toBeNull();
    expect(f.libroM3).toBe(3.2);
  });

  it("lo que no cuadra va primero y la troza en patio no genera fila", () => {
    expect(filas.map((f) => f.gtf)).toEqual(["001-0045678", "019-0000002"]);
  });
});

describe("cuadrarGuias · bordes", () => {
  it("no cuadra cuando falta una troza (4,951 vs 6,6102)", () => {
    const [f] = cuadrarGuias([troza("111-A", "019-0000002", 4.951)], [GTF_BLAS]);
    expect(f.veredicto).toBe("no_cuadra");
    expect(f.diferenciaM3).toBe(-1.6592);
    expect(f.piezasCuadran).toBe(false);
  });

  it("la tolerancia es 0,01 m³ inclusive; 0,011 ya no cuadra", () => {
    const g = { ...GTF_BLAS, volumenTotalM3: "5.0000", piezasTotal: 1 };
    expect(cuadrarGuias([troza("A", "019-0000002", 5.01)], [g])[0].veredicto).toBe("cuadra");
    expect(cuadrarGuias([troza("A", "019-0000002", 4.99)], [g])[0].veredicto).toBe("cuadra");
    expect(cuadrarGuias([troza("A", "019-0000002", 5.011)], [g])[0].veredicto).toBe("no_cuadra");
  });

  it("guía registrada que ninguna línea del libro cita", () => {
    const [f] = cuadrarGuias([], [GTF_BLAS]);
    expect(f.veredicto).toBe("registrada_sin_trozas");
    expect(f.libroTrozas).toBe(0);
    expect(f.diferenciaM3).toBeNull();
    expect(f.piezasCuadran).toBeNull();
  });

  it("una troza sin volumen no suma 0: el veredicto es «sin volumen»", () => {
    const [f] = cuadrarGuias(
      [troza("111-A", "019-0000002", 4.951), troza("113-A", "019-0000002", null)],
      [GTF_BLAS],
    );
    expect(f.veredicto).toBe("sin_volumen");
    expect(f.sinVolumen).toBe(1);
    expect(f.diferenciaM3).toBeNull();
  });

  it("guía sin volumen declarado tampoco se cuadra", () => {
    const [f] = cuadrarGuias([troza("A", "019-0000002", 1)], [{ ...GTF_BLAS, volumenTotalM3: null }]);
    expect(f.veredicto).toBe("sin_volumen");
  });

  it("citar una guía anulada se marca aparte", () => {
    const [f] = cuadrarGuias(
      [troza("111-A", "019-0000002", 6.61)],
      [{ ...GTF_BLAS, status: "anulada" }],
    );
    expect(f.veredicto).toBe("anulada_citada");
  });

  it("una anulada no tapa a la emitida con el mismo N°", () => {
    const [f] = cuadrarGuias(
      [troza("111-A", "019-0000002", 6.61)],
      [{ ...GTF_BLAS, status: "anulada" }, GTF_BLAS],
    );
    expect(f.veredicto).toBe("cuadra");
  });

  it("el N° se compara sin espacios ni mayúsculas", () => {
    const [f] = cuadrarGuias([troza("A", " 019-0000002 ", 6.61)], [GTF_BLAS]);
    expect(f.gtf).toBe("019-0000002");
    expect(f.veredicto).toBe("cuadra");
  });

  it("contarVeredictos suma por veredicto", () => {
    const filas = cuadrarGuias(
      [troza("111-A", "019-0000002", 6.61), troza("X", "001-0045678", 3)],
      [GTF_BLAS],
    );
    const c = contarVeredictos(filas);
    expect(c.cuadra).toBe(1);
    expect(c.citada_sin_registrar).toBe(1);
    expect(c.no_cuadra).toBe(0);
  });
});
