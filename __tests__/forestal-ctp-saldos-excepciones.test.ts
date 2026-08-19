import { describe, expect, it } from "vitest";
import { excepcionesDeSaldo, nombresVisibles, TOPE_NOMBRES } from "@/lib/forestal/ctp-saldos-excepciones";

/** Un patio sano: nada que avisar. */
const LIMPIO = {
  materiaPrima: { pendienteM3: 0 },
  porEspecie: [{ especie: "Tornillo", saldoM3: 33.87, ingresoM3: 47.45, consumidoM3: 13.58 }],
  productos: [{ producto: "Madera aserrada · Tornillo", stock: 1.39 }],
};

describe("excepcionesDeSaldo · qué se avisa", () => {
  it("un patio sano no genera ninguna excepción", () => {
    expect(excepcionesDeSaldo(LIMPIO)).toEqual([]);
  });

  it("nombra las especies en negativo en vez de sólo contarlas", () => {
    // El aviso viejo decía «1 especie tiene saldo negativo» y obligaba a
    // recorrer la tabla para saber cuál. El nombre es la mitad del valor.
    const [e] = excepcionesDeSaldo({
      ...LIMPIO,
      porEspecie: [
        ...LIMPIO.porEspecie,
        { especie: "Panguana", saldoM3: -6.904, ingresoM3: 0, consumidoM3: 6.904 },
      ],
    });
    expect(e.clave).toBe("mp-negativa");
    expect(e.tono).toBe("error");
    expect(e.items).toEqual(["Panguana (-6.90 m³)"]);
    expect(e.magnitud).toBeCloseTo(6.904, 3);
    expect(e.ir).toBe("ingresos");
  });

  it("avisa del stock de producto negativo, que antes no tenía aviso", () => {
    // Es el mismo error que el saldo negativo de materia prima, del otro lado
    // del aserradero: se despachó más de lo que las corridas declaran producir.
    const fuera = excepcionesDeSaldo({
      ...LIMPIO,
      productos: [{ producto: "Madera aserrada · Tornillo", stock: -0.81 }],
    });
    expect(fuera.map((e) => e.clave)).toContain("stock-negativo");
    expect(fuera[0].tono).toBe("error");
    // Concordancia: el participio también se pluraliza ("1 producto
    // despachados de más" salió a pantalla antes de que alguien lo leyera).
    expect(fuera[0].titulo).toBe("1 producto despachado de más");
  });

  it("pluraliza el participio cuando son varios", () => {
    const [e] = excepcionesDeSaldo({
      ...LIMPIO,
      productos: [
        { producto: "Tablones · Tornillo", stock: -1 },
        { producto: "Tablas · Lupuna", stock: -2 },
      ],
    });
    expect(e.titulo).toBe("2 productos despachados de más");
  });

  it("un valle bajo cero es noticia; uno positivo no", () => {
    // El saldo de hoy puede cerrar en verde habiendo estado en rojo el martes:
    // eso es lo que reconstruye un fiscalizador y sólo lo sabe la curva.
    const conRojo = excepcionesDeSaldo({ ...LIMPIO, valleDelPeriodo: { fecha: "2026-07-23", saldo: -4.7074 } });
    expect(conRojo.map((e) => e.clave)).toContain("valle-negativo");
    expect(conRojo[0].titulo).toContain("23 jul");

    const sinRojo = excepcionesDeSaldo({ ...LIMPIO, valleDelPeriodo: { fecha: "2026-07-23", saldo: 12.5 } });
    expect(sinRojo.map((e) => e.clave)).not.toContain("valle-negativo");
  });

  it("la fecha del valle se lee en UTC (si no, se corre un día en Lima)", () => {
    // Las fechas del libro son date-only a medianoche UTC; leerlas en hora de
    // Lima (UTC−5) devolvería el día anterior.
    const [e] = excepcionesDeSaldo({ ...LIMPIO, valleDelPeriodo: { fecha: "2026-01-01", saldo: -1 } });
    expect(e.titulo).toContain("1 ene");
  });

  it("el volumen sin validar avisa y lleva a Ingresos", () => {
    const [e] = excepcionesDeSaldo({ ...LIMPIO, materiaPrima: { pendienteM3: 29.95 } });
    expect(e.clave).toBe("sin-validar");
    expect(e.titulo).toContain("29.95 m³");
    expect(e.ir).toBe("ingresos");
  });

  it("una especie con +90% consumido avisa que hay que reponer", () => {
    const fuera = excepcionesDeSaldo({
      ...LIMPIO,
      porEspecie: [{ especie: "Lupuna", saldoM3: 0.5, ingresoM3: 10, consumidoM3: 9.5 }],
    });
    const agotarse = fuera.find((e) => e.clave === "por-agotarse");
    expect(agotarse?.tono).toBe("info");
    expect(agotarse?.items).toEqual(["Lupuna (queda 0.50 m³)"]);
  });

  it("una especie agotada del todo NO avisa: no es stock por reponer, es una que no se trabaja", () => {
    const fuera = excepcionesDeSaldo({
      ...LIMPIO,
      porEspecie: [{ especie: "Lupuna", saldoM3: 0, ingresoM3: 10, consumidoM3: 10 }],
    });
    expect(fuera.map((e) => e.clave)).not.toContain("por-agotarse");
  });

  it("los errores van primero y, dentro del mismo tono, manda la magnitud", () => {
    const fuera = excepcionesDeSaldo({
      materiaPrima: { pendienteM3: 100 },
      porEspecie: [
        { especie: "Panguana", saldoM3: -0.5, ingresoM3: 0, consumidoM3: 0.5 },
        { especie: "Lupuna", saldoM3: 0.5, ingresoM3: 10, consumidoM3: 9.5 },
      ],
      productos: [{ producto: "Tablones · Tornillo", stock: -40 }],
      valleDelPeriodo: { fecha: "2026-07-23", saldo: -4 },
    });
    expect(fuera.map((e) => e.clave)).toEqual([
      "stock-negativo", // error, 40
      "mp-negativa", //    error, 0.5
      "sin-validar", //    warning, 100
      "valle-negativo", // warning, 4
      "por-agotarse", //   info
    ]);
  });

  it("un saldo de −0.00001 es ruido de coma flotante, no un sobreconsumo", () => {
    // Tolerancia de negocio: un aserradero mide con cinta. Siete rojos falsos
    // por redondeo enseñan a ignorar la lista entera.
    const fuera = excepcionesDeSaldo({
      ...LIMPIO,
      porEspecie: [{ especie: "Tornillo", saldoM3: -0.00001, ingresoM3: 10, consumidoM3: 10.00001 }],
    });
    expect(fuera.map((e) => e.clave)).not.toContain("mp-negativa");
  });
});

describe("nombresVisibles · cortar sin mentir", () => {
  it("no corta cuando entran todos", () => {
    expect(nombresVisibles(["a", "b"])).toEqual({ visibles: ["a", "b"], resto: 0 });
  });

  it("dice cuántos quedaron afuera", () => {
    const items = Array.from({ length: TOPE_NOMBRES + 3 }, (_, i) => `e${i}`);
    const { visibles, resto } = nombresVisibles(items);
    expect(visibles).toHaveLength(TOPE_NOMBRES);
    expect(resto).toBe(3);
  });
});
