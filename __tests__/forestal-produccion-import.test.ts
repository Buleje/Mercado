import { describe, it, expect } from "vitest";
import {
  filasDesdeTexto,
  interpretarProduccion,
  normalizarFecha,
  normalizarLinea,
} from "@/lib/forestal/produccion-import";

/**
 * Importar producción (ADR-323).
 *
 * La regla que define el módulo: una corrida importada entra SIN origen
 * atribuido, y eso se DECLARA. Adivinar de qué ingreso salió cada paquete sería
 * fabricar la trazabilidad que I1-I2 existen para proteger.
 */

describe("línea de producción", () => {
  it("normaliza las formas en que la escribe el aserradero", () => {
    expect(normalizarLinea("principal")).toEqual({ linea: "LP", reconocida: true });
    expect(normalizarLinea("LP")).toEqual({ linea: "LP", reconocida: true });
    expect(normalizarLinea("recuperación")).toEqual({ linea: "LRE", reconocida: true });
    expect(normalizarLinea("LR")).toEqual({ linea: "LRE", reconocida: true });
  });

  it("lo que no reconoce cae en LP pero se marca", () => {
    expect(normalizarLinea("tercera")).toEqual({ linea: "LP", reconocida: false });
  });

  it("vacío es LP sin marcar (es el default legítimo)", () => {
    expect(normalizarLinea("")).toEqual({ linea: "LP", reconocida: true });
  });
});

describe("fechas", () => {
  it("acepta ISO y DD/MM/AAAA", () => {
    expect(normalizarFecha("2026-07-20")).toBe("2026-07-20");
    expect(normalizarFecha("20/07/2026")).toBe("2026-07-20");
    expect(normalizarFecha("5/7/26")).toBe("2026-07-05");
  });

  it("convierte el serial de Excel sólo en rango razonable", () => {
    // 46000 ≈ 2025-12-24; un 5 suelto NO es una fecha.
    expect(normalizarFecha("46000")).toMatch(/^20\d\d-\d\d-\d\d$/);
    expect(normalizarFecha("5")).toBeNull();
    expect(normalizarFecha("")).toBeNull();
  });
});

describe("interpretar la planilla", () => {
  const cab = "Fecha\tProducto\tEspecie\tCantidad\tUnidad\tLinea\tCodigo";

  it("lee una corrida completa", () => {
    const r = interpretarProduccion(
      filasDesdeTexto(`${cab}\n20/07/2026\tMadera aserrada\tTornillo\t6.5\tm3\tprincipal\tPAQ-01`),
    );
    expect(r.errores).toEqual([]);
    expect(r.corridas[0]).toMatchObject({
      fecha: "2026-07-20",
      productType: "Madera aserrada",
      especie: "Tornillo",
      cantidad: 6.5,
      unit: "m3",
      lineaProduccion: "LP",
      codigoRaiz: "PAQ-01",
    });
    expect(r.cantidadTotal).toBe(6.5);
  });

  it("SIEMPRE declara que las corridas entran sin origen", () => {
    const r = interpretarProduccion(filasDesdeTexto(`${cab}\n20/07/2026\tX\tTornillo\t1\tm3\tLP\t`));
    expect(r.avisos.some((a) => a.includes("sin origen atribuido"))).toBe(true);
  });

  it("rechaza la fila sin fecha cuando no hay default", () => {
    const r = interpretarProduccion(filasDesdeTexto(`${cab}\n\tX\tTornillo\t1\tm3\tLP\t`));
    expect(r.corridas).toHaveLength(0);
    expect(r.errores[0]!.motivo).toMatch(/Sin fecha/);
  });

  it("usa la fecha del parte de turno cuando la planilla no la trae", () => {
    const r = interpretarProduccion(filasDesdeTexto("Producto\tCantidad\nMadera aserrada\t3"), {
      fechaPorDefecto: "2026-07-22",
    });
    expect(r.corridas[0]!.fecha).toBe("2026-07-22");
  });

  it("rechaza cantidad cero o ausente: no es una corrida", () => {
    const r = interpretarProduccion(filasDesdeTexto(`${cab}\n20/07/2026\tX\tTornillo\t0\tm3\tLP\t`));
    expect(r.corridas).toHaveLength(0);
    expect(r.errores[0]!.motivo).toMatch(/Sin cantidad/);
  });

  it("avisa cuando una línea no se reconoció (descuadra el Cuadro Resumen 3)", () => {
    const r = interpretarProduccion(filasDesdeTexto(`${cab}\n20/07/2026\tX\tTornillo\t2\tm3\ttercera\t`));
    expect(r.corridas[0]!.lineaProduccion).toBe("LP");
    expect(r.avisos.some((a) => a.includes("no se reconoció"))).toBe(true);
  });

  it("normaliza la unidad y cae en m³ cuando no la entiende", () => {
    const r = interpretarProduccion(
      filasDesdeTexto(`${cab}\n20/07/2026\tX\tTornillo\t2\tpies tablares\tLP\t\n20/07/2026\tX\tTornillo\t2\tzzz\tLP\t`),
    );
    expect(r.corridas[0]!.unit).toBe("pt");
    expect(r.corridas[1]!.unit).toBe("m3");
  });

  it("completa la especie del turno cuando la planilla no la trae", () => {
    const r = interpretarProduccion(filasDesdeTexto("Fecha\tProducto\tCantidad\n20/07/2026\tX\t4"), {
      especiePorDefecto: "Cumala",
    });
    expect(r.corridas[0]!.especie).toBe("Cumala");
  });

  it("una planilla vacía no inventa corridas", () => {
    const r = interpretarProduccion([]);
    expect(r.corridas).toEqual([]);
    expect(r.cantidadTotal).toBe(0);
  });
});
