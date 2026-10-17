import { describe, expect, it } from "vitest";
import {
  estadoDeTroza,
  fotosDeTarjeta,
  m3DeTarjeta,
  medidasDeTarjeta,
  motivoSinLote,
  ptDeTarjeta,
  type FichaTrozaTarjeta,
} from "@/lib/forestal/tarjeta-troza";
import { partesDeMedidas } from "@/lib/forestal/ficha-texto-troza";
import { motivoDeRespuesta } from "@/hooks/use-ficha-troza";

/** La 118 de la guía 019-0000003 en `main`, libre en el patio. */
function ficha(over: {
  troza?: Partial<FichaTrozaTarjeta["troza"]>;
  ingreso?: Partial<FichaTrozaTarjeta["ingreso"]>;
  resto?: Partial<Omit<FichaTrozaTarjeta, "troza" | "ingreso">>;
} = {}): FichaTrozaTarjeta {
  return {
    troza: {
      id: "cms7yec2t000d2ovzjqg3twn1",
      codificacion: "13/A (0000008)",
      codigoPlanta: "118",
      especieComun: "Sapotillo",
      especieCientifica: "Quararibea sp.",
      volumenM3: 1.606,
      d1Cm: 55,
      d2Cm: 51,
      diametroCm: null,
      largoM: 7.28,
      noRecepcionada: false,
      descarte: false,
      fechaRecepcion: null,
      ...over.troza,
    },
    ingreso: {
      id: "ing1",
      libroNro: 14,
      constanciaSniffs: "1-19-0313629",
      gtfNumber: "019-0000003",
      permiso: "19-SEC/PER-FMC-2024-008",
      resolucion: "R.A N° D000485-2024-MIDAGRI-SERFOR-ATFFS SELVA CENTRAL",
      proveedor: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI",
      status: "validado",
      fechaRecepcion: "2026-09-10T00:00:00.000Z",
      ...over.ingreso,
    },
    lote: null,
    retrozos: [],
    corrida: null,
    despacho: null,
    ...over.resto,
  };
}

describe("estadoDeTroza", () => {
  it("libre y recibida: en el patio, y se puede armar un lote", () => {
    const f = ficha();
    expect(estadoDeTroza(f)).toMatchObject({ clave: "en_patio", tono: "ok" });
    expect(motivoSinLote(f)).toBeNull();
  });

  it("lo que la sacó del patio manda sobre el lote que la apartó", () => {
    const lote = { id: "l1", code: "LA-2026-061" };
    expect(estadoDeTroza(ficha({ resto: { lote } })).texto).toBe("En el lote LA-2026-061");
    expect(estadoDeTroza(ficha({ resto: { lote, corrida: { id: "c1", vigente: true } } })).clave).toBe("aserrada");
    expect(estadoDeTroza(ficha({ resto: { despacho: { id: "d1", vigente: true } } })).clave).toBe("despachada");
  });

  it("una corrida o despacho ANULADO no cuenta: la madera volvió al patio", () => {
    const f = ficha({ resto: { corrida: { id: "c1", vigente: false }, despacho: { id: "d1", vigente: false } } });
    expect(estadoDeTroza(f).clave).toBe("en_patio");
    expect(motivoSinLote(f)).toBeNull();
  });

  it("cortada, descarte, no llegó y guía sin recibir", () => {
    expect(estadoDeTroza(ficha({ resto: { retrozos: [{}, {}] } })).texto).toBe("Cortada en 2 pedazos");
    expect(estadoDeTroza(ficha({ resto: { retrozos: [{}] } })).texto).toBe("Cortada en 1 pedazo");
    expect(estadoDeTroza(ficha({ troza: { descarte: true } })).clave).toBe("descarte");
    expect(estadoDeTroza(ficha({ troza: { noRecepcionada: true } })).clave).toBe("no_llego");
    const sinRecibir = ficha({ ingreso: { status: "pendiente", fechaRecepcion: null } });
    expect(estadoDeTroza(sinRecibir).clave).toBe("sin_recibir");
    /* El botón no se ofrece: la pila la rechazaría. */
    expect(motivoSinLote(sinRecibir)).toMatch(/no se recibió/);
  });

  it("la recepción de la PIEZA alcanza aunque la guía siga pendiente (ADR-336)", () => {
    const f = ficha({ ingreso: { status: "pendiente", fechaRecepcion: null }, troza: { fechaRecepcion: "2026-09-12T00:00:00.000Z" } });
    expect(estadoDeTroza(f).clave).toBe("en_patio");
  });

  it("apartada en un lote: dice en cuál y no ofrece otro", () => {
    const f = ficha({ resto: { lote: { id: "l1", code: "LA-2026-061" } } });
    expect(motivoSinLote(f)).toBe("Ya está en el lote LA-2026-061");
  });
});

