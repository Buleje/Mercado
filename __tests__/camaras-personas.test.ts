import { describe, expect, it } from "vitest";
import {
  AUSENCIA_PERSONA_MS,
  ESTADO_DETECTOR_INICIAL,
  HUECO_MINIMO_FOTO_MS,
  INTERVALO_FOTO_PERSONA_MS,
  VENTANA_CONFIRMAR_PERSONA_MS,
  decidirFotoPersona,
  type EstadoDetector,
  type MotivoFotoPersona,
} from "@/lib/camaras/personas";

/**
 * Regla de las fotos de personas del mosaico (Brandon 2026-10-07): aparece
 * alguien = foto al toque; si sigue en cuadro, una por minuto; el parpadeo del
 * detector no dispara ráfagas.
 */

const S = 1_000;

/** Corre una secuencia `[segundo, personas]` y devuelve las fotos `[segundo, motivo]`. */
function correr(
  cuadros: Array<[number, number]>,
  inicial: EstadoDetector = ESTADO_DETECTOR_INICIAL,
): { fotos: Array<[number, MotivoFotoPersona]>; estado: EstadoDetector } {
  let estado = inicial;
  const fotos: Array<[number, MotivoFotoPersona]> = [];
  for (const [seg, personas] of cuadros) {
    const d = decidirFotoPersona(estado, personas, seg * S);
    estado = d.estado;
    if (d.foto) fotos.push([seg, d.foto]);
  }
  return { fotos, estado };
}

/** Un cuadro por segundo de `desde` a `hasta` (incluidos) con `personas(seg)`. */
function cadaSegundo(desde: number, hasta: number, personas: (seg: number) => number) {
  const out: Array<[number, number]> = [];
  for (let s = desde; s <= hasta; s++) out.push([s, personas(s)]);
  return out;
}

describe("decidirFotoPersona — aparece alguien", () => {
  it("un solo cuadro con persona NO saca foto; el segundo seguido saca «aparecio»", () => {
    const { fotos, estado } = correr([
      [0, 0],
      [1, 1],
      [2, 1],
    ]);
    expect(fotos).toEqual([[2, "aparecio"]]);
    expect(estado).toEqual({ presentes: 1, ultimaVistaEn: 2 * S, ultimaFotoEn: 2 * S });
  });

  it("2 de 3: persona, hueco de un cuadro, persona = sigue contando como confirmada", () => {
    const { fotos } = correr([
      [1, 1],
      [2, 0],
      [3, 1],
    ]);
    expect(fotos).toEqual([[3, "aparecio"]]);
  });

  it("falso positivo de un cuadro y nada más: nunca saca foto", () => {
    const { fotos, estado } = correr(cadaSegundo(0, 120, (s) => (s === 10 ? 1 : 0)));
    expect(fotos).toEqual([]);
    expect(estado.presentes).toBe(0);
  });

  it("dos falsos positivos separados por más que la ventana no se confirman", () => {
    const lejos = VENTANA_CONFIRMAR_PERSONA_MS / S + 1;
    const { fotos } = correr([
      [10, 1],
      [10 + lejos, 1],
    ]);
    expect(fotos).toEqual([]);
  });

  it("aparece con 3 de golpe: la foto lleva las 3 y no repite «mas_gente»", () => {
    const { fotos, estado } = correr(cadaSegundo(0, 20, () => 3));
    expect(fotos).toEqual([[1, "aparecio"]]);
    expect(estado.presentes).toBe(3);
  });
});

describe("decidirFotoPersona — sigue en cuadro", () => {
  it("una persona quieta 3 minutos: aparecio + una «sigue» por minuto (4 fotos)", () => {
    const { fotos } = correr(cadaSegundo(0, 181, () => 1));
    expect(fotos).toEqual([
      [1, "aparecio"],
      [61, "sigue"],
      [121, "sigue"],
      [181, "sigue"],
    ]);
  });

  it("el detector la pierde 1 de cada 3 cuadros (parpadeo 1↔0): igual 1 por minuto", () => {
    const { fotos } = correr(cadaSegundo(0, 130, (s) => (s % 3 === 2 ? 0 : 1)));
    expect(fotos.map(([, m]) => m)).toEqual(["aparecio", "sigue", "sigue"]);
  });

  it("sin cuadros por un rato (pestaña oculta) y vuelve con la misma gente: «sigue», no «aparecio»", () => {
    const { fotos } = correr([
      [0, 1],
      [1, 1],
      [300, 1],
    ]);
    expect(fotos).toEqual([
      [1, "aparecio"],
      [300, "sigue"],
    ]);
  });
});

