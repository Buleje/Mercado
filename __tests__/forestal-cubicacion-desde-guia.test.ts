import { describe, expect, it } from "vitest";
import { llenarFichaDesdeGuia, revertirLlenado, type GuiaParaFicha } from "@/lib/forestal/cubicacion-desde-guia";
import { lineasDeFichaParaPapel } from "@/components/admin/forestal/cubicador-papel/papel-cubicador";
import { htmlDePlanilla } from "@/lib/forestal/planillas/imprimir";
import { planillaPorId } from "@/lib/forestal/planillas/catalogo";

const guia: GuiaParaFicha = {
  gtfNumber: "001-000123", titularName: "CCNN San Luis", tituloHabilitante: "25-UCA/PER-1", placaVehiculo: "abc-123",
  conductor: "Juan Pérez", destino: null,
};

describe("llenarFichaDesdeGuia", () => {
  it("llena sólo los vacíos y no pisa lo escrito", () => {
    const { patch, campos } = llenarFichaDesdeGuia({ placa: "XYZ-999" }, guia);
    expect(patch).toEqual({ comunidad: "CCNN San Luis", tituloHabilitante: "25-UCA/PER-1", chofer: "Juan Pérez" });
    expect(campos).toEqual(["comunidad", "tituloHabilitante", "chofer"]);
  });
  it("la placa de la guía va en mayúsculas y lo vacío en blanco cuenta como vacío", () => {
    const { patch } = llenarFichaDesdeGuia({ placa: "  " }, guia);
    expect(patch.placa).toBe("ABC-123");
  });
  it("nada que llenar si la ficha ya lo tiene todo", () => {
    const f = { comunidad: "a", tituloHabilitante: "b", placa: "c", chofer: "d", destino: "e" };
    expect(llenarFichaDesdeGuia(f, { ...guia, destino: "Lima" }).campos).toEqual([]);
  });
  it("deshacer quita lo puesto, no lo que cambiaste después", () => {
    const { patch } = llenarFichaDesdeGuia({}, guia);
    const despues = { ...patch, chofer: "Otro" };
    expect(revertirLlenado(despues, patch)).toEqual({ chofer: "Otro" });
  });
});

describe("ficha en la hoja", () => {
  it("lista sólo lo que hay, en orden", () => {
    expect(lineasDeFichaParaPapel({ cliente: "Maderera", gtfNumber: "001-1", ficha: { placa: "ABC-123", lugar: " " } }))
      .toEqual([{ etiqueta: "Comprador", valor: "Maderera" }, { etiqueta: "GTF", valor: "001-1" }, { etiqueta: "Placa", valor: "ABC-123" }]);
  });
  it("la hoja imprime la ficha escapada; sin ficha no hay franja", () => {
    const p = planillaPorId("aserrada-pt")!;
    const con = htmlDePlanilla(p, { ficha: [{ etiqueta: "CCNN", valor: "San <b>Luis" }] });
    expect(con).toContain('<p class="ficha"><span><b>CCNN:</b> San &lt;b&gt;Luis</span></p>');
    expect(htmlDePlanilla(p)).not.toContain('<p class="ficha">');
  });
});
