import { describe, expect, it } from "vitest";
import { cascadaDeFila, cascadaDelPlan } from "@/lib/forestal/loth-saldo-cascada";
import { computeBalance } from "@/lib/forestal/loth-constants";
import { excedeT6 } from "@/lib/forestal/loth-t6";

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

  it("lo talado se juzga con la misma regla del techo que lo movilizado (excedeTechoM3, 3 decimales)", () => {
    /* Bajo el litro no pasa; desde el litro, sí (antes la tala toleraba 10 litros y la guía, ninguno). */
    expect(cascadaDeFila(fila({ autorizado: 3, talado: 3.0004 })).excedido).toBe(false);
    expect(cascadaDeFila(fila({ autorizado: 3, talado: 3.002 })).excedido).toBe(true);
    expect(cascadaDeFila(fila({ autorizado: 3, talado: 3 })).excedido).toBe(false);
  });

  it("lo movilizado se juzga con la regla del freno de la guía (excedeTechoM3, 3 decimales)", () => {
    /* 161,265 sobre 161,258: la tolerancia de 0,01 lo dejaba en verde y la guía se frenaba. */
    expect(cascadaDeFila(fila({ autorizado: 161.258, movilizado: 161.265 })).excedido).toBe(true);
    /* 2,0003 sobre 2,000 no pasa a litros: ni la cascada ni el freno lo marcan. */
    expect(cascadaDeFila(fila({ autorizado: 2, movilizado: 2.0003 })).excedido).toBe(false);
    expect(excedeT6({ autorizado: 161.258, movilizado: 161.265 }, 0)).toBe(true);
    expect(excedeT6({ autorizado: 2, movilizado: 2 }, 0.0003)).toBe(false);
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