describe("decidirFotoPersona — llega otra persona", () => {
  it("1 → 2 pasado el hueco: «mas_gente» al toque", () => {
    const { fotos } = correr(cadaSegundo(0, 40, (s) => (s < 30 ? 1 : 2)));
    expect(fotos).toEqual([
      [1, "aparecio"],
      [30, "mas_gente"],
    ]);
  });

  it("1 → 2 antes del hueco: espera a que se cumpla y saca la foto si siguen 2", () => {
    const { fotos } = correr(cadaSegundo(0, 20, (s) => (s < 3 ? 1 : 2)));
    const hueco = HUECO_MINIMO_FOTO_MS / S;
    expect(fotos).toEqual([
      [1, "aparecio"],
      [1 + hueco, "mas_gente"],
    ]);
  });

  it("parpadeo 1→2→1→2 un minuto entero: como mucho 2 fotos (no ráfaga)", () => {
    const { fotos } = correr(cadaSegundo(0, 59, (s) => (s < 2 ? 1 : s % 2 ? 2 : 1)));
    expect(fotos.length).toBeLessThanOrEqual(2);
    expect(fotos[0]).toEqual([1, "aparecio"]);
  });

  it("baja de 2 a 1 no saca foto (se fue alguien)", () => {
    const { fotos } = correr(cadaSegundo(0, 50, (s) => (s < 20 ? 2 : 1)));
    expect(fotos).toEqual([[1, "aparecio"]]);
  });
});

describe("decidirFotoPersona — se van y vuelven", () => {
  it("menos que la ausencia sin ver a nadie: parpadeo, la persona que vuelve NO es «aparecio»", () => {
    const sinNadie = AUSENCIA_PERSONA_MS / S - 1;
    const { fotos, estado } = correr(
      cadaSegundo(0, 30, (s) => (s >= 10 && s < 10 + sinNadie ? 0 : 1)),
    );
    expect(fotos).toEqual([[1, "aparecio"]]);
    expect(estado.presentes).toBe(1);
  });

  it("pasada la ausencia se reinicia y la próxima persona vuelve a ser «aparecio» (con 2 cuadros)", () => {
    const ausencia = AUSENCIA_PERSONA_MS / S;
    // Vista hasta el 10, nadie del 11 al 30, vuelve el 31.
    const { fotos } = correr(cadaSegundo(0, 40, (s) => (s <= 10 || s >= 31 ? 1 : 0)));
    expect(fotos).toEqual([
      [1, "aparecio"],
      [32, "aparecio"],
    ]);
    // El reinicio ocurre justo al cumplirse la ausencia desde la última vista.
    const r = correr(cadaSegundo(0, 10 + ausencia, (s) => (s <= 10 ? 1 : 0)));
    expect(r.estado.presentes).toBe(0);
    const casi = correr(cadaSegundo(0, 10 + ausencia - 1, (s) => (s <= 10 ? 1 : 0)));
    expect(casi.estado.presentes).toBe(1);
  });

  it("sale y entra rápido justo después de una foto: respeta el hueco mínimo también en «aparecio»", () => {
    const inicial: EstadoDetector = { presentes: 0, ultimaVistaEn: 0, ultimaFotoEn: 5 * S };
    const { fotos } = correr(
      cadaSegundo(6, 20, () => 1),
      inicial,
    );
    expect(fotos).toEqual([[15, "aparecio"]]);
  });
});

