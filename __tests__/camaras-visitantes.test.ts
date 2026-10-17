/**
 * «Visitante A, B…» del día (ADR-479): agrupar cajas por la ropa, puro y
 * determinista. Firmas armadas a mano: 12 casilleros del torso + 12 de las piernas.
 */
import { describe, expect, it } from "vitest";
import type { CajaGuardada } from "@/lib/camaras/apariencia";
import { agruparPersonasDelDia, completarResumen, letraDeVisitante, type FotoConCajas, type UnionVisitantes } from "@/lib/camaras/visitantes";

// Torso todo en un casillero (rojo = 0, azul = 5, blanco = 11) + piernas jean (casillero 5).
const firmaCon = (torso: number, piernas = 5) =>
  Array.from({ length: 24 }, (_, i) => (i === torso || i === 12 + piernas ? "f" : "0")).join("");
const ROJA = firmaCon(0);
/** Torso con varios casilleros (`{ casillero: 0-15 }`) y piernas jean. */
const firmaDe = (torso: Record<number, number>, piernas = 5) =>
  Array.from({ length: 24 }, (_, i) => (i < 12 ? (torso[i] ?? 0) : i === 12 + piernas ? 15 : 0).toString(16)).join("");
const AZUL = firmaCon(5);
const BLANCA = firmaCon(11);

const caja = (firma: string | null, extra: Partial<CajaGuardada> = {}): CajaGuardada => ({
  x: 0.1,
  y: 0.1,
  ancho: 0.1,
  alto: 0.3,
  confianza: 0.6,
  firma,
  chaleco: firma ? false : null,
  ...extra,
});

/** `hhmm` en hora de Lima (UTC-5) del 08-10. */
const foto = (docId: string, hhmm: string, cajas: CajaGuardada[] | null, camara = "Patio"): FotoConCajas => ({
  docId,
  at: new Date(`2026-10-08T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00-05:00`).toISOString(),
  camaraId: camara === "Patio" ? "cam-1" : "cam-2",
  camaraNombre: camara,
  cajas,
});

