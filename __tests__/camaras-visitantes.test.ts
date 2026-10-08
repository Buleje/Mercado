/**
 * «Visitante A, B…» del día (ADR-479): agrupar cajas por la ropa, puro y
 * determinista. Firmas armadas a mano: 12 casilleros del torso + 12 de las piernas.
 */
import { describe, expect, it } from "vitest";
import type { CajaGuardada } from "@/lib/camaras/apariencia";
import { agruparPersonasDelDia, letraDeVisitante, type FotoConCajas } from "@/lib/camaras/visitantes";

// Torso todo en un casillero (rojo = 0, azul = 5, blanco = 11) + piernas jean (casillero 5).
const firmaCon = (torso: number, piernas = 5) =>
  Array.from({ length: 24 }, (_, i) => (i === torso || i === 12 + piernas ? "f" : "0")).join("");
const ROJA = firmaCon(0);
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
    const r = agruparPersonasDelDia("2026-10-08", [foto("f1", "0900", [caja(BLANCA), caja(BLANCA)])]);
    expect(r.personas).toBe(2);
    // y la foto siguiente se reparte entre los dos, no los vuelve uno
    const r2 = agruparPersonasDelDia("2026-10-08", [
      foto("f1", "0900", [caja(BLANCA), caja(BLANCA)]),
      foto("f2", "0901", [caja(BLANCA), caja(BLANCA)]),
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
    const antes = agruparPersonasDelDia("2026-10-08", [foto("f1", "0700", [caja(AZUL), caja(ROJA)])]);
    const despues = agruparPersonasDelDia("2026-10-08", [
      foto("f1", "0700", [caja(AZUL), caja(ROJA)]),
      foto("f2", "0800", [caja(ROJA, { alto: 0.6 })]),
    ]);
    expect(antes.grupos.map((g) => g.clave)).toEqual(["f1#0", "f1#1"]);
    expect(despues.grupos.map((g) => g.clave)).toEqual(["f1#0", "f1#1"]);
    // La portada sí cambia (la foto nueva lo ve más grande): por eso no es la clave.
    expect(despues.grupos[1].portada.docId).toBe("f2");
  });

  it("sin firma (persona lejana) → «sin agrupar»; fotos de antes → «sin cajas»", () => {
    const r = agruparPersonasDelDia("2026-10-08", [
      foto("f1", "0700", [caja(null), caja(ROJA)]),
      foto("f0", "0650", null),
    ]);
    expect(r).toMatchObject({ personas: 1, sinAgrupar: 1, fotosSinCajas: 1, fotosConCajas: 1 });
    expect(r.porHora).toEqual([{ hora: 7, personas: 1, conChaleco: 0, sinAgrupar: 1 }]);
  });

  it("mismo resultado con la lista en otro orden", () => {
    const fotos = [
      foto("a", "0812", [caja(ROJA), caja(AZUL)]),
      foto("b", "0812", [caja(BLANCA)]),
      foto("c", "0930", [caja(AZUL), caja(ROJA, { chaleco: true })]),
      foto("d", "1015", [caja(ROJA), caja(null)]),
    ];
    const base = agruparPersonasDelDia("2026-10-08", fotos);
    for (const orden of [[3, 2, 1, 0], [2, 0, 3, 1], [1, 3, 0, 2]]) {
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
});