describe("decidirFotoPersona — entradas raras", () => {
  it("NaN, negativos y decimales: NaN/negativo = nadie, 2,7 = 2", () => {
    expect(decidirFotoPersona(ESTADO_DETECTOR_INICIAL, Number.NaN, 0).estado).toEqual(
      ESTADO_DETECTOR_INICIAL,
    );
    expect(decidirFotoPersona(ESTADO_DETECTOR_INICIAL, -1, 0).foto).toBeNull();
    const { estado } = correr([
      [0, 2.7],
      [1, 2.7],
    ]);
    expect(estado.presentes).toBe(2);
  });

  it("la ventana de confirmar queda debajo de la ausencia (si no, tras irse todos no habría «aparecio»)", () => {
    expect(VENTANA_CONFIRMAR_PERSONA_MS).toBeLessThan(AUSENCIA_PERSONA_MS);
  });

  it("es pura: no muta el estado que recibe", () => {
    const antes: EstadoDetector = { presentes: 1, ultimaVistaEn: 0, ultimaFotoEn: 0 };
    const copia = { ...antes };
    decidirFotoPersona(antes, 3, 100 * S);
    decidirFotoPersona(antes, 0, 100 * S);
    expect(antes).toEqual(copia);
  });

  it("reloj que vuelve atrás no traba las fotos para siempre", () => {
    const futuro: EstadoDetector = { presentes: 1, ultimaVistaEn: 999 * S, ultimaFotoEn: 999 * S };
    expect(decidirFotoPersona(futuro, 1, 10 * S).foto).toBe("sigue");
  });

  it("una hora al azar: nunca dos fotos a menos del hueco y a lo sumo 6 por minuto", () => {
    let semilla = 7;
    const azar = () => {
      semilla = (Math.imul(semilla, 1_103_515_245) + 12_345) >>> 0;
      return semilla / 2 ** 32;
    };
    const { fotos } = correr(cadaSegundo(0, 3_600, () => Math.floor(azar() * 4)));
    for (let i = 1; i < fotos.length; i++) {
      expect((fotos[i][0] - fotos[i - 1][0]) * S).toBeGreaterThanOrEqual(HUECO_MINIMO_FOTO_MS);
    }
    expect(fotos.length).toBeLessThanOrEqual(6 * 60);
    expect(fotos.length).toBeGreaterThan(0);
    expect(INTERVALO_FOTO_PERSONA_MS).toBe(60 * S);
  });
});

describe("decidirFotoPersona · ventana estirada (2026-10-08)", () => {
  it("con una vuelta lenta la 2.ª mirada a los 9 s todavía confirma «apareció»", () => {
    const a = decidirFotoPersona(ESTADO_DETECTOR_INICIAL, 1, 100_000);
    expect(a.foto).toBeNull();
    expect(decidirFotoPersona(a.estado, 1, 109_000).foto).toBeNull();
    expect(decidirFotoPersona(a.estado, 1, 109_000, { ventanaConfirmarMs: 15_000 }).foto).toBe("aparecio");
  });

  it("dos detecciones sueltas (otra persona, otro lugar) no confirman aunque entren en la ventana", () => {
    const a = decidirFotoPersona(ESTADO_DETECTOR_INICIAL, 1, 100_000);
    const b = decidirFotoPersona(a.estado, 1, 115_000, { ventanaConfirmarMs: 15_000, mismaPersona: false });
    expect(b.foto).toBeNull();
    expect(b.estado.ultimaVistaEn).toBe(115_000);
    expect(
      decidirFotoPersona(b.estado, 1, 121_000, { ventanaConfirmarMs: 15_000, mismaPersona: true }).foto,
    ).toBe("aparecio");
  });

  it("la ausencia se estira con la ventana: una vuelta vacía de 9 s no reinicia la presencia", () => {
    const foto = decidirFotoPersona(
      decidirFotoPersona(ESTADO_DETECTOR_INICIAL, 1, 0).estado,
      1,
      4_000,
    );
    expect(foto.foto).toBe("aparecio");
    const vacia = decidirFotoPersona(foto.estado, 0, 13_000, { ventanaConfirmarMs: 15_000 });
    expect(vacia.estado.presentes).toBe(1);
    expect(decidirFotoPersona(foto.estado, 0, 13_000).estado.presentes).toBe(0);
  });
});
