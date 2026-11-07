/**
 * __tests__/forestal-codigo-de-troza.test.ts
 *
 * El campo «Código» de «Producir sin lote» (Brandon, 2026-09-14): sugiere las
 * trozas DISPONIBLES del patio por su código y, al elegir una, pone su especie
 * en el nombre del catálogo. Los datos de las pruebas salen de lo medido en
 * Blas: códigos cortos («25», «17», «5») y 49 de 160 trozas con «-».
 */
import { describe, expect, it } from "vitest";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import {
  TOPE_SUGERENCIAS,
  esCodigoReal,
  resolverEspecie,
  sinCodigoDeTroza,
  sugerirCodigosDeTroza,
  trozaDeCodigoExacto,
  trozasParaCodigo,
  type TrozaParaCodigo,
} from "@/lib/forestal/codigo-de-troza";

const troza = (p: Partial<TrozaConsumible> & { id: string }): TrozaConsumible => ({
  woodEntryId: "w1",
  codificacion: null,
  especieComun: "Tornillo",
  volumenM3: 1,
  gtfNumber: "019-001-0000013",
  ...p,
});

let seq = 0;
const enPatio = (codigo: string, extra: Partial<TrozaParaCodigo> = {}): TrozaParaCodigo => ({
  id: `t${seq++}`,
  codigo,
  permiso: null,
  especie: "Tornillo",
  m3: 1,
  guia: "019-001-0000013",
  d1Cm: null,
  d2Cm: null,
  largoM: null,
  ...extra,
});
const codigos = (ts: TrozaParaCodigo[]) => ts.map((t) => t.codigo);

describe("trozasParaCodigo — sólo lo que se puede usar, y con código real", () => {
  it("deja afuera consumida, despachada, descarte, madre retrozada, sin llegar y sin volumen", () => {
    const r = trozasParaCodigo([
      troza({ id: "libre", codificacion: "25" }),
      troza({ id: "apartada", codificacion: "26", loteAserrioId: "l1", loteAserrioCode: "LA-1" }),
      troza({ id: "consumida", codificacion: "27", consumidaEnId: "c1" }),
      troza({ id: "despachada", codificacion: "28", despachadaEnId: "d1" }),
      troza({ id: "descarte", codificacion: "29", descarte: true }),
      troza({ id: "madre", codificacion: "30", retrozos: 2 }),
      troza({ id: "no-llego", codificacion: "31", noRecepcionada: true }),
      troza({ id: "sin-volumen", codificacion: "32", volumenM3: 0 }),
    ]);
    expect(r.map((t) => t.id)).toEqual(["libre", "apartada"]);
  });

  it("una troza de guía sin recibir no se ofrece: no llegó a la planta (104 de 111 códigos en Blas)", () => {
    const r = trozasParaCodigo([
      troza({ id: "recibida", codificacion: "5", guiaRecepcionada: true }),
      troza({ id: "pendiente", codificacion: "25", guiaRecepcionada: false }),
      // Sin el dato (respuesta vieja) se ofrece: el patio usa el mismo `!== false`.
      troza({ id: "sin-dato", codificacion: "17" }),
    ]);
    expect(r.map((x) => x.id)).toEqual(["recibida", "sin-dato"]);
  });

  it("el «-» de una guía sin codificar es «sin código»: no se ofrece (49 de 160 en Blas)", () => {
    const r = trozasParaCodigo([
      ...Array.from({ length: 49 }, (_, i) => troza({ id: `raya-${i}`, codificacion: "-" })),
      troza({ id: "raya-larga", codificacion: "—" }),
      troza({ id: "doble", codificacion: "--" }),
      troza({ id: "punto", codificacion: "." }),
      troza({ id: "espacios", codificacion: "   " }),
      troza({ id: "real", codificacion: " 17 " }),
    ]);
    expect(r).toEqual([expect.objectContaining({ id: "real", codigo: "17" })]);
  });

  it("si la codificación es el marcador, sirve el código de planta", () => {
    const r = trozasParaCodigo([troza({ id: "a", codificacion: "-", codigoPlanta: "P-8" })]);
    expect(r).toEqual([expect.objectContaining({ id: "a", codigo: "P-8" })]);
  });

  it("trae especie, m³, guía y medidas: con eso se distinguen dos opciones", () => {
    const [t] = trozasParaCodigo([
      troza({ id: "a", codificacion: "5", especieComun: "Cumala", volumenM3: 0.845, d1Cm: 42, d2Cm: 45, largoM: 4.2 }),
    ]);
    expect(t).toEqual({
      id: "a",
      codigo: "5",
      especie: "Cumala",
      m3: 0.845,
      guia: "019-001-0000013",
      // El permiso viaja junto al resto (ADR-417): con él los códigos anotados
      // proponen a qué título habilitante vincular la corrida.
      permiso: null,
      d1Cm: 42,
      d2Cm: 45,
      largoM: 4.2,
    });
  });
});

