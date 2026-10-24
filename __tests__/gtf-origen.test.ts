/** Origen de una guía del Libro TH (07-10): importada de SERFOR, de foto/PDF o creada a mano. */
import { describe, expect, it } from "vitest";
import { origenDeGuia } from "@/lib/forestal/gtf-origen";
import { observacionGuia } from "@/lib/forestal/loth-importar-guia";

describe("origenDeGuia", () => {
  it("la nota que deja el importador verificado → SERFOR con su N° de registro", () => {
    expect(origenDeGuia(observacionGuia("2025-0001234", true))).toEqual({ origen: "serfor", registro: "2025-0001234" });
  });

  it("importada desde foto o PDF → documento, con el registro si lo trae", () => {
    expect(origenDeGuia(observacionGuia("777", false))).toEqual({ origen: "documento", registro: "777" });
    expect(origenDeGuia(observacionGuia("", false))).toEqual({ origen: "documento", registro: null });
  });

  it("sin nota, con nota propia o con la nota editada a mano → manual", () => {
    expect(origenDeGuia(null)).toEqual({ origen: "manual", registro: null });
    expect(origenDeGuia("Despacho del sábado")).toEqual({ origen: "manual", registro: null });
    expect(origenDeGuia(`${observacionGuia("1", true)} Corregida.`)).toEqual({ origen: "manual", registro: null });
  });
});
