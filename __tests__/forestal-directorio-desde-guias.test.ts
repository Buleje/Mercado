import { describe, expect, it } from "vitest";
import {
  claveDeParte,
  descubrirEnGuias,
  normalizarNombre,
  normalizarPlaca,
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
