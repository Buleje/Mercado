/**
 * loth-import-lineas — vista previa del importador. Puro, sin DB.
 *
 * Lo que se protege: que NADA se descarte en silencio. Cada fila sale con su
 * veredicto y su motivo; el que decide es el usuario mirando la previa.
 */
import { describe, it, expect } from "vitest";
import { aFecha, aNumero, detectarSeparador, parseImportLineas } from "@/lib/forestal/loth-import-lineas";

describe("lectura de celdas", () => {
  it("acepta coma o punto decimal (un Excel peruano usa coma)", () => {
    expect(aNumero("1,25")).toBe(1.25);
    expect(aNumero("1.25")).toBe(1.25);
    expect(aNumero("1.234,56")).toBe(1234.56); // miles con punto
    expect(aNumero("")).toBeNull();
    expect(aNumero("abc")).toBeNull();
  });

  it("acepta DD/MM/AAAA y AAAA-MM-DD, y rechaza el resto", () => {
    expect(aFecha("21/07/2026")).toBe("2026-07-21");
    expect(aFecha("2026-07-21")).toBe("2026-07-21");
    expect(aFecha("7/21/2026")).toBe("2026-21-07"); // mes>12: queda como está y la fila lo dirá
    expect(aFecha("julio")).toBeNull();
  });

  it("detecta el separador del archivo", () => {
    expect(detectarSeparador("a;b;c\n1;2;3")).toBe(";");
    expect(detectarSeparador("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(detectarSeparador("a,b,c\n1,2,3")).toBe(",");
  });
});

describe("parseImportLineas · trozado", () => {
  const csv = [
    "Cód. árbol,Cód. troza,Especie,Ø mayor,Ø menor,Longitud,Observaciones",
    "001-TOR,001-TOR-A,Tornillo,0.65,0.60,12,primera troza",
    "001-TOR,001-TOR-B,Tornillo,0.60,0.55,10,",
  ].join("\n");

  it("mapea los encabezados con tildes y símbolos, y calcula el volumen por Smalian", () => {
    const r = parseImportLineas(csv, "trozado");
    expect(r.filas).toHaveLength(2);
    expect(r.listas).toBe(2);
    expect(r.filas[0].trozaCode).toBe("001-TOR-A");
    expect(r.filas[0].volumenCalculado).toBe(true);
    // 0.7854 × ((0.65+0.60)/2)² × 12 = 3.6816
    expect(r.filas[0].volumeM3).toBeCloseTo(3.6816, 3);
  });

  it("marca la fila incompleta en vez de tirarla", () => {
    const r = parseImportLineas("Cód. árbol,Cód. troza,Especie\n001-TOR,,Tornillo", "trozado");
    expect(r.conError).toBe(1);
    expect(r.filas[0].estado).toBe("error");
    expect(r.filas[0].motivos.join(" ")).toMatch(/Falta código de troza/);
    expect(r.filas[0].motivos.join(" ")).toMatch(/Sin volumen/);
  });

  it("avisa del código repetido dentro del archivo sin descartarlo solo", () => {
    const r = parseImportLineas(
      ["Cód. árbol,Cód. troza,Especie,Volumen", "1-T,1-T-A,Tornillo,2", "1-T,1-T-A,Tornillo,3"].join("\n"),
      "trozado",
    );
    expect(r.filas[1].motivos.join(" ")).toMatch(/se repite en el archivo/);
    expect(r.filas[1].estado).toBe("ok"); // lo decide el usuario, no el parser
  });

  it("avisa cuando la especie no está en el plan, sin bloquear el asiento", () => {
    const r = parseImportLineas("Cód. árbol,Cód. troza,Especie,Volumen\n1-C,1-C-A,Cumala,2", "trozado", {
      especiesAutorizadas: new Set(["Tornillo"]),
    });
    expect(r.filas[0].estado).toBe("ok");
    expect(r.filas[0].motivos.join(" ")).toMatch(/no figura en el plan/);
  });

  it("lista las columnas que no supo mapear en vez de ignorarlas calladas", () => {
    const r = parseImportLineas("Cód. troza,Especie,Volumen,Color del papel\n1-A,Tornillo,2,azul", "consumo_troza");
    expect(r.ignoradas).toEqual(["Color del papel"]);
  });
});

describe("parseImportLineas · otras secciones", () => {
  it("despacho de trozas exige la guía", () => {
    const r = parseImportLineas("Cód. troza,N° GTF\n1-A,\n2-A,001-0000125", "despacho_troza");
    expect(r.filas[0].estado).toBe("error");
    expect(r.filas[1].estado).toBe("ok");
    expect(r.filas[1].gtfNumber).toBe("001-0000125");
  });

  it("producto terminado exige tipo y cantidad", () => {
    const r = parseImportLineas("Producto,Cantidad,Unidad\nMadera aserrada,12.5,m3", "producto_terminado");
    expect(r.listas).toBe(1);
    expect(r.filas[0].quantity).toBe(12.5);
    expect(r.filas[0].unit).toBe("m3");
  });

  it("un archivo sin filas de datos no rompe", () => {
    expect(parseImportLineas("Cód. árbol,Especie", "tala").filas).toHaveLength(0);
    expect(parseImportLineas("", "tala").filas).toHaveLength(0);
  });
});
