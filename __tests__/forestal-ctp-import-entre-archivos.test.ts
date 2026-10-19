import { describe, expect, it } from "vitest";
import { llevaPermiso, revisarEntreArchivos, type ArchivoARevisar } from "@/lib/forestal/ctp-import-entre-archivos";
import { aCuerpoDelLibro } from "@/lib/forestal/ctp-serfor-a-libro";
import type { FilaParseada, FormatoCtp } from "@/lib/forestal/ctp-formatos-serfor";

const fila = (n: number, datos: FilaParseada["datos"], problemas: string[] = []): FilaParseada => ({ fila: n, datos, problemas });

const archivo = (
  id: string,
  formato: FormatoCtp,
  parseadas: FilaParseada[],
  permiso: ArchivoARevisar["permiso"] = null,
): ArchivoARevisar => ({ id, nombre: `${id}.xlsx`, formato, parseadas, permiso });

const troza = (n: number, planta: string, gtf: string, extra: FilaParseada["datos"] = {}) =>
  fila(n, { codigoPlanta: planta, numeroDocumento: gtf, especie: "Tornillo", volumenM3: 1.2, ...extra });

describe("llevaPermiso", () => {
  it("sólo las secciones que originan madera", () => {
    expect(llevaPermiso("ingresos")).toBe(true);
    expect(llevaPermiso("inventarioTrozas")).toBe(true);
    expect(llevaPermiso("inventarioAserrada")).toBe(true);
    expect(llevaPermiso("produccion")).toBe(true);
    expect(llevaPermiso("consumos")).toBe(false);
    expect(llevaPermiso("retrozado")).toBe(false);
    expect(llevaPermiso("salidas")).toBe(false);
  });
});

describe("revisarEntreArchivos", () => {
  it("código de planta repetido entre dos archivos = error, agrupado por par", () => {
    const avisos = revisarEntreArchivos([
      archivo("a", "inventarioTrozas", [troza(5, "3037752", "G-1"), troza(6, "3037753", "G-1")]),
      archivo("b", "inventarioTrozas", [troza(9, "3037752", "G-2"), troza(10, " 3037753 ", "G-2")]),
    ]);
    const planta = avisos.filter((x) => x.tipo === "planta-repetida");
    expect(planta).toHaveLength(1);
    expect(planta[0].nivel).toBe("error");
    expect(planta[0].mensaje).toContain("2 códigos de planta");
    expect(planta[0].ids.sort()).toEqual(["a", "b"]);
  });

  it("repetido dentro del MISMO archivo no es entre archivos", () => {
    const avisos = revisarEntreArchivos([
      archivo("a", "inventarioTrozas", [troza(5, "1", "G-1"), troza(6, "1", "G-1")]),
    ]);
    expect(avisos.filter((x) => x.tipo === "planta-repetida")).toHaveLength(0);
  });

  it("ignora trozas que ya no están en stock, filas incompletas y el «-»", () => {
    const avisos = revisarEntreArchivos([
      archivo("a", "inventarioTrozas", [troza(5, "1", "G-1", { estado: "Consumido" }), troza(6, "-", "G-1")]),
      archivo("b", "inventarioTrozas", [troza(9, "1", "G-2"), troza(10, "-", "G-2"), troza(11, "1", "G-3", {})]),
      archivo("c", "inventarioTrozas", [fila(3, { codigoPlanta: "1", numeroDocumento: "G-9" }, ["Falta el volumen"])]),
    ]);
    expect(avisos.filter((x) => x.tipo === "planta-repetida")).toHaveLength(0);
  });

  it("la misma GTF con permisos distintos = error que nombra los dos permisos", () => {
    const avisos = revisarEntreArchivos([
      archivo("a", "ingresos", [fila(4, { numeroDocumento: "019-0000004" })], { id: "p1", codigo: "P-1" }),
      archivo("b", "inventarioTrozas", [troza(7, "88", "019-0000004")], { id: "p2", codigo: "P-2" }),
    ]);
    const gtf = avisos.find((x) => x.tipo === "gtf-dos-permisos");
    expect(gtf?.nivel).toBe("error");
    expect(gtf?.mensaje).toContain("P-1 y P-2");
  });

  it("la misma GTF con el mismo permiso = aviso, no error", () => {
    const avisos = revisarEntreArchivos([
      archivo("a", "ingresos", [fila(4, { numeroDocumento: "G-1" })], { id: "p1", codigo: "P-1" }),
      archivo("b", "ingresos", [fila(4, { numeroDocumento: "g-1" })], { id: "p1", codigo: "P-1" }),
    ]);
    expect(avisos.map((x) => [x.tipo, x.nivel])).toEqual([["gtf-repetida", "aviso"]]);
  });

  it("una GTF cuyas trozas traen dos contratos se avisa (antes se perdía el segundo)", () => {
    const avisos = revisarEntreArchivos([
      archivo("a", "inventarioTrozas", [
        troza(5, "1", "G-1", { contrato: "CT-A" }),
        troza(6, "2", "G-1", { contrato: "CT-B" }),
        troza(7, "3", "G-2", { contrato: "CT-A" }),
      ]),
    ]);
    const dos = avisos.filter((x) => x.tipo === "gtf-dos-contratos");
    expect(dos).toHaveLength(1);
    expect(dos[0].mensaje).toContain("G-1");
    expect(dos[0].mensaje).toContain("CT-A, CT-B");
  });

  it("el mismo paquete en dos archivos (produccionKey) = aviso", () => {
    const paquete = (n: number, codigo: string) =>
      fila(n, { fecha: "2026-10-01", paquete: codigo, lote: "L1", especie: "Tornillo", tipoProducto: "Tabla", volumenM3: 0.5 });
    const avisos = revisarEntreArchivos([
      archivo("a", "inventarioAserrada", [paquete(3, "PQ-1"), paquete(4, "PQ-2")]),
      archivo("b", "inventarioAserrada", [paquete(8, "PQ-1"), paquete(9, "PQ-3")]),
    ]);
    const rep = avisos.filter((x) => x.tipo === "paquete-repetido");
    expect(rep).toHaveLength(1);
    expect(rep[0].mensaje).toContain("PQ-1");
  });

  it("errores primero", () => {
    const avisos = revisarEntreArchivos([
      archivo("a", "inventarioTrozas", [troza(5, "1", "G-1", { contrato: "X" }), troza(6, "2", "G-1", { contrato: "Y" })]),
      archivo("b", "inventarioTrozas", [troza(5, "1", "G-9")]),
    ]);
    expect(avisos[0].nivel).toBe("error");
  });
});

describe("aCuerpoDelLibro · contrato distinto dentro de la guía", () => {
  it("no lo descarta en silencio: queda en las notas de la guía", () => {
    const [guia] = aCuerpoDelLibro("inventarioTrozas", [
      troza(5, "1", "G-1", { contrato: "CT-A" }),
      troza(6, "2", "G-1", { contrato: "CT-B" }),
    ]);
    expect(guia.originCode).toBe("CT-A");
    expect(String(guia.notes)).toContain("contrato CT-B");
  });
});
