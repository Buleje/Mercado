import { describe, expect, it } from "vitest";
import {
  avanceDe,
  ordenarAdelantos,
  paginar,
  siguienteOrden,
} from "@/lib/adelantos/ordenar-lista";
import type { DbAdelanto } from "@/lib/db/adelantos.db";

/** Un adelanto mínimo: sólo lo que el orden mira. */
const adel = (p: Partial<DbAdelanto> & { id: string }): DbAdelanto =>
  ({
    tenantId: "t1",
    beneficiarioId: "b1",
    modalidad: "CUENTA_CORRIENTE",
    montoAdelantado: 100,
    moneda: "PEN",
    fechaAdelanto: "2026-01-01T12:00:00.000Z",
    status: "ABIERTO",
    saldoPendiente: 100,
    totalEntregado: 0,
    entregas: [],
    entregasPactadas: [],
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
    ...p,
  }) as DbAdelanto;

const ids = (xs: DbAdelanto[]) => xs.map((x) => x.id);

describe("avanceDe", () => {
  it("es el porcentaje liquidado", () => {
    expect(avanceDe(adel({ id: "a", montoAdelantado: 200, saldoPendiente: 50 }))).toBe(75);
    expect(avanceDe(adel({ id: "b", montoAdelantado: 200, saldoPendiente: 200 }))).toBe(0);
    expect(avanceDe(adel({ id: "c", montoAdelantado: 200, saldoPendiente: 0 }))).toBe(100);
  });

  it("un adelanto EXCEDIDO (saldo negativo) no pasa de 100", () => {
    expect(avanceDe(adel({ id: "d", montoAdelantado: 100, saldoPendiente: -40 }))).toBe(100);
  });

  it("no divide por cero", () => {
    expect(avanceDe(adel({ id: "e", montoAdelantado: 0, saldoPendiente: 0 }))).toBe(0);
  });
});

describe("ordenarAdelantos", () => {
  const lista = [
    adel({ id: "vieja", fechaAdelanto: "2026-01-05T12:00:00.000Z", montoAdelantado: 900, saldoPendiente: 900, codigoOperacion: "ADL-2026-0002" }),
    adel({ id: "nueva", fechaAdelanto: "2026-03-01T12:00:00.000Z", montoAdelantado: 100, saldoPendiente: 20, codigoOperacion: "ADL-2026-0010" }),
    adel({ id: "media", fechaAdelanto: "2026-02-01T12:00:00.000Z", montoAdelantado: 500, saldoPendiente: 500, codigoOperacion: "ADL-2026-0009" }),
  ];

  it("no muta el arreglo original", () => {
    const copia = [...lista];
    ordenarAdelantos(lista, "monto", "asc");
    expect(lista).toEqual(copia);
  });

  it("ordena por fecha en los dos sentidos", () => {
    expect(ids(ordenarAdelantos(lista, "fecha", "desc"))).toEqual(["nueva", "media", "vieja"]);
    expect(ids(ordenarAdelantos(lista, "fecha", "asc"))).toEqual(["vieja", "media", "nueva"]);
  });

  it("ordena por monto y por saldo", () => {
    expect(ids(ordenarAdelantos(lista, "monto", "desc"))).toEqual(["vieja", "media", "nueva"]);
    expect(ids(ordenarAdelantos(lista, "saldo", "asc"))).toEqual(["nueva", "media", "vieja"]);
  });

  it("el código correlativo ordena como número aunque sea texto", () => {
    // 0002 < 0009 < 0010: comparar como texto sólo funciona con los ceros.
    expect(ids(ordenarAdelantos(lista, "codigo", "asc"))).toEqual(["vieja", "media", "nueva"]);
  });

  it("los adelantos sin código van al final, no arriba", () => {
    const conHuerfano = [...lista, adel({ id: "sin-codigo", codigoOperacion: null })];
    expect(ids(ordenarAdelantos(conHuerfano, "codigo", "asc")).at(-1)).toBe("sin-codigo");
  });

  it("ordena por persona respetando el alfabeto español", () => {
    const personas = [
      adel({ id: "z", beneficiario: { nombre: "Zoila" } as never }),
      adel({ id: "n", beneficiario: { nombre: "Ñato" } as never }),
      adel({ id: "a", beneficiario: { nombre: "Ana" } as never }),
    ];
    expect(ids(ordenarAdelantos(personas, "persona", "asc"))).toEqual(["a", "n", "z"]);
  });

  it("por estado pone primero lo que hay que atender", () => {
    const estados = [
      adel({ id: "cancelado", status: "CANCELADO" }),
      adel({ id: "liquidado", status: "LIQUIDADO" }),
      adel({ id: "abierto", status: "ABIERTO" }),
    ];
    expect(ids(ordenarAdelantos(estados, "estado", "asc"))).toEqual(["abierto", "liquidado", "cancelado"]);
  });

  it("desempata SIEMPRE por fecha: dos filas iguales no bailan entre renders", () => {
    const empatados = [
      adel({ id: "vieja", montoAdelantado: 100, fechaAdelanto: "2026-01-01T12:00:00.000Z" }),
      adel({ id: "nueva", montoAdelantado: 100, fechaAdelanto: "2026-05-01T12:00:00.000Z" }),
    ];
    expect(ids(ordenarAdelantos(empatados, "monto", "asc"))).toEqual(["nueva", "vieja"]);
    expect(ids(ordenarAdelantos([...empatados].reverse(), "monto", "asc"))).toEqual(["nueva", "vieja"]);
  });
});

