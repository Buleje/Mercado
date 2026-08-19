import { describe, it, expect } from "vitest";
import { calcularRetrozado, saldoDeTroza, volumenHuber, type TrozaMadre } from "@/lib/forestal/ctp-retrozado";

/**
 * ADR-313 — el Apartado 2 del LO-CTP.
 *
 * La troza de referencia es real: `52/A` de la guía 1-19-0313629 — 73 × 58 cm,
 * 9.70 m, 3.268 m³ según SERFOR. Es la que no entra en la sierra y hay que
 * cortar, o sea el caso que motiva la feature.
 */

const troza52A: TrozaMadre = {
  id: "t-52a",
  codificacion: "52/A",
  d1Cm: 73,
  d2Cm: 58,
  largoM: 9.7,
  volumenM3: 3.268,
  retrozosPrevios: [],
};

describe("Volumen de la troza", () => {
  it("reproduce el volumen que DECLARA la guía real", () => {
    // El control que decide la fórmula: Smalian (la del ERP de donde salieron
    // estas reglas) daba 3.3113 acá — 0.043 m³ de más contra el documento.
    expect(Math.abs(volumenHuber(73, 58, 9.7) - 3.268)).toBeLessThanOrEqual(0.001);
    expect(Math.abs(volumenHuber(100, 96, 6.5) - 4.903)).toBeLessThanOrEqual(0.001);
    expect(Math.abs(volumenHuber(55, 51, 7.28) - 1.606)).toBeLessThanOrEqual(0.001);
  });

  it("una medida en cero no inventa volumen", () => {
    expect(volumenHuber(0, 58, 9.7)).toBe(0);
    expect(volumenHuber(73, 58, 0)).toBe(0);
  });
});

