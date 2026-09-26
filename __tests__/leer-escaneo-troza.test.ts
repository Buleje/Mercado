import { describe, expect, it } from "vitest";
import {
  buscarTrozaEscaneada,
  claveDeCodigo,
  consumibleDeFicha,
  exactasPrimero,
  leerEscaneo,
} from "@/lib/forestal/leer-escaneo-troza";
import { motivoBloqueo } from "@/lib/forestal/consumo-trozas";

const ID = "cmf1a2b3c4d5e6f7g8h9i0j1k";

describe("leerEscaneo", () => {
  it("el QR nuevo /admin/q/<id> trae el id", () => {
    expect(leerEscaneo(`https://blas.buleje.pe/admin/q/${ID}`)).toEqual({ tipo: "id", id: ID });
    expect(leerEscaneo(`http://localhost:3000/admin/q/${ID}?x=1`)).toEqual({ tipo: "id", id: ID });
  });

  it("el QR viejo ?troza=<id> también", () => {
    expect(
      leerEscaneo(`https://x.pe/admin?tab=ctp-libro-operaciones&vista=trozas&troza=${ID}`),
    ).toEqual({ tipo: "id", id: ID });
    expect(leerEscaneo(`/admin?tab=ctp&troza=${ID}`)).toEqual({ tipo: "id", id: ID });
  });

  it("una dirección que no es de una troza no se lee como código", () => {
    expect(leerEscaneo("https://google.com/")).toBeNull();
    expect(leerEscaneo("https://x.pe/admin?tab=ctp")).toBeNull();
  });

  it("un Code128 o un tipeo es un código, en mayúsculas y sin espacios de más", () => {
    expect(leerEscaneo("  118 ")).toEqual({ tipo: "codigo", codigo: "118" });
    expect(leerEscaneo("115-a")).toEqual({ tipo: "codigo", codigo: "115-A" });
    expect(leerEscaneo("13/A   (0000008)")).toEqual({ tipo: "codigo", codigo: "13/A (0000008)" });
  });

  it("vacío = nada", () => {
    expect(leerEscaneo("")).toBeNull();
    expect(leerEscaneo("   ")).toBeNull();
    expect(leerEscaneo(null)).toBeNull();
  });
});

describe("buscarTrozaEscaneada", () => {
  const trozas = [
    { id: "a", codigoPlanta: "118", codificacion: "13/A (0000008)" },
    { id: "b", codigoPlanta: "118", codificacion: "14" },
    { id: "c", codigoPlanta: "1180", codificacion: "15" },
    { id: "d", codigoPlanta: null, codificacion: "115-A" },
    { id: "e", codigoPlanta: "22", codificacion: "-" },
    { id: "f", codigoPlanta: null, codificacion: "-" },
  ];

  it("por id: la de ese id", () => {
    expect(buscarTrozaEscaneada(trozas, { tipo: "id", id: "c" })).toEqual({
      estado: "una",
      troza: trozas[2],
    });
    expect(buscarTrozaEscaneada(trozas, { tipo: "id", id: "zz" })).toEqual({ estado: "ninguna" });
  });

  it("un código en dos trozas NO se elige a ciegas: devuelve las candidatas", () => {
    const r = buscarTrozaEscaneada(trozas, leerEscaneo("118"));
    expect(r.estado).toBe("varias");
    expect(r.estado === "varias" && r.trozas.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("exacto: 118 no encuentra 1180", () => {
    const r = buscarTrozaEscaneada(trozas, leerEscaneo("1180"));
    expect(r).toEqual({ estado: "una", troza: trozas[2] });
  });

  it("si nadie tiene ese código de planta, busca la codificación del bosque", () => {
    expect(buscarTrozaEscaneada(trozas, leerEscaneo("115-a"))).toEqual({
      estado: "una",
      troza: trozas[3],
    });
    expect(buscarTrozaEscaneada(trozas, leerEscaneo("13/A(0000008)"))).toEqual({
      estado: "una",
      troza: trozas[0],
    });
  });

  it("«-» es sin código: no identifica ninguna pieza", () => {
    expect(buscarTrozaEscaneada(trozas, leerEscaneo("-"))).toEqual({ estado: "ninguna" });
  });

  it("un tipeo que es el id pelado también la encuentra", () => {
    const conId = [{ id: ID, codigoPlanta: null, codificacion: null }];
    expect(buscarTrozaEscaneada(conId, leerEscaneo(ID))).toEqual({
      estado: "una",
      troza: conId[0],
    });
  });

  it("sin lectura, ninguna", () => {
    expect(buscarTrozaEscaneada(trozas, null)).toEqual({ estado: "ninguna" });
  });
});

describe("claveDeCodigo / exactasPrimero", () => {
  it("espacios, tildes y mayúsculas no cuentan", () => {
    expect(claveDeCodigo(" 13/a (0000008) ")).toBe(claveDeCodigo("13/A(0000008)"));
    expect(claveDeCodigo("Ñá")).toBe("NA");
  });

  it("la exacta sale arriba de sus parecidas", () => {
    const ts = [
      { id: "x", codigoPlanta: "1180" },
      { id: "y", codigoPlanta: "118" },
    ];
    expect(exactasPrimero(ts, "118").map((t) => t.id)).toEqual(["y", "x"]);
  });
});

describe("consumibleDeFicha", () => {
  const base = {
    troza: {
      id: "t",
      codificacion: "5",
      codigoPlanta: "118",
      especieComun: "Tornillo",
      volumenM3: 1.2,
    },
    ingreso: { id: "w", gtfNumber: "G-1" },
  };

  it("una corrida anulada no bloquea; una vigente sí", () => {
    expect(
      motivoBloqueo(consumibleDeFicha({ ...base, corrida: { id: "c", vigente: false } })),
    ).toBeNull();
    expect(motivoBloqueo(consumibleDeFicha({ ...base, corrida: { id: "c", vigente: true } }))).toBe(
      "ya_consumida",
    );
  });

  it("una madre con pedazos se lee retrozada", () => {
    expect(motivoBloqueo(consumibleDeFicha({ ...base, retrozos: [{}, {}] }))).toBe(
      "madre_retrozada",
    );
  });
});
