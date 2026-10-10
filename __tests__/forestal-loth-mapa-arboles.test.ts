import { describe, expect, it } from "vitest";
import {
  arbolesCercanos,
  claseDelArbol,
  filtrarArboles,
  FILTRO_ARBOLES_VACIO,
  normalizarCondicion,
  opcionesDeFiltro,
  origenDeLaClase,
  poaDiscrepa,
  rumboCardinal,
  talaDesdeElMapa,
  textoDistancia,
  type ArbolBase,
} from "@/lib/forestal/loth-mapa-arboles";
import { fromUtm, distanceM } from "@/lib/forestal/loth-utm";

/** Un árbol en UTM 18S, como lo registra el regente (Blas: E 521 9xx · N 8 918 xxx). */
function arbol(code: string, e: number, n: number, extra: Partial<ArbolBase> = {}): ArbolBase {
  const [lat, lng] = fromUtm(e, n, 18, true);
  return { id: `id-${code}`, lat, lng, code, species: "Catahua", estado: "en_pie", ...extra };
}

describe("normalizarCondicion — la hoja del regente, como viene", () => {
  it.each([
    ["Aprovechable", "aprovechable"],
    ["  APROVECHABLE ", "aprovechable"],
    ["Semillero", "semillero"],
    ["Árbol semillero", "semillero"],
    ["Semilleros", "semillero"],
    ["Bajo DMC", "bajo_dmc"],
    ["bajo el diámetro mínimo", "bajo_dmc"],
    ["No aprovechable", "otra"],
    ["Hueco", "otra"],
  ])("«%s» → %s", (crudo, clase) => {
    expect(normalizarCondicion(crudo)).toBe(clase);
  });

  it("vacío o nulo = sin condición (no «aprovechable» por descarte)", () => {
    expect(normalizarCondicion(null)).toBeNull();
    expect(normalizarCondicion("   ")).toBeNull();
  });
});

describe("claseDelArbol — manda el regente; el POA sólo si él no dijo nada", () => {
  it("el regente gana aunque el POA diga otra cosa", () => {
    const t = { condicion: "Aprovechable", categoria: "semillero" as const };
    expect(claseDelArbol(t)).toBe("aprovechable");
    expect(origenDeLaClase(t)).toBe("regente");
    expect(poaDiscrepa(t)).toBe("semillero");
  });

  it("sin condición, pinta la categoría del POA", () => {
    const t = { condicion: null, categoria: "bajo_dmc" as const };
    expect(claseDelArbol(t)).toBe("bajo_dmc");
    expect(origenDeLaClase(t)).toBe("poa");
    expect(poaDiscrepa(t)).toBeNull();
  });

  it("talado o sin DAP en el POA no es una condición: queda «sin condición»", () => {
    expect(claseDelArbol({ categoria: "talado" })).toBe("sin_dato");
    expect(claseDelArbol({ categoria: "sin_dap" })).toBe("sin_dato");
    expect(origenDeLaClase({ categoria: "talado" })).toBeNull();
  });
});

describe("arbolesCercanos — a cuál ir desde donde estoy parado", () => {
  const censo = [
    arbol("22", 521_918, 8_918_150), // ≈ 4 m al oeste
    arbol("5", 521_982, 8_918_125, { species: "Aguanomasha" }), // ≈ 67 m al SE
    arbol("3", 521_958, 8_918_120, { estado: "talado" }), // talado: no cuenta
    arbol("8", 521_937, 8_918_009), // ≈ 142 m al sur
    arbol("2", 521_922, 8_918_250), // ≈ 100 m al norte
  ];
  const yo = fromUtm(521_922, 8_918_151, 18, true);

  it("ordena por distancia real y deja afuera lo talado", () => {
    const r = arbolesCercanos(yo, censo, 5);
    expect(r.map((c) => c.arbol.code)).toEqual(["22", "5", "2", "8"]);
    expect(r[0].distanciaM).toBeGreaterThan(3);
    expect(r[0].distanciaM).toBeLessThan(5);
    // La distancia en metros coincide con la de las coordenadas UTM (Pitágoras).
    expect(r[1].distanciaM).toBeCloseTo(Math.hypot(60, 26), 0);
  });

  it("el rumbo sale hacia el árbol, no desde él", () => {
    const [cerca, sureste, norte, sur] = arbolesCercanos(yo, censo, 5);
    expect(rumboCardinal(cerca.rumboDeg).corto).toBe("O");
    expect(rumboCardinal(sureste.rumboDeg).corto).toBe("SE");
    expect(rumboCardinal(norte.rumboDeg).corto).toBe("N");
    expect(rumboCardinal(sur.rumboDeg).corto).toBe("S");
  });

  it("corta en n y con empate desempata por código (misma posición = misma lista)", () => {
    const a = arbol("10", 521_932, 8_918_151);
    const b = arbol("9", 521_912, 8_918_151);
    expect(distanceM(yo, [a.lat, a.lng])).toBeCloseTo(distanceM(yo, [b.lat, b.lng]), 1);
    expect(arbolesCercanos(yo, [a, b], 1).map((c) => c.arbol.code)).toEqual(["9"]);
    expect(arbolesCercanos(yo, censo, 0)).toEqual([]);
  });
});

