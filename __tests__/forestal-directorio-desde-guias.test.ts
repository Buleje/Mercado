import { describe, expect, it } from "vitest";
import {
  candidatoAInputParte,
  claveDeParte,
  conflictosConDirectorio,
  descubrirEnGuias,
  mismaEntidadPorNombre,
  normalizarNombre,
  normalizarPlaca,
  type CandidatoParte,
  type GuiaConPartes,
} from "@/lib/forestal/directorio-desde-guias";

/** Una guía como las 17 del tenant real: titular + destinatario + chofer. */
const guia = (over: Partial<GuiaConPartes> = {}): GuiaConPartes => ({
  gtfNumber: "019-0000016",
  providerName: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI",
  providerDocument: "20601234567",
  providerDocumentType: "RUC",
  gtfDatos: {
    destinatario: { nombre: "Inversiones Blas SAC", docTipo: "RUC", docNumero: "20605859438" },
    vehiculo: { modo: "terrestre", placa: "V5S-858", conductor: "Rubén Bazán", conductorDni: "48831805" },
  },
  ...over,
});

describe("claveDeParte", () => {
  it("el documento manda sobre el nombre", () => {
    expect(claveDeParte("20601234567", "Maderera X")).toBe("doc:20601234567");
    // Con guiones o espacios es el mismo documento.
    expect(claveDeParte("206-0123 4567", "Otro nombre")).toBe("doc:20601234567");
  });

  it("sin documento cae al nombre normalizado", () => {
    expect(claveDeParte(null, "  Maderera   El Aguajal ")).toBe("nom:MADERERA EL AGUAJAL");
    expect(claveDeParte("", "MADERERA EL AGUAJAL")).toBe("nom:MADERERA EL AGUAJAL");
  });
});

describe("normalizarNombre", () => {
  it("saca tildes, dobles espacios y mayúsculas", () => {
    expect(normalizarNombre(" Rubén  Bazán ")).toBe("RUBEN BAZAN");
  });
});

describe("descubrirEnGuias", () => {
  it("saca los cuatro roles de una sola guía", () => {
    const r = descubrirEnGuias([guia()]);
    expect(r.partes.map((p) => p.roles).flat().sort()).toEqual([
      "conductor", "destinatario", "proveedor",
    ]);
    expect(r.vehiculos).toEqual([{ placa: "V5S-858", modo: "terrestre", guias: 1 }]);
  });

  it("cuenta en cuántas guías aparece y ordena por frecuencia", () => {
    const r = descubrirEnGuias([
      guia({ gtfNumber: "A" }),
      guia({ gtfNumber: "B" }),
      guia({ gtfNumber: "C", providerName: "Maderera Rara", providerDocument: "10000000001" }),
    ]);
    expect(r.partes[0]).toMatchObject({ guias: 3 }); // el destinatario está en las 3
    expect(r.partes.find((p) => p.nombre === "Maderera Rara")?.guias).toBe(1);
  });

  it("no repite: la misma persona con y sin documento es UNA", () => {
    const r = descubrirEnGuias([
      guia({ gtfNumber: "A" }),
      guia({ gtfNumber: "B", providerDocument: "20601234567", providerName: "COMUNIDAD NATIVA SAN LUIS" }),
    ]);
    const prov = r.partes.filter((p) => p.roles.includes("proveedor"));
    expect(prov).toHaveLength(1);
    expect(prov[0].guias).toBe(2);
  });

  it("el documento completa la ficha aunque llegue en la segunda guía", () => {
    const r = descubrirEnGuias([
      { gtfNumber: "A", providerName: "Maderera Sin Doc" },
      { gtfNumber: "B", providerName: "Maderera Sin Doc", providerDocument: "20777777777", providerDocumentType: "RUC" },
    ]);
    // Sin documento la clave es el nombre, así que son la misma fila…
    expect(r.partes).toHaveLength(1);
    // …y se queda con el dato más completo de las dos.
    expect(r.partes[0]).toMatchObject({ docNumero: "20777777777", docTipo: "RUC" });
  });

  it("lo que YA está en la libreta no se vuelve a proponer", () => {
    const r = descubrirEnGuias([guia()], new Set(["doc:20601234567"]));
    expect(r.partes.some((p) => p.roles.includes("proveedor"))).toBe(false);
    // El resto sigue apareciendo.
    expect(r.partes.some((p) => p.roles.includes("destinatario"))).toBe(true);
  });

  it("una placa ya cargada tampoco", () => {
    expect(descubrirEnGuias([guia()], new Set(), new Set(["V5S-858"])).vehiculos).toEqual([]);
  });

  it("por río la matrícula de la embarcación hace de placa", () => {
    const r = descubrirEnGuias([
      guia({ gtfDatos: { vehiculo: { modo: "fluvial", embarcacion: "Chata San Juan", placa: "" } } }),
    ]);
    expect(r.vehiculos).toEqual([{ placa: "CHATA SAN JUAN", modo: "fluvial", guias: 1 }]);
  });

  it("un `gtfDatos` corrupto no rompe el descubrimiento", () => {
    expect(() => descubrirEnGuias([guia({ gtfDatos: "no es un objeto" })])).not.toThrow();
    // El proveedor del propio ingreso se sigue leyendo.
    expect(descubrirEnGuias([guia({ gtfDatos: null })]).partes).toHaveLength(1);
  });

  it("un nombre vacío no entra a la libreta", () => {
    const r = descubrirEnGuias([
      { gtfNumber: "A", providerName: "   ", gtfDatos: { vehiculo: { conductor: "" } } },
    ]);
    expect(r.partes).toEqual([]);
  });

  it("guarda hasta 3 guías de ejemplo para que se lo reconozca", () => {
    const r = descubrirEnGuias(["A", "B", "C", "D"].map((n) => guia({ gtfNumber: n })));
    expect(r.partes[0].ejemplos).toEqual(["A", "B", "C"]);
  });
});

