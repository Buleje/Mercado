import { describe, expect, it } from "vitest";
import {
  propuestaDeCorreccion,
  verificarLista,
  verificarTroza,
  volumenHuber,
} from "@/lib/forestal/cubicacion-verificacion";
import * as verificacion from "@/lib/forestal/cubicacion-verificacion";
import { smalianVolume } from "@/lib/forestal/loth-constants";

/** Las seis piezas reales medidas contra SERFOR (2026-08-06). */
const REALES = [
  { c: "20/A", d1: 65, d2: 63, l: 6.35, guia: 2.043 },
  { c: "111/B", d1: 87, d2: 82, l: 6.27, guia: 3.516 },
  { c: "117/B", d1: 62, d2: 50, l: 8.6, guia: 2.118 },
  { c: "112/A", d1: 105, d2: 96, l: 6.26, guia: 4.966 },
  { c: "99/B", d1: 75, d2: 74, l: 6.24, guia: 2.72 },
  { c: "25/A", d1: 79, d2: 70, l: 3.9, guia: 1.7 },
];

describe("qué fórmula usa la guía", () => {
  it("SMALIAN SERFOR (0.7854 × Ø medio² × L) reproduce el volumen declarado en las seis piezas (≤0.05 %)", () => {
    for (const p of REALES) {
      const h = volumenHuber({ d1Cm: p.d1, d2Cm: p.d2, largoM: p.l })!;
      expect(Math.abs((h - p.guia) / p.guia) * 100).toBeLessThan(0.05);
    }
  });

  it("es smalianVolume del Libro TH, no una copia: 117/B (62→50 cm × 8.6 m) = 2.1182, no los 2.1425 de la pura", () => {
    const cónica = { d1Cm: 62, d2Cm: 50, largoM: 8.6 };
    expect(volumenHuber(cónica)).toBe(smalianVolume(0.62, 0.5, 8.6));
    expect(volumenHuber(cónica)).toBe(2.1182);
  });

  it("la Smalian pura ya no existe (ADR-492): ni volumenSmalian ni conicidadPct ni smalianM3", () => {
    expect("volumenSmalian" in verificacion).toBe(false);
    expect("conicidadPct" in verificacion).toBe(false);
    const r = verificarTroza({ codificacion: "117/B", d1Cm: 62, d2Cm: 50, largoM: 8.6, cantidad: 1, volumenM3: 2.118 });
    expect("smalianM3" in r).toBe(false);
    expect(r.estado).toBe("ok");
  });

  it("sin largo o sin diámetros no inventa un volumen", () => {
    expect(volumenHuber({ d1Cm: 60, d2Cm: 60, largoM: null })).toBeNull();
    expect(volumenHuber({ d1Cm: null, d2Cm: null, largoM: 5 })).toBeNull();
  });

  it("con un solo diámetro, ése es el medio", () => {
    expect(volumenHuber({ d1Cm: 60, d2Cm: null, largoM: 5 })).toBe(smalianVolume(0.6, 0.6, 5));
  });
});