describe("personas distintas del día", () => {
  it("letras A, B… por orden de aparición; las fotos de la misma ropa se juntan", () => {
    const r = agruparPersonasDelDia("2026-10-08", [
      foto("f3", "0815", [caja(ROJA)], "Portón"),
      foto("f1", "0812", [caja(ROJA)]),
      foto("f2", "0813", [caja(AZUL)]),
    ]);
    expect(r.personas).toBe(2);
    expect(r.grupos.map((g) => [g.etiqueta, g.fotos.map((f) => f.docId)])).toEqual([
      ["Visitante A", ["f1", "f3"]],
      ["Visitante B", ["f2"]],
    ]);
    expect(r.grupos[0].camaras).toEqual(["Patio", "Portón"]);
    expect(r.aprox).toBe(true);
  });

  it("dos cajas de la MISMA foto nunca se juntan, aunque vistan igual", () => {
    // Una al lado de la otra (una caja DENTRO de otra es la misma persona detectada dos veces: test aparte).
    const r = agruparPersonasDelDia("2026-10-08", [foto("f1", "0900", [caja(BLANCA), caja(BLANCA, { x: 0.6 })])]);
    expect(r.personas).toBe(2);
    // y la foto siguiente se reparte entre los dos, no los vuelve uno
    const r2 = agruparPersonasDelDia("2026-10-08", [
      foto("f1", "0900", [caja(BLANCA), caja(BLANCA, { x: 0.6 })]),
      foto("f2", "0901", [caja(BLANCA), caja(BLANCA, { x: 0.6 })]),
    ]);
    expect(r2.personas).toBe(2);
    expect(r2.grupos.every((g) => new Set(g.fotos.map((f) => f.docId)).size === g.fotos.length)).toBe(true);
  });

  it("con chaleco → «Personal 1»; nunca se mezcla con un visitante de la misma ropa", () => {
    const r = agruparPersonasDelDia("2026-10-08", [
      foto("f1", "0700", [caja(ROJA, { chaleco: true })]),
      foto("f2", "0701", [caja(ROJA)]),
      foto("f3", "0702", [caja(ROJA, { chaleco: true })]),
    ]);
    expect(r.grupos.map((g) => [g.etiqueta, g.tipo, g.fotos.length])).toEqual([
      ["Personal 1", "personal", 2],
      ["Visitante A", "visitante", 1],
    ]);
    expect(r.conChaleco).toBe(1);
    expect(r.visitantes).toBe(1);
  });

  it("un marcador de chaleco REGISTRADO manda sobre la ropa", () => {
    const fotos = [foto("f1", "0700", [caja(ROJA, { marcador: 203 })]), foto("f2", "0705", [caja(AZUL, { marcador: 203 })])];
    const r = agruparPersonasDelDia("2026-10-08", fotos, undefined, new Set([203]));
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0]).toMatchObject({ etiqueta: "Personal · marcador 203", tipo: "personal", marcador: 203 });
  });

  it("un marcador que no está registrado (lo manda el cliente) se ignora: manda la ropa", () => {
    const fotos = [foto("f1", "0700", [caja(ROJA, { marcador: 203 })]), foto("f2", "0705", [caja(AZUL, { marcador: 203 })])];
    for (const r of [agruparPersonasDelDia("2026-10-08", fotos), agruparPersonasDelDia("2026-10-08", fotos, undefined, new Set([210]))]) {
      expect(r.grupos.map((g) => [g.etiqueta, g.marcador])).toEqual([
        ["Visitante A", null],
        ["Visitante B", null],
      ]);
    }
  });

  it("la clave del grupo es su primera aparición y no cambia al llegar fotos nuevas", () => {
    const antes = agruparPersonasDelDia("2026-10-08", [foto("f1", "0700", [caja(AZUL), caja(ROJA, { x: 0.6 })])]);
    const despues = agruparPersonasDelDia("2026-10-08", [
      foto("f1", "0700", [caja(AZUL), caja(ROJA, { x: 0.6 })]),
      foto("f2", "0800", [caja(ROJA, { alto: 0.6 })]),
    ]);
    expect(antes.grupos.map((g) => g.clave)).toEqual(["f1#0", "f1#1"]);
    expect(despues.grupos.map((g) => g.clave)).toEqual(["f1#0", "f1#1"]);
    // La portada sí cambia (la foto nueva lo ve más grande): por eso no es la clave.
    expect(despues.grupos[1].portada.docId).toBe("f2");
  });

  it("sin firma (persona lejana) → «sin agrupar»; fotos de antes → «sin cajas»", () => {
    const r = agruparPersonasDelDia("2026-10-08", [
      foto("f1", "0700", [caja(null, { x: 0.6 }), caja(ROJA)]),
      foto("f0", "0650", null),
    ]);
    expect(r).toMatchObject({ personas: 1, sinAgrupar: 1, fotosSinCajas: 1, fotosConCajas: 1 });
    expect(r.porHora).toEqual([{ hora: 7, personas: 1, conChaleco: 0, sinAgrupar: 1 }]);
  });

  it("mismo resultado con la lista en otro orden", () => {
    const fotos = [
      foto("a", "0812", [caja(ROJA), caja(AZUL, { x: 0.6 })]),
      foto("b", "0812", [caja(BLANCA)]),
      foto("c", "0930", [caja(AZUL), caja(ROJA, { chaleco: true, x: 0.6 })]),
      foto("d", "1015", [caja(ROJA), caja(null, { x: 0.6 })]),
      foto("e", "1016", [caja(null, { x: 0.62 }), caja(ROJA, { x: 0.3, alto: 0.25 })]),
      foto("f", "1016", [caja(BLANCA, { x: 0.5 }), caja(BLANCA, { x: 0.52, ancho: 0.05, alto: 0.15 })]),
    ];
    const base = agruparPersonasDelDia("2026-10-08", fotos);
    for (const orden of [[5, 4, 3, 2, 1, 0], [2, 0, 5, 3, 1, 4], [1, 3, 4, 0, 5, 2]]) {
      expect(agruparPersonasDelDia("2026-10-08", orden.map((i) => fotos[i]))).toEqual(base);
    }
  });

  it("conteo por hora de Lima: personas distintas, no fotos", () => {
    const r = agruparPersonasDelDia("2026-10-08", [
      foto("f1", "0810", [caja(ROJA)]),
      foto("f2", "0820", [caja(ROJA)]),
      foto("f3", "0830", [caja(AZUL)]),
      foto("f4", "0905", [caja(ROJA)]),
    ]);
    expect(r.porHora).toEqual([
      { hora: 8, personas: 2, conChaleco: 0, sinAgrupar: 0 },
      { hora: 9, personas: 1, conChaleco: 0, sinAgrupar: 0 },
    ]);
  });

  it("la portada es la foto donde se lo ve más grande", () => {
    const r = agruparPersonasDelDia("2026-10-08", [
      foto("chica", "0800", [caja(ROJA, { alto: 0.2 })]),
      foto("grande", "0801", [caja(ROJA, { alto: 0.6, x: 0.4 })]),
    ]);
    expect(r.grupos[0].portada).toEqual({ docId: "grande", caja: { x: 0.4, y: 0.1, ancho: 0.1, alto: 0.6 } });
  });

  it("letras después de la Z", () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(letraDeVisitante)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA"]);
  });

  it("una caja dentro de otra más grande en la misma foto = la misma persona detectada dos veces", () => {
    const r = agruparPersonasDelDia("2026-10-08", [
      foto("f1", "0900", [caja(BLANCA, { x: 0.12, y: 0.15, ancho: 0.05, alto: 0.15 }), caja(ROJA)]),
    ]);
    expect(r).toMatchObject({ personas: 1, repetidasEnFoto: 1 });
    // Queda la caja grande (la otra cae ≥ 60 % adentro) y su portada.
    expect(r.grupos[0].fotos).toEqual([expect.objectContaining({ docId: "f1", caja: 1 })]);
  });

  it("seguimiento: la misma cámara, minutos después y en el mismo lugar junta aunque la ropa se lea algo distinta", () => {
    const algoDistinta = firmaDe({ 0: 5, 5: 10 }); // 0,33 de la ROJA: por la ropa sola no junta (umbral 0,3)
    const r = agruparPersonasDelDia("2026-10-08", [
      foto("f1", "1400", [caja(ROJA)]),
      foto("f2", "1403", [caja(algoDistinta, { x: 0.11 })]),
    ]);
    expect(r.personas).toBe(1);
    // Media hora después y en otro lugar, la misma diferencia ya no junta.
    const lejos = agruparPersonasDelDia("2026-10-08", [
      foto("f1", "1400", [caja(ROJA)]),
      foto("f2", "1430", [caja(algoDistinta, { x: 0.7 })]),
    ]);
    expect(lejos.personas).toBe(2);
    // Ni en el mismo lugar si el torso no se parece en nada (camisa roja y azul con el mismo jean = 0,5).
    const otraCamisa = agruparPersonasDelDia("2026-10-08", [foto("f1", "1400", [caja(ROJA)]), foto("f2", "1401", [caja(AZUL)])]);
    expect(otraCamisa.personas).toBe(2);
  });

  it("una figura lejana (sin firma) que sigue a alguien ya agrupado se suma a él, no a «sin agrupar»", () => {
    const r = agruparPersonasDelDia("2026-10-08", [
      foto("f1", "0700", [caja(ROJA)]),
      foto("f2", "0701", [caja(null, { y: 0.12 })]),
      foto("f3", "0702", [caja(null, { y: 0.12 })], "Portón"),
      foto("f4", "0703", [caja(null, { y: 0.12 })], "Portón"),
    ]);
    expect(r.personas).toBe(1);
    expect(r.grupos[0].fotos.map((f) => f.docId)).toEqual(["f1", "f2"]);
    // En el Portón no había nadie a quien seguir: las dos fotos de la misma figura quieta cuentan UNA.
    expect(r.sinAgrupar).toBe(1);
  });

  it("analiza al visitante: tramos, minutos a la vista, mejores fotos y cámaras", () => {
    const r = agruparPersonasDelDia("2026-10-08", [
      foto("a", "0800", [caja(ROJA, { alto: 0.2 })]),
      foto("b", "0810", [caja(ROJA, { alto: 0.4 })], "Portón"),
      foto("c", "0811", [caja(ROJA, { alto: 0.5 })], "Portón"),
      foto("d", "0815", [caja(ROJA, { alto: 0.3 })]),
      foto("e", "1100", [caja(ROJA, { alto: 0.35 })]),
    ]);
    const g = r.grupos[0];
    expect(g.tramos.map((t) => [t.desde.slice(11, 16), t.hasta.slice(11, 16), t.camaras, t.fotos])).toEqual([
      ["13:00", "13:15", ["Patio", "Portón"], 4],
      ["16:00", "16:00", ["Patio"], 1],
    ]);
    expect(g.minutos).toBe(15);
    // Las 4 más grandes, sin dos del mismo minuto (b y c están a 1 min: entra la más grande, c), en orden de hora.
    expect(g.mejores.map((m) => m.docId)).toEqual(["a", "c", "d", "e"]);
    expect(g.camaras).toEqual(["Patio", "Portón"]);
  });

  it("sugiere los parecidos del mismo tipo (candidatos a «es el mismo»)", () => {
    const casiRoja = firmaDe({ 0: 15, 5: 5 }); // 0,13 de la ROJA
    const r = agruparPersonasDelDia("2026-10-08", [
      foto("f1", "0700", [caja(ROJA)]),
      foto("f2", "0900", [caja(casiRoja, { x: 0.7 })]),
      foto("f3", "1000", [caja(AZUL, { x: 0.4 })]),
    ], 0.1);
    // Con umbral 0,1 no se juntan solos: quedan sugeridos. La AZUL (0,5 de la ROJA: otro torso) no se sugiere.
    expect(r.grupos[0].parecidos).toEqual([{ clave: "f2#0", etiqueta: "Visitante B", distancia: 0.13 }]);
    expect(r.grupos[2].parecidos).toEqual([{ clave: "f2#0", etiqueta: "Visitante B", distancia: 0.38 }]);
  });

  it("«es el mismo que…»: une por clave, deja la letra del primero y se puede separar", () => {
    const fotos = [foto("f1", "0700", [caja(ROJA)]), foto("f2", "0800", [caja(AZUL, { x: 0.7 })]), foto("f3", "0900", [caja(BLANCA, { x: 0.4 })])];
    const union: UnionVisitantes = { a: "f2#0", b: "f1#0" };
    const r = agruparPersonasDelDia("2026-10-08", fotos, undefined, undefined, [union]);
    expect(r.personas).toBe(2);
    expect(r.grupos.map((g) => [g.etiqueta, g.clave, g.unidos, g.fotos.map((f) => f.docId)])).toEqual([
      ["Visitante A", "f1#0", ["f2#0"], ["f1", "f2"]],
      ["Visitante B", "f3#0", [], ["f3"]],
    ]);
    // Una clave que ya no existe (se borró la foto) no rompe nada.
    expect(agruparPersonasDelDia("2026-10-08", fotos, undefined, undefined, [{ a: "f9#0", b: "f1#0" }]).personas).toBe(3);
  });

  it("unir dos cajas de la MISMA foto a mano deja una sola (la más grande) y el personal manda", () => {
    const r = agruparPersonasDelDia(
      "2026-10-08",
      [foto("f1", "0700", [caja(ROJA, { chaleco: true }), caja(AZUL, { x: 0.6, alto: 0.5 })])],
      undefined,
      undefined,
      [{ a: "f1#0", b: "f1#1" }],
    );
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0]).toMatchObject({ tipo: "personal", etiqueta: "Personal 1", fotos: [expect.objectContaining({ caja: 1 })] });
  });

  it("una respuesta vieja (sin minutos ni tramos: caché o parche de QA) no da «NaN»", () => {
    const vieja = {
      ok: true as const,
      dia: "2026-10-10",
      personas: 1,
      conChaleco: 0,
      visitantes: 1,
      sinAgrupar: 0,
      fotosSinCajas: 0,
      fotosConCajas: 1,
      porHora: [],
      aprox: true as const,
      grupos: [
        {
          clave: "f1#0",
          etiqueta: "Visitante A",
          tipo: "visitante",
          colaboradorId: null,
          marcador: null,
          fotos: [{ docId: "f1", at: "2026-10-10T12:16:24.000Z", camaraId: "c", caja: 0 }],
          desde: "2026-10-10T12:16:24.000Z",
          hasta: "2026-10-10T12:41:00.000Z",
          camaras: ["Entrada"],
          portada: { docId: "f1", caja: { x: 0.4, y: 0.2, ancho: 0.05, alto: 0.2 } },
        },
      ],
    } as unknown as Parameters<typeof completarResumen>[0];
    const g = completarResumen(vieja).grupos[0];
    expect(g.minutos).toBe(25);
    expect(g.tramos).toEqual([{ desde: g.desde, hasta: g.hasta, camaras: ["Entrada"], fotos: 1 }]);
    expect(g.mejores).toEqual([{ docId: "f1", at: g.desde, camaraNombre: "Entrada", caja: g.portada.caja }]);
    expect([g.parecidos, g.unidos, completarResumen(vieja).repetidasEnFoto]).toEqual([[], [], 0]);
  });
});