describe("normalizarPlaca", () => {
  it("la misma chata escrita de tres formas es UNA placa", () => {
    // Medido en el tenant real: «V2H-901 /» y «V2H-901 / -----» eran dos filas.
    expect(normalizarPlaca("V2H-901 /")).toBe("V2H-901");
    expect(normalizarPlaca("V2H-901 / -----")).toBe("V2H-901");
    expect(normalizarPlaca("v2h-901")).toBe("V2H-901");
  });

  it("lo que no parece placa se conserva, no se descarta", () => {
    expect(normalizarPlaca("Chata San Juan")).toBe("CHATA SAN JUAN");
    expect(normalizarPlaca(null)).toBe("");
  });

  it("las tres escrituras colapsan en una sola propuesta", () => {
    const r = descubrirEnGuias([
      { gtfNumber: "A", gtfDatos: { vehiculo: { placa: "V2H-901 /" } } },
      { gtfNumber: "B", gtfDatos: { vehiculo: { placa: "V2H-901 / -----" } } },
      { gtfNumber: "C", gtfDatos: { vehiculo: { placa: "V2H-901" } } },
    ]);
    expect(r.vehiculos).toEqual([{ placa: "V2H-901", modo: null, guias: 3 }]);
  });
});

/**
 * Los tres proveedores medidos en el tenant real `cmpxiv6p4000bohvzwl6bnfpv`
 * (24 guías, ninguno en `ForestParty`): un RUC que llegó con dos nombres
 * distintos, y esa misma comunidad ya en la libreta con OTRO RUC.
 */