describe("esCodigoReal", () => {
  it.each(["-", "—", "--", ".", " - ", "", null, undefined])("«%s» no es un código", (v) => {
    expect(esCodigoReal(v)).toBe(false);
  });
  it.each(["5", "25", "AB-1", "t3"])("«%s» sí es un código", (v) => {
    expect(esCodigoReal(v)).toBe(true);
  });
});

describe("sugerirCodigosDeTroza — primero lo que empieza, después lo que contiene", () => {
  const patio = ["12", "32", "25", "2", "20", "5", "17", "21", "200"].map((c) => enPatio(c));

  it("«2» muestra 2, 20, 21, 25, 200 antes que 12 o 32", () => {
    expect(codigos(sugerirCodigosDeTroza(patio, "2"))).toEqual(["2", "20", "21", "25", "200", "12", "32"]);
  });

  it("no distingue mayúsculas", () => {
    const p = [enPatio("xab"), enPatio("AB-10")];
    expect(codigos(sugerirCodigosDeTroza(p, "ab"))).toEqual(["AB-10", "xab"]);
  });

  it("escribir «-» no lista nada, aunque haya códigos con guion", () => {
    const p = [...patio, enPatio("AB-10"), enPatio("C-2")];
    expect(sugerirCodigosDeTroza(p, "-")).toEqual([]);
    expect(sugerirCodigosDeTroza(p, " — ")).toEqual([]);
  });

  it("un código repetido da DOS opciones (no se deduplica) y el m³ las distingue", () => {
    const r = sugerirCodigosDeTroza([enPatio("25", { m3: 0.8 }), enPatio("25", { m3: 1.2 })], "25");
    expect(r).toHaveLength(2);
    expect(new Set(r.map((t) => t.m3)).size).toBe(2);
  });

  it("sin trozas o sin texto no sugiere nada", () => {
    expect(sugerirCodigosDeTroza([], "25")).toEqual([]);
    expect(sugerirCodigosDeTroza(patio, "")).toEqual([]);
    expect(sugerirCodigosDeTroza(patio, "   ")).toEqual([]);
  });

  it("corta en el tope", () => {
    const muchos = Array.from({ length: 20 }, (_, i) => enPatio(`1${i}`));
    expect(sugerirCodigosDeTroza(muchos, "1")).toHaveLength(TOPE_SUGERENCIAS);
  });
});

describe("trozaDeCodigoExacto — escrito a mano, sin elegir de la lista", () => {
  it("coincide sin mayúsculas ni espacios de más", () => {
    const t = enPatio("AB-1");
    expect(trozaDeCodigoExacto([enPatio("AB-10"), t], " ab-1 ")).toBe(t);
  });

  it("un código que no está en el patio no devuelve nada (queda tal cual)", () => {
    expect(trozaDeCodigoExacto([enPatio("25")], "99")).toBeNull();
  });

  it("dos trozas con el mismo código y distinta especie: no adivina", () => {
    const p = [enPatio("25", { especie: "Tornillo" }), enPatio("25", { especie: "Cumala" })];
    expect(trozaDeCodigoExacto(p, "25")).toBeNull();
  });

  it("dos con la misma especie escrita distinto: da igual cuál, la especie es una", () => {
    const p = [enPatio("25", { especie: "TORNILLO" }), enPatio("25", { especie: "Tornillo" })];
    expect(trozaDeCodigoExacto(p, "25")?.especie).toBe("TORNILLO");
  });

  it("el marcador «-» nunca coincide", () => {
    expect(trozaDeCodigoExacto([enPatio("-")], "-")).toBeNull();
  });
});

describe("resolverEspecie — el nombre que ofrece el catálogo", () => {
  const catalogo = ["Tornillo", "Cumala", "Shihuahuaco"];

  it("si ya está en el catálogo, esa", () => {
    expect(resolverEspecie("Cumala", catalogo)).toBe("Cumala");
  });

  it("«TORNILLO» y «Tornillo (Cedrelinga catenaeformis)» son «Tornillo»", () => {
    expect(resolverEspecie("TORNILLO", catalogo)).toBe("Tornillo");
    expect(resolverEspecie("Tornillo (Cedrelinga catenaeformis)", catalogo)).toBe("Tornillo");
    expect(resolverEspecie("shihuahuáco", catalogo)).toBe("Shihuahuaco");
  });

  it("si el catálogo no la tiene, va el nombre tal cual", () => {
    expect(resolverEspecie(" Moena ", catalogo)).toBe("Moena");
  });

  it("la troza sin especie no toca la que está puesta", () => {
    expect(resolverEspecie(null, catalogo)).toBeNull();
    expect(resolverEspecie("  ", catalogo)).toBeNull();
  });
});

describe("sinCodigoDeTroza", () => {
  it("saca el código y deja todo lo demás", () => {
    expect(sinCodigoDeTroza({ id: "p1", cantidad: 3, especie: "Tornillo", codigo: "25" })).toEqual({
      id: "p1",
      cantidad: 3,
      especie: "Tornillo",
    });
  });
});
