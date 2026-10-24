import { describe, expect, it } from "vitest";
import { filasDeAserrada, filasDeTrozas, paraGrafico, resumir } from "@/lib/forestal/ctp-saldos-vista";

const ESPECIES = [
  { especie: "Tornillo", scientific: "Cedrelinga", cites: false, ingresoM3: 100, consumidoM3: 40, saldoM3: 60 },
  { especie: "Shihuahuaco", scientific: "Dipteryx", cites: true, ingresoM3: 50, consumidoM3: 48, saldoM3: 2 },
  { especie: "Copaiba", scientific: "Copaifera", cites: false, ingresoM3: 30, consumidoM3: 35, saldoM3: -5 },
];

describe("filasDeTrozas", () => {
  it("ordena por disponible: «¿de qué tengo más?» se ve arriba", () => {
    expect(filasDeTrozas(ESPECIES).map((f) => f.nombre)).toEqual(["Tornillo", "Shihuahuaco", "Copaiba"]);
  });

  it("el peso se calcula sobre el disponible POSITIVO", () => {
    // Si una especie está en −5 y otra en +60, el disponible real es 62, no 57:
    // un negativo es un error a corregir, no madera que descuente de otra.
    const f = filasDeTrozas(ESPECIES);
    expect(f[0].pesoPct).toBe(96.8); // 60 de 62
    expect(f[1].pesoPct).toBe(3.2);
  });

  it("marca el negativo y el CITES sin que resten al total", () => {
    const f = filasDeTrozas(ESPECIES);
    expect(f.find((x) => x.nombre === "Copaiba")!.negativo).toBe(true);
    expect(f.find((x) => x.nombre === "Shihuahuaco")!.cites).toBe(true);
  });

  it("el usado se topea en 100: consumir de más no da 116%", () => {
    expect(filasDeTrozas(ESPECIES).find((x) => x.nombre === "Copaiba")!.usadoPct).toBe(100);
  });

  it("sin ingreso no hay porcentaje usado: 0, no división por cero", () => {
    const f = filasDeTrozas([{ especie: "X", ingresoM3: 0, consumidoM3: 0, saldoM3: 0 }]);
    expect(f[0].usadoPct).toBe(0);
  });
});

describe("filasDeAserrada", () => {
  it("usa producido y despachado, que es lo que tiene el depósito", () => {
    const f = filasDeAserrada([
      { producto: "TABLA", producido: 20, despachado: 5, stock: 15 },
      { producto: "CUARTÓN", producido: 10, despachado: 9, stock: 1 },
    ]);
    expect(f[0]).toMatchObject({ nombre: "TABLA", disponible: 15, usadoPct: 25 });
    expect(f[1].usadoPct).toBe(90);
  });
});

describe("resumir · lo que responde la pregunta del dueño", () => {
  const r = resumir(filasDeTrozas(ESPECIES));

  it("suma sólo lo disponible de verdad", () => {
    expect(r.disponibleM3).toBe(62);
    expect(r.conStock).toBe(2);
    expect(r.totalFilas).toBe(3);
    expect(r.enNegativo).toBe(1);
  });

  it("nombra la principal sin que haya que buscarla", () => {
    expect(r.principal).toMatchObject({ nombre: "Tornillo", disponible: 60 });
  });

  it("avisa lo que está por agotarse, no lo que ya se agotó", () => {
    // Shihuahuaco usó 96% y todavía tiene 2 m³: hay que reponer.
    expect(r.porAgotarse).toEqual(["Shihuahuaco"]);
  });

  it("una lista vacía no rompe ni inventa una principal", () => {
    const v = resumir([]);
    expect(v).toMatchObject({ disponibleM3: 0, principal: null, porAgotarse: [] });
  });
});

describe("paraGrafico", () => {
  const muchas = Array.from({ length: 12 }, (_, i) => ({
    especie: `E${i}`,
    ingresoM3: 100 - i,
    consumidoM3: 0,
    saldoM3: 100 - i,
  }));

  it("agrupa la cola: 40 barras son ilegibles", () => {
    const g = paraGrafico(filasDeTrozas(muchas), 8);
    expect(g).toHaveLength(8);
    expect(g[7].nombre).toBe("Otras 5");
  });

  it("el grupo «otras» conserva el volumen: el gráfico no miente", () => {
    const g = paraGrafico(filasDeTrozas(muchas), 8);
    const totalG = g.reduce((s, x) => s + x.valor, 0);
    const totalReal = muchas.reduce((s, e) => s + e.saldoM3, 0);
    expect(totalG).toBeCloseTo(totalReal, 2);
  });

  it("con pocas filas no agrupa nada", () => {
    expect(paraGrafico(filasDeTrozas(ESPECIES), 8)).toHaveLength(2); // sin la negativa
  });
});