describe("descubrirEnGuias — proveedores reales del tenant (evidencia medida)", () => {
  const guiaProveedor = (over: Partial<GuiaConPartes>): GuiaConPartes => ({ gtfNumber: "X", ...over });

  it("un RUC con dos nombres distintos NO se funde en silencio: guarda el otro nombre para revisar", () => {
    const guias = [
      guiaProveedor({ gtfNumber: "1", providerName: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS", providerDocument: "20562836927", providerDocumentType: "RUC" }),
      guiaProveedor({ gtfNumber: "2", providerName: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS", providerDocument: "20562836927", providerDocumentType: "RUC" }),
      guiaProveedor({ gtfNumber: "3", providerName: "QUINCHUNLLA PEREZ, NELLY", providerDocument: "20562836927", providerDocumentType: "RUC" }),
    ];
    const r = descubrirEnGuias(guias);
    const fila = r.partes.find((p) => p.docNumero === "20562836927");
    // Antes de este fix, la tercera guía se sumaba en silencio bajo el primer
    // nombre visto y "QUINCHUNLLA PEREZ, NELLY" desaparecía de la propuesta.
    expect(fila?.guias).toBe(3);
    expect(fila?.otrosNombres).toEqual(["QUINCHUNLLA PEREZ, NELLY"]);
  });

  it("el nombre principal es el de la mayoría aunque la guía minoritaria llegue primero", () => {
    // Caso de la QA 2026-09-14: la base devolvió primero la guía de Nelly y se
    // proponía su nombre para el RUC de la comunidad, que tiene 2 de 3 guías.
    const guias = [
      guiaProveedor({ gtfNumber: "3", providerName: "QUINCHUNLLA PEREZ, NELLY", providerDocument: "20562836927", providerDocumentType: "RUC" }),
      guiaProveedor({ gtfNumber: "1", providerName: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS", providerDocument: "20562836927", providerDocumentType: "RUC" }),
      guiaProveedor({ gtfNumber: "2", providerName: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS", providerDocument: "20562836927", providerDocumentType: "RUC" }),
    ];
    const fila = descubrirEnGuias(guias).partes.find((p) => p.docNumero === "20562836927");
    expect(fila?.nombre).toBe("COMUNIDAD NATIVA SANTA ROSA DE CHIVIS");
    expect(fila?.otrosNombres).toEqual(["QUINCHUNLLA PEREZ, NELLY"]);
    expect(fila?.guias).toBe(3);
  });

  it("empate de nombres: gana el que llegó primero (la guía más reciente)", () => {
    const guias = [
      guiaProveedor({ gtfNumber: "B", providerName: "MADERERA B", providerDocument: "20111111111", providerDocumentType: "RUC" }),
      guiaProveedor({ gtfNumber: "A", providerName: "MADERERA A", providerDocument: "20111111111", providerDocumentType: "RUC" }),
    ];
    const fila = descubrirEnGuias(guias).partes[0];
    expect(fila).toMatchObject({ nombre: "MADERERA B", otrosNombres: ["MADERERA A"] });
  });

  it("candidatos ordenados por guías: el que más se repite va primero", () => {
    const guias = [
      ...Array.from({ length: 21 }, (_, i) =>
        guiaProveedor({ gtfNumber: `S${i}`, providerName: "SANTOS MUÑOZ JOSE HORD", providerDocument: "20489250731", providerDocumentType: "RUC" }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        guiaProveedor({ gtfNumber: `C${i}`, providerName: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS", providerDocument: "20562836927", providerDocumentType: "RUC" }),
      ),
      guiaProveedor({ gtfNumber: "N1", providerName: "QUINCHUNLLA PEREZ, NELLY", providerDocument: "20562836927", providerDocumentType: "RUC" }),
    ];
    const r = descubrirEnGuias(guias);
    expect(r.partes[0]).toMatchObject({ nombre: "SANTOS MUÑOZ JOSE HORD", guias: 21 });
    expect(r.partes[1]).toMatchObject({ guias: 3 }); // comunidad + Nelly, mismo RUC
  });

  it("un proveedor sin documento igual se propone, por nombre", () => {
    const r = descubrirEnGuias([guiaProveedor({ gtfNumber: "S1", providerName: "Aserradero El Puente" })]);
    expect(r.partes).toMatchObject([{ nombre: "Aserradero El Puente", docNumero: null, guias: 1 }]);
  });
});

describe("mismaEntidadPorNombre", () => {
  it("el mismo lugar con un adjetivo de más es la misma entidad", () => {
    expect(mismaEntidadPorNombre("COMUNIDAD SANTA ROSA DE CHIVIS", "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS")).toBe(true);
  });
  it("dos nombres sin relación no matchean", () => {
    expect(mismaEntidadPorNombre("SANTOS MUÑOZ JOSE HORD", "COMUNIDAD SANTA ROSA DE CHIVIS")).toBe(false);
  });
  it("una sola palabra en común no alcanza", () => {
    expect(mismaEntidadPorNombre("SAN", "COMUNIDAD SAN JUAN")).toBe(false);
  });
});

describe("conflictosConDirectorio", () => {
  const partesDirectorio = [
    { id: "p1", nombre: "COMUNIDAD SANTA ROSA DE CHIVIS", docTipo: "RUC", docNumero: "20156698963" },
    { id: "p2", nombre: "Maderera San Martín S.A.C.", docTipo: "RUC", docNumero: "20605859438" },
  ];

  it("mismo nombre (con NATIVA de más) y OTRO documento: se avisa, no se descarta", () => {
    const candidato: CandidatoParte = {
      clave: "doc:20562836927",
      nombre: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS",
      docTipo: "RUC",
      docNumero: "20562836927",
      roles: ["proveedor"],
      guias: 3,
      ejemplos: ["1"],
    };
    const r = conflictosConDirectorio([candidato], partesDirectorio);
    expect(r).toHaveLength(1);
    expect(r[0].parte.id).toBe("p1");
  });

  it("nombres sin relación no generan conflicto", () => {
    const candidato: CandidatoParte = {
      clave: "doc:20489250731",
      nombre: "SANTOS MUÑOZ JOSE HORD",
      docTipo: "RUC",
      docNumero: "20489250731",
      roles: ["proveedor"],
      guias: 21,
      ejemplos: ["1"],
    };
    expect(conflictosConDirectorio([candidato], partesDirectorio)).toEqual([]);
  });

  it("mismo documento no es conflicto — es la misma parte", () => {
    const candidato: CandidatoParte = {
      clave: "doc:20605859438",
      nombre: "Maderera San Martin SAC",
      docTipo: "RUC",
      docNumero: "20605859438",
      roles: ["proveedor"],
      guias: 1,
      ejemplos: ["1"],
    };
    expect(conflictosConDirectorio([candidato], partesDirectorio)).toEqual([]);
  });

  it("sin documento de un lado no hay con qué distinguir: no conflictúa", () => {
    const candidato: CandidatoParte = {
      clave: "nom:COMUNIDAD NATIVA SANTA ROSA DE CHIVIS",
      nombre: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS",
      docTipo: null,
      docNumero: null,
      roles: ["proveedor"],
      guias: 1,
      ejemplos: ["1"],
    };
    expect(conflictosConDirectorio([candidato], partesDirectorio)).toEqual([]);
  });
});

describe("candidatoAInputParte", () => {
  const base: CandidatoParte = {
    clave: "doc:20489250731",
    nombre: "SANTOS MUÑOZ JOSE HORD",
    docTipo: "RUC",
    docNumero: "20489250731",
    roles: ["proveedor"],
    guias: 21,
    ejemplos: ["019-0000016"],
  };

  it("arma el alta con el documento y la nota de origen", () => {
    const input = candidatoAInputParte(base);
    expect(input).toMatchObject({
      roles: ["proveedor"],
      nombre: "SANTOS MUÑOZ JOSE HORD",
      docTipo: "RUC",
      docNumero: "20489250731",
    });
    expect(input.notas).toContain("019-0000016");
  });

  it("avisa en la nota cuando hay otro nombre bajo el mismo documento", () => {
    const input = candidatoAInputParte({ ...base, otrosNombres: ["QUINCHUNLLA PEREZ, NELLY"] });
    expect(input.notas).toContain("QUINCHUNLLA PEREZ, NELLY");
  });

  it("avisa en la nota cuando hay un conflicto con el directorio", () => {
    const input = candidatoAInputParte(base, {
      conflictoDirectorio: { id: "p1", nombre: "COMUNIDAD SANTA ROSA DE CHIVIS", docTipo: "RUC", docNumero: "20156698963" },
    });
    expect(input.notas).toContain("COMUNIDAD SANTA ROSA DE CHIVIS");
  });
});