describe("siguienteOrden", () => {
  it("la misma columna invierte el sentido", () => {
    expect(siguienteOrden({ columna: "monto", direccion: "desc" }, "monto")).toEqual({ columna: "monto", direccion: "asc" });
    expect(siguienteOrden({ columna: "monto", direccion: "asc" }, "monto")).toEqual({ columna: "monto", direccion: "desc" });
  });

  it("el texto arranca de la A; los números y fechas, de mayor a menor", () => {
    expect(siguienteOrden({ columna: "fecha", direccion: "desc" }, "persona").direccion).toBe("asc");
    expect(siguienteOrden({ columna: "fecha", direccion: "desc" }, "codigo").direccion).toBe("asc");
    expect(siguienteOrden({ columna: "persona", direccion: "asc" }, "monto").direccion).toBe("desc");
    expect(siguienteOrden({ columna: "persona", direccion: "asc" }, "fecha").direccion).toBe("desc");
  });
});

describe("paginar", () => {
  const items = Array.from({ length: 57 }, (_, i) => i + 1);

  it("corta la página pedida y cuenta el rango que se está viendo", () => {
    expect(paginar(items, 1, 25)).toMatchObject({ pagina: 1, desde: 1, hasta: 25, total: 57, totalPaginas: 3 });
    expect(paginar(items, 3, 25)).toMatchObject({ pagina: 3, desde: 51, hasta: 57 });
    expect(paginar(items, 3, 25).items).toEqual([51, 52, 53, 54, 55, 56, 57]);
  });

  it("acota la página fuera de rango en vez de devolver una tabla vacía", () => {
    // El caso real: estabas en la 5 y filtraste hasta que quedaron 12 filas.
    expect(paginar(items.slice(0, 12), 5, 25)).toMatchObject({ pagina: 1, desde: 1, hasta: 12 });
    expect(paginar(items, 0, 25).pagina).toBe(1);
    expect(paginar(items, -3, 25).pagina).toBe(1);
    expect(paginar(items, Number.NaN, 25).pagina).toBe(1);
  });

  it("una lista vacía es una página vacía, no cero páginas", () => {
    expect(paginar([], 1, 25)).toMatchObject({ items: [], pagina: 1, totalPaginas: 1, desde: 0, hasta: 0, total: 0 });
  });

  it("un total exacto no inventa una página de más", () => {
    expect(paginar(items.slice(0, 50), 1, 25).totalPaginas).toBe(2);
  });
});
