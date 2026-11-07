/**
 * ADR-512 · «qué DICE la guía» lo arma el servidor desde la misma entrada que
 * imprime la hoja SERFOR 2024; del pedido sólo pasan donde/clave/correcto.
 */
import { describe, expect, it } from "vitest";
import { CASILLEROS_GTF_2024, type CuerpoGtfInput, type LineaProducto } from "@/lib/forestal/ctp-gtf-formato";
import { gtfDatosVacio } from "@/lib/forestal/ctp-gtf-datos";
import { emptyCtpFicha } from "@/lib/forestal/ctp-ficha-types";
import { claveLineaCtp } from "@/lib/soporte/correccion-guia";
import {
  casillerosDeLaHoja,
  filaDeLineaCtp,
  normalizarCasillero,
  resolverCambios,
  type GuiaLeida,
} from "@/lib/soporte/correccion-guia-dice";

const rollo: LineaProducto = {
  cientifico: "Cedrelinga cateniformis",
  comun: "Tornillo",
  tipoProducto: "Madera en rollo",
  presentacion: "Trozas",
  cantidad: 2,
  unidad: "m3",
  total: 2.126,
};

function cuerpo(): CuerpoGtfInput {
  const datos = gtfDatosVacio();
  datos.propietario = { ...datos.propietario, docTipo: "RUC", docNumero: "20601234567" };
  return {
    ficha: { ...emptyCtpFicha(), razonSocial: "CC.NN. San Luis", arffs: "GORE Pasco", region: "Pasco" },
    datos,
    lineas: [rollo],
    numeroGtf: "019-001-0000004",
    fechaExpedicion: "2024-12-18",
    listasTrozas: "019-001-0000004",
    gtfOrigen: "",
  };
}

describe("casillerosDeLaHoja", () => {
  const hoja = casillerosDeLaHoja(cuerpo());

  it("trae los 58 casilleros del formato 2024 con su número en la etiqueta", () => {
    expect(hoja.size).toBe(CASILLEROS_GTF_2024.length);
    expect(hoja.get("1")).toEqual({ etiqueta: "(1) N°", dice: "019-001-0000004" });
    expect(hoja.get("13")?.dice).toBe("20601234567");
  });

  it("un casillero que la hoja deja en blanco dice null (no «»)", () => {
    expect(hoja.get("38")?.dice).toBeNull();
  });

  it("el detalle lleva la especie de la línea y el total movilizado", () => {
    const todo = [...hoja.values()].map((c) => c.dice ?? "").join("\n");
    expect(todo).toContain("Tornillo");
    expect(todo).toContain("Cedrelinga cateniformis");
  });
});

describe("resolverCambios", () => {
  const guia: GuiaLeida = {
    numero: "019-001-0000004",
    fecha: "2024-12-18",
    casilleros: new Map([
      ["12", { etiqueta: "(12) Propietario del producto", dice: "CC.NN. San Luis" }],
      ["34a", { etiqueta: "(34a) Especie", dice: null }],
    ]),
    filas: [{ clave: "A-15", alias: ["T-0015"], etiqueta: "Troza A-15", dice: "Tornillo · 0,612 m³" }],
  };

  it("dice sale de la guía aunque el pedido traiga otra cosa", () => {
    const pedido = [{ donde: "casillero" as const, clave: "(12)", correcto: "Comunidad San Luis", dice: "INVENTADO", etiqueta: "X" }];
    const r = resolverCambios(guia, pedido);
    expect(r).toEqual({
      ok: true,
      cambios: [{ donde: "casillero", clave: "(12)", correcto: "Comunidad San Luis", etiqueta: "(12) Propietario del producto", dice: "CC.NN. San Luis" }],
    });
  });

  it("casillero que el formato no tiene → error con la clave", () => {
    expect(resolverCambios(guia, [{ donde: "casillero", clave: "99", correcto: "x" }])).toEqual({
      ok: false,
      error: "casillero_desconocido",
      clave: "99",
    });
  });

  it("fila por código impreso o por código único, sin importar mayúsculas", () => {
    const r = resolverCambios(guia, [
      { donde: "item", clave: "t-0015", correcto: "0,598 m³" },
      { donde: "item", clave: " a-15 ", correcto: "Cumala" },
    ]);
    expect(r.ok && r.cambios.map((c) => [c.etiqueta, c.dice])).toEqual([
      ["Troza A-15", "Tornillo · 0,612 m³"],
      ["Troza A-15", "Tornillo · 0,612 m³"],
    ]);
  });

  it("ítem que la guía no lista → item_desconocido con la clave (como el casillero)", () => {
    expect(
      resolverCambios(guia, [
        { donde: "item", clave: "A-15", correcto: "x" },
        { donde: "item", clave: "NO-EXISTE-1", correcto: "y" },
      ]),
    ).toEqual({ ok: false, error: "item_desconocido", clave: "NO-EXISTE-1" });
  });

  it("renglón del CTP: «Línea #N» o el id del despacho; dice = lo que imprime el detalle (34)", () => {
    const fila = filaDeLineaCtp({ lineNo: 12, despachoId: "desp_12", producto: { ...rollo, presentacion: "PIEZAS", cantidad: 40 } }, [13]);
    expect(fila.clave).toBe(claveLineaCtp(12));
    expect(fila.clave).toBe("Línea #12");
    expect(fila.dice).toBe(
      "Tornillo (Cedrelinga cateniformis) · Madera en rollo · presentación PIEZAS · cantidad 40 · total 2.126 m3 · en la hoja va sumada con la línea #13",
    );
    const conLinea: GuiaLeida = { ...guia, filas: [fila] };
    const r = resolverCambios(conLinea, [
      { donde: "item", clave: "línea  #12", correcto: "Cumala" },
      { donde: "item", clave: "desp_12", correcto: "41 piezas" },
    ]);
    expect(r.ok && r.cambios.map((c) => c.etiqueta)).toEqual(["Línea #12", "Línea #12"]);
    expect(resolverCambios(conLinea, [{ donde: "item", clave: "Línea #99", correcto: "x" }])).toMatchObject({
      ok: false,
      error: "item_desconocido",
    });
  });

  it("normalizarCasillero acepta «(34A)», « 12 »", () => {
    expect(normalizarCasillero("(34A)")).toBe("34a");
    expect(normalizarCasillero(" 12 ")).toBe("12");
  });
});