describe("verificarTroza", () => {
  it("una pieza bien cargada queda en ok", () => {
    const r = verificarTroza({ codificacion: "99/B", d1Cm: 75, d2Cm: 74, largoM: 6.24, cantidad: 1, volumenM3: 2.72 });
    expect(r.estado).toBe("ok");
    expect(Math.abs(r.desvioPct!)).toBeLessThan(0.05);
  });

  it("el caso real: 20/A con 6.129 se detecta como MÚLTIPLO de 3", () => {
    const r = verificarTroza({ codificacion: "20/A", d1Cm: 65, d2Cm: 63, largoM: 6.35, cantidad: 1, volumenM3: 6.129 });
    expect(r.estado).toBe("multiplo");
    expect(r.piezasQueExplican).toBe(3);
    expect(r.huberM3).toBeCloseTo(2.043, 3);
    expect(r.desvioPct).toBeCloseTo(200, 0);
  });

  it("la fila que SÍ declara sus 3 piezas queda en ok", () => {
    // Mismo volumen, pero `cantidad` lo explica: no hay error que reportar.
    const r = verificarTroza({ d1Cm: 65, d2Cm: 63, largoM: 6.35, cantidad: 3, volumenM3: 6.129 });
    expect(r.estado).toBe("ok");
    expect(r.esperadoM3).toBeCloseTo(6.129, 2);
  });

  it("un desvío que no es múltiplo se marca aparte: no se propone un conteo", () => {
    const r = verificarTroza({ d1Cm: 65, d2Cm: 63, largoM: 6.35, cantidad: 1, volumenM3: 3.5 });
    expect(r.estado).toBe("desvio");
    expect(r.piezasQueExplican).toBeNull();
  });

  it("sin medidas no es un error, es un hueco", () => {
    const r = verificarTroza({ codificacion: "X", largoM: null, volumenM3: 5 });
    expect(r.estado).toBe("sin-medidas");
    expect(r.desvioPct).toBeNull();
  });

  it("la tolerancia del 2 % deja pasar el redondeo del emisor", () => {
    // 2.043 declarado vs 2.0428 calculado: 0.01 % — no puede ser un hallazgo.
    expect(verificarTroza({ d1Cm: 65, d2Cm: 63, largoM: 6.35, volumenM3: 2.043 }).estado).toBe("ok");
  });
});

describe("verificarLista", () => {
  it("cuenta los problemas y separa los huecos", () => {
    const r = verificarLista([
      { codificacion: "A", d1Cm: 65, d2Cm: 63, largoM: 6.35, cantidad: 1, volumenM3: 6.129 },
      { codificacion: "B", d1Cm: 75, d2Cm: 74, largoM: 6.24, cantidad: 1, volumenM3: 2.72 },
      { codificacion: "C", volumenM3: 3 },
    ]);
    expect(r.conProblema).toBe(1);
    expect(r.sinMedidas).toBe(1);
  });

  it("encuentra la misma troza cargada dos veces en la guía", () => {
    // Un duplicado infla el patio sin que ningún total lo delate.
    const r = verificarLista([
      { codificacion: "20/A", d1Cm: 65, d2Cm: 63, largoM: 6.35, volumenM3: 2.043 },
      { codificacion: "20/a ", d1Cm: 65, d2Cm: 63, largoM: 6.35, volumenM3: 2.043 },
      { codificacion: "99/B", d1Cm: 75, d2Cm: 74, largoM: 6.24, volumenM3: 2.72 },
    ]);
    expect(r.duplicadas).toEqual([{ codificacion: "20/A", veces: 2 }]);
  });

  it("las filas sin codificación no se cuentan como duplicadas entre sí", () => {
    const r = verificarLista([{ codificacion: null, volumenM3: 1 }, { codificacion: "  ", volumenM3: 1 }]);
    expect(r.duplicadas).toEqual([]);
  });
});

describe("propuestaDeCorreccion", () => {
  it("ofrece las DOS lecturas y no elige", () => {
    const f = verificarTroza({ d1Cm: 65, d2Cm: 63, largoM: 6.35, cantidad: 1, volumenM3: 6.129 });
    const p = propuestaDeCorreccion(f);
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ cantidad: 1 });
    expect(p[0].volumenM3).toBeCloseTo(2.043, 3);
    expect(p[1]).toMatchObject({ cantidad: 3 });
    expect(p[1].volumenM3).toBeCloseTo(6.128, 2);
  });

  it("una fila sana o un desvío raro no proponen nada", () => {
    expect(propuestaDeCorreccion(verificarTroza({ d1Cm: 75, d2Cm: 74, largoM: 6.24, volumenM3: 2.72 }))).toEqual([]);
    expect(propuestaDeCorreccion(verificarTroza({ d1Cm: 65, d2Cm: 63, largoM: 6.35, volumenM3: 3.5 }))).toEqual([]);
  });
});
