/**
 * ADR-457 · del JSON Schema de las opciones al formulario del superadmin.
 * Se prueba con los schemas REALES de las piezas del repo, no con inventados.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { opcionesCierreParaContador } from "@/extensiones/cierre-para-contador/manifest";
import { opcionesHojaDeControl } from "@/extensiones/gtf-hoja-de-control/manifest";
import { camposDeSchema, opcionesDeValores, rotuloDeClave } from "@/components/superadmin/piezas/campos-de-schema";

const aSchema = (s: z.ZodType) => z.toJSONSchema(s, { io: "input", unrepresentable: "any" });

describe("camposDeSchema", () => {
  it("cierre-para-contador: texto, dos listas de columnas con su rótulo y un sí/no", () => {
    const campos = camposDeSchema(aSchema(opcionesCierreParaContador));
    expect(campos?.map((c) => [c.clave, c.tipo])).toEqual([
      ["contador", "texto"],
      ["columnasVentas", "varias"],
      ["incluirGastos", "booleano"],
      ["columnasGastos", "varias"],
    ]);
    const ventas = campos?.find((c) => c.clave === "columnasVentas");
    expect(ventas?.tipo === "varias" && ventas.opciones.find((o) => o.valor === "ruc")?.rotulo).toBe("RUC del cliente");
    expect(ventas?.rotulo).toBe("Columnas de ventas");
  });

  it("gtf-hoja-de-control: listas de textos y un texto largo, con rótulo sacado de la clave", () => {
    const campos = camposDeSchema(aSchema(opcionesHojaDeControl));
    expect(campos?.map((c) => [c.clave, c.tipo])).toEqual([
      ["titulo", "texto"],
      ["firmas", "lista"],
      ["verificaciones", "lista"],
      ["mostrarOrigen", "booleano"],
      ["nota", "texto"],
    ]);
    expect(campos?.find((c) => c.clave === "mostrarOrigen")?.rotulo).toBe("Mostrar origen");
    const firmas = campos?.find((c) => c.clave === "firmas");
    expect(firmas?.tipo === "lista" && [firmas.min, firmas.max]).toEqual([1, 4]);
    const nota = campos?.find((c) => c.clave === "nota");
    expect(nota?.tipo === "texto" && nota.largo).toBe(true);
  });

  it("números y una sola opción", () => {
    const campos = camposDeSchema(aSchema(z.object({ dias: z.number().int().min(1).max(30).default(7), modo: z.enum(["a", "b"]).default("a") }).strict()));
    expect(campos?.map((c) => c.tipo)).toEqual(["numero", "elegir"]);
  });

  it("algo que no sabe dibujar devuelve null (cae a JSON) en vez de callar una opción", () => {
    expect(camposDeSchema(aSchema(z.object({ x: z.object({ y: z.string() }) }).strict()))).toBeNull();
    expect(camposDeSchema(null)).toBeNull();
    expect(camposDeSchema({ type: "string" })).toBeNull();
  });
});

describe("opcionesDeValores", () => {
  const campos = camposDeSchema(aSchema(opcionesCierreParaContador)) ?? [];

  it("un texto vacío se omite: manda el default de la pieza", () => {
    const o = opcionesDeValores(campos, { contador: "   ", incluirGastos: false, columnasVentas: ["fecha", "total"] });
    expect(o).toEqual({ incluirGastos: false, columnasVentas: ["fecha", "total"] });
  });

  it("recorta el texto", () => {
    expect(opcionesDeValores(campos, { contador: "  Ana Ríos " }).contador).toBe("Ana Ríos");
  });

  it("lo que arma el formulario pasa el Zod .strict() de la pieza", () => {
    const o = opcionesDeValores(campos, { contador: "Ana", columnasVentas: ["fecha", "total"], incluirGastos: true, columnasGastos: ["fecha", "monto"] });
    expect(opcionesCierreParaContador.safeParse(o).success).toBe(true);
  });
});

describe("rotuloDeClave", () => {
  it("separa camelCase", () => {
    expect(rotuloDeClave("columnasGastos")).toBe("Columnas gastos");
    expect(rotuloDeClave("nota")).toBe("Nota");
  });
});