describe("filtro por especie, condición y estado", () => {
  const censo = [
    arbol("1", 1, 1, { species: "Catahua", condicion: "Aprovechable" }),
    arbol("2", 1, 1, { species: "catahua ", condicion: "Semillero" }),
    arbol("3", 1, 1, { species: "Lupuna", condicion: "Aprovechable", estado: "talado" }),
  ];

  it("la especie se agrupa por su clave (mayúsculas y espacios no la parten)", () => {
    const { especies } = opcionesDeFiltro(censo);
    expect(especies).toEqual([
      { valor: "catahua", label: "Catahua", n: 2 },
      { valor: "lupuna", label: "Lupuna", n: 1 },
    ]);
    expect(filtrarArboles(censo, { ...FILTRO_ARBOLES_VACIO, especie: "catahua" }).map((t) => t.code)).toEqual(["1", "2"]);
  });

  it("condición y estado se combinan con Y", () => {
    const r = filtrarArboles(censo, { especie: null, clase: "aprovechable", estado: "en_pie" });
    expect(r.map((t) => t.code)).toEqual(["1"]);
    const { clases, estados } = opcionesDeFiltro(censo);
    expect(clases.map((c) => `${c.valor}:${c.n}`)).toEqual(["aprovechable:2", "semillero:1"]);
    expect(estados.map((e) => `${e.valor}:${e.n}`)).toEqual(["en_pie:2", "talado:1"]);
  });

  it("sin filtro devuelve la MISMA lista (no una copia que re-pinte el mapa)", () => {
    expect(filtrarArboles(censo, FILTRO_ARBOLES_VACIO)).toBe(censo);
  });
});

describe("talaDesdeElMapa — el botón no escribe una infracción", () => {
  it("un semillero declarado no ofrece «Registrar tala»", () => {
    expect(talaDesdeElMapa({ estado: "en_pie", condicion: "Semillero" })).toEqual({ puede: false, nota: "Es semillero: se queda en pie." });
  });
  it("bajo el DMC se ofrece, avisando la justificación", () => {
    const r = talaDesdeElMapa({ estado: "en_pie", categoria: "bajo_dmc" });
    expect(r.puede).toBe(true);
    expect(r.nota).toMatch(/justificación/);
  });
  it("talado o descartado, no", () => {
    expect(talaDesdeElMapa({ estado: "talado", condicion: "Aprovechable" }).puede).toBe(false);
    expect(talaDesdeElMapa({ estado: "descartado" }).puede).toBe(false);
  });
  it("aprovechable para el regente pero semillero para el POA: se ofrece con aviso", () => {
    const r = talaDesdeElMapa({ estado: "en_pie", condicion: "Aprovechable", categoria: "semillero" });
    expect(r.puede).toBe(true);
    expect(r.nota).toMatch(/POA/);
  });
});

describe("textoDistancia", () => {
  it.each([
    [17.6, "18 m"],
    [999.4, "999 m"],
    [1_240, "1.2 km"],
    [12_400, "12 km"],
    [Number.NaN, "—"],
  ])("%s m → %s", (m, texto) => {
    expect(textoDistancia(m)).toBe(texto);
  });
});