describe("Cortar la troza", () => {
  it("parte 9.70 m en dos pedazos y los numera desde el código de la madre", () => {
    const r = calcularRetrozado(troza52A, [
      { d1Cm: 73, d2Cm: 66, largoM: 5 },
      { d1Cm: 66, d2Cm: 58, largoM: 4.5 },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.retrozos.map((x) => x.codificacion)).toEqual(["52/A-1", "52/A-2"]);
  });

  it("el código que trae el documento manda: no se pisa con uno generado", () => {
    // El Apartado 2 del libro ya nombra al pedazo («3012263/A») y ese es el que
    // SERFOR conoce. Generar otro dejaba el retrozo con un nombre que no figura
    // en ningún documento, y el consumo del mismo libro no lo encontraba.
    const r = calcularRetrozado(troza52A, [
      { codificacion: "52/A-ORIG", d1Cm: 60, d2Cm: 58, largoM: 3, volumenM3: 1 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.retrozos[0]!.codificacion).toBe("52/A-ORIG");
  });

  it("un código vacío no cuenta como código: se genera", () => {
    const r = calcularRetrozado(troza52A, [
      { codificacion: "   ", d1Cm: 60, d2Cm: 58, largoM: 3, volumenM3: 1 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.retrozos[0]!.codificacion).toBe("52/A-1");
  });

  it("calcula el volumen si el operador no lo escribe", () => {
    const r = calcularRetrozado(troza52A, [{ d1Cm: 70, d2Cm: 60, largoM: 4 }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.retrozos[0]!.volumenM3).toBeCloseTo(volumenHuber(70, 60, 4), 4);
  });

  it("pero respeta el volumen que SÍ escribió: midió la madera", () => {
    const r = calcularRetrozado(troza52A, [{ d1Cm: 70, d2Cm: 60, largoM: 4, volumenM3: 1.2 }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.retrozos[0]!.volumenM3).toBe(1.2);
  });
});

describe("Lo que la física no permite", () => {
  it("un pedazo no puede ser más largo que la troza", () => {
    const r = calcularRetrozado(troza52A, [{ d1Cm: 73, d2Cm: 58, largoM: 12 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.join(" ")).toMatch(/no puede superar los 9.7 m/i);
  });

  it("ni más grueso que el diámetro MAYOR de la troza", () => {
    const r = calcularRetrozado(troza52A, [{ d1Cm: 90, d2Cm: 58, largoM: 4 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.join(" ")).toMatch(/90 cm de diámetro no salen de una troza de 73/i);
  });

  it("pero un pedazo MÁS GRUESO QUE LA PUNTA sí sale: el tronco es cónico", () => {
    // 73→58 cortado al medio da 73→66 y 66→58. Ese 66 supera el diámetro menor
    // de la madre (58) y es un corte perfectamente normal. Comparar "d2 contra
    // d2" lo rechazaba.
    const r = calcularRetrozado(troza52A, [
      { d1Cm: 73, d2Cm: 66, largoM: 5 },
      { d1Cm: 66, d2Cm: 58, largoM: 4.5 },
    ]);
    expect(r.ok).toBe(true);
  });

  it("de una troza de 9.70 m no salen dos pedazos de 6 m", () => {
    const r = calcularRetrozado(troza52A, [
      { d1Cm: 70, d2Cm: 64, largoM: 6, volumenM3: 1 },
      { d1Cm: 64, d2Cm: 58, largoM: 6, volumenM3: 1 },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.join(" ")).toMatch(/suman 12.00 m de largo y la troza mide 9.70/i);
  });

  it("la suma de los pedazos no puede pasar el volumen de la troza", () => {
    const r = calcularRetrozado(troza52A, [
      { d1Cm: 73, d2Cm: 66, largoM: 5, volumenM3: 3 },
      { d1Cm: 66, d2Cm: 58, largoM: 4.5, volumenM3: 3 },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.join(" ")).toMatch(/suman 6.0000 m³ y la troza tiene 3.2680/i);
  });

  it("el tope es sobre el TOTAL: cuenta lo ya cortado antes", () => {
    const conHistoria = { ...troza52A, retrozosPrevios: [{ volumenM3: 3 }] };
    const r = calcularRetrozado(conHistoria, [{ d1Cm: 60, d2Cm: 55, largoM: 2, volumenM3: 0.5 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.join(" ")).toMatch(/Ya estaban cortados 3.0000/i);
  });

  it("y la numeración sigue donde quedó, no reinicia", () => {
    const conHistoria = { ...troza52A, retrozosPrevios: [{ volumenM3: 1 }, { volumenM3: 1 }] };
    const r = calcularRetrozado(conHistoria, [{ d1Cm: 60, d2Cm: 55, largoM: 2, volumenM3: 0.5 }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.retrozos[0]!.codificacion).toBe("52/A-3");
  });

  it("cortar de menos SÍ se permite: al aserrar se pierde madera", () => {
    // `≤` y nunca `==`, como I1-I5. Exigir que la suma dé exacto obligaría al
    // operador a inflar un número para poder guardar.
    const r = calcularRetrozado(troza52A, [{ d1Cm: 60, d2Cm: 55, largoM: 3, volumenM3: 1 }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.volumenLibre).toBeCloseTo(2.268, 3);
  });

  it("no se registra un corte vacío", () => {
    const r = calcularRetrozado(troza52A, []);
    expect(r.ok).toBe(false);
  });

  it("junta TODOS los errores en vez de frenar en el primero", () => {
    const r = calcularRetrozado(troza52A, [
      { d1Cm: 90, d2Cm: 58, largoM: 4 },
      { d1Cm: 73, d2Cm: 99, largoM: 20 },
      { d1Cm: 0, d2Cm: 0, largoM: 0 },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Saldo de la troza", () => {
  it("el descarte ocupa volumen pero NO queda disponible", () => {
    const s = saldoDeTroza({
      ...troza52A,
      retrozosPrevios: [{ volumenM3: 2 }, { volumenM3: 0.5, descarte: true }],
    });
    expect(s.original).toBe(3.268);
    expect(s.retrozado).toBe(2.5);
    expect(s.descartado).toBe(0.5);
    expect(s.sinCortar).toBeCloseTo(0.768, 3);
    // 0.768 sin cortar + 2.5 cortado − 0.5 de descarte
    expect(s.disponible).toBeCloseTo(2.768, 3);
  });

  it("una troza sin cortar tiene todo disponible", () => {
    const s = saldoDeTroza(troza52A);
    expect(s.disponible).toBe(3.268);
    expect(s.retrozado).toBe(0);
  });
});
