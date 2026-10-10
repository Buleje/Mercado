import { describe, expect, it } from "vitest";
import { cascadaDeFila, cascadaDelPlan } from "@/lib/forestal/loth-saldo-cascada";
import { computeBalance } from "@/lib/forestal/loth-constants";

const fila = (o: Partial<Parameters<typeof cascadaDeFila>[0]> = {}) => ({
  species: "Bolaina", cites: false, autorizado: 100, talado: 0, trozado: 0, movilizado: 0, consumido: 0, ...o,
});

describe("cascadaDeFila — dónde está el volumen registrado", () => {
  it("sin procesos, todo está en pie", () => {
    const c = cascadaDeFila(fila());
    expect(c.enPieM3).toBe(100);
    expect(c.taladoSinTrozarM3).toBe(0);
    expect(c.enPatioM3).toBe(0);
    expect(c.pctTalado).toBe(0);
  });

  it("cada proceso descuenta de la etapa anterior", () => {
    const c = cascadaDeFila(fila({ talado: 40, trozado: 30, movilizado: 12, consumido: 3 }));
    expect(c.enPieM3).toBe(60);
    expect(c.taladoSinTrozarM3).toBe(10);
    expect(c.enPatioM3).toBe(15);
    expect(c.despachadoM3).toBe(12);
    expect(c.consumidoM3).toBe(3);
    // en pie + sin trozar + patio + despachado + consumido = registrado (sin merma)
    expect(c.enPieM3 + c.taladoSinTrozarM3 + c.enPatioM3 + c.despachadoM3 + c.consumidoM3).toBe(100);
    expect(c.pctTalado).toBe(40);
    expect(c.excedido).toBe(false);
  });

  it("talar de más deja el en pie negativo y lo marca", () => {
    const c = cascadaDeFila(fila({ talado: 100.5 }));
    expect(c.enPieM3).toBe(-0.5);
    expect(c.excedido).toBe(true);
  });

  it("una diferencia de redondeo bajo 0,01 m³ no es exceso", () => {
    expect(cascadaDeFila(fila({ talado: 100.004 })).excedido).toBe(false);
  });

  it("sin base no inventa un porcentaje", () => {
    expect(cascadaDeFila(fila({ autorizado: 0, talado: 5 })).pctTalado).toBeNull();
  });
});

describe("cascadaDelPlan", () => {
  it("el patio del total no compensa una especie con otra", () => {
    const p = cascadaDelPlan([
      fila({ species: "A", talado: 10, trozado: 10, movilizado: 0 }), // 10 en patio
      fila({ species: "B", talado: 10, trozado: 0, movilizado: 0 }), // 10 sin trozar
    ]);
    expect(p.total.enPatioM3).toBe(10);
    expect(p.total.taladoSinTrozarM3).toBe(10);
    expect(p.total.baseM3).toBe(200);
  });
});

describe("computeBalance trae trozado y consumido por especie", () => {
  it("suma el trozado por especie y el consumo por troza", () => {
    const b = computeBalance(
      [{ speciesCommon: "Bolaina", cites: false, volumenAutorizadoM3: 50 }],
      [
        { section: "tala", speciesCommon: "Bolaina", trozaCode: null, volumeM3: 10, quantity: null, unit: null },
        { section: "trozado", speciesCommon: "Bolaina", trozaCode: "1-BOL-A", volumeM3: 4, quantity: null, unit: null },
        { section: "trozado", speciesCommon: "bolaina ", trozaCode: "1-BOL-B", volumeM3: 3, quantity: null, unit: null },
        { section: "despacho_troza", speciesCommon: null, trozaCode: "1-BOL-A", volumeM3: null, quantity: null, unit: null },
        { section: "consumo_troza", speciesCommon: null, trozaCode: "1-BOL-B", volumeM3: null, quantity: null, unit: null },
      ],
    );
    const r = b.rows[0];
    expect(r.talado).toBe(10);
    expect(r.trozado).toBe(7);
    expect(r.movilizado).toBe(4);
    expect(r.consumido).toBe(3);
    const c = cascadaDeFila(r);
    expect(c.enPieM3).toBe(40);
    expect(c.taladoSinTrozarM3).toBe(3);
    expect(c.enPatioM3).toBe(0);
  });
});