describe("medidasDeTarjeta", () => {
  it("D1, D2 y largo siempre, con el MISMO número que la etiqueta", () => {
    const t = { d1Cm: 55.25, d2Cm: 51, largoM: 7.284 };
    const [d1, d2, largo] = medidasDeTarjeta(t);
    const { diametros, largo: l } = partesDeMedidas({ ...t, diametroCm: null });
    expect(diametros).toContain(`D1 ${d1.valor}`);
    expect(diametros).toContain(`D2 ${d2.valor}`);
    expect(l).toBe(`L ${largo.valor} m`);
  });

  it("la que falta dice «—» y queda marcada como no medida", () => {
    const m = medidasDeTarjeta({ d1Cm: null, d2Cm: undefined, largoM: 4 });
    expect(m.map((x) => x.valor)).toEqual(["—", "—", "4.00"]);
    expect(m.map((x) => x.medida)).toEqual([false, false, true]);
  });
});

describe("ptDeTarjeta", () => {
  it("el PT Oxapampa congelado manda, con sus medidas en pulgadas y pies", () => {
    const pt = ptDeTarjeta(ficha({ troza: { oxPt: 195.92, oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12 } }).troza);
    expect(pt).toEqual({ tipo: "oxapampa", valor: "196", medidas: "18″ · 22″ · 12′" });
  });

  it("sin Oxapampa: el aserrable estimado al 56 % (1,606 m³ → ≈381 pt), nunca × 424 a secas", () => {
    expect(ptDeTarjeta(ficha().troza)).toEqual({ tipo: "aserrable", valor: "381" });
  });

  it("sin volumen ni Oxapampa no inventa un pt", () => {
    expect(ptDeTarjeta(ficha({ troza: { volumenM3: null } }).troza)).toBeNull();
    expect(ptDeTarjeta(ficha({ troza: { volumenM3: 0, oxPt: 0 } }).troza)).toBeNull();
  });

  it("m³ con tres decimales siempre", () => {
    expect(m3DeTarjeta({ volumenM3: 1.2 })).toBe("1.200");
    expect(m3DeTarjeta({ volumenM3: null })).toBe("—");
  });
});

describe("fotosDeTarjeta", () => {
  it("limpia lo que no es foto y deja la privada con su sello", () => {
    const fotos = fotosDeTarjeta(
      ficha({ ingreso: { fotos: ["javascript:alert(1)", { url: "priv:t1/forestal-carga/a.webp", sellada: true }, 3] } }),
    );
    expect(fotos).toEqual([{ url: "priv:t1/forestal-carga/a.webp", sellada: true }]);
    expect(fotosDeTarjeta(ficha())).toEqual([]);
  });
});

describe("motivoDeRespuesta", () => {
  it("404 y 400 = no está (el servidor no confirma si es de otro negocio)", () => {
    expect(motivoDeRespuesta(404, "not_found")).toEqual({ fase: "no_encontrada" });
    expect(motivoDeRespuesta(400, "missing_id")).toEqual({ fase: "no_encontrada" });
  });

  it("sesión vencida, módulo apagado, rol sin acceso y servidor caído piden cosas distintas", () => {
    expect(motivoDeRespuesta(401, "unauthorized")).toEqual({ fase: "error", motivo: "sesion" });
    expect(motivoDeRespuesta(403, "specialization_disabled")).toEqual({ fase: "error", motivo: "modulo" });
    expect(motivoDeRespuesta(403, "forbidden")).toEqual({ fase: "error", motivo: "permiso" });
    expect(motivoDeRespuesta(500, null)).toEqual({ fase: "error", motivo: "servidor" });
    expect(motivoDeRespuesta(429, "rate_limited")).toEqual({ fase: "error", motivo: "servidor" });
  });
});
