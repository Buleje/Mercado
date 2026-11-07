import { describe, it, expect } from "vitest";
import {
  aNumero,
  compararConDeclarado,
  esFilaDeEncabezados,
  filasDesdeTexto,
  interpretarTrozas,
} from "@/lib/forestal/trozas-import";

/**
 * Importar la lista de trozas (ADR-320).
 *
 * Las dos reglas que no se negocian: una troza sin volumen NO entra (sumaría
 * cero al libro y desaparecería sin aviso) y el volumen DECLARADO gana sobre el
 * calculado (el libro tiene que cuadrar con el papel que trae el fiscalizador).
 */

describe("partir el texto pegado", () => {
  it("lee lo que sale de Excel (tabuladores)", () => {
    const filas = filasDesdeTexto("T-01\tTornillo\t45\t40\t3.5\nT-02\tTornillo\t50\t48\t4");
    expect(filas).toHaveLength(2);
    expect(filas[0]).toEqual(["T-01", "Tornillo", "45", "40", "3.5"]);
  });

  it("acepta CSV con coma o con punto y coma", () => {
    expect(filasDesdeTexto("T-01,Tornillo,45,40,3.5")[0]).toHaveLength(5);
    expect(filasDesdeTexto("T-01;Tornillo;45;40;3.5")[0]).toHaveLength(5);
  });

  it("acepta una tabla copiada de un PDF (espacios múltiples)", () => {
    expect(filasDesdeTexto("T-01   Tornillo   45   40   3.5")[0]).toEqual(["T-01", "Tornillo", "45", "40", "3.5"]);
  });

  it("descarta líneas vacías", () => {
    expect(filasDesdeTexto("\n\nT-01\tTornillo\n\n")).toHaveLength(1);
  });
});

describe("números como los escribe la gente", () => {
  it("entiende la coma decimal", () => {
    expect(aNumero("1,25")).toBe(1.25);
    expect(aNumero("1.25")).toBe(1.25);
  });

  it("entiende el separador de miles con decimal, en los dos órdenes", () => {
    // El último separador es el decimal: da igual si la lista vino de un Excel
    // en español o en inglés.
    expect(aNumero("1.234,50")).toBe(1234.5);
    expect(aNumero("1,234.50")).toBe(1234.5);
  });

  it("ignora la unidad pegada", () => {
    expect(aNumero("45cm")).toBe(45);
    expect(aNumero("3.5 m")).toBe(3.5);
  });

  it("vacío o basura es null, no 0", () => {
    expect(aNumero("")).toBeNull();
    expect(aNumero("s/d")).toBeNull();
    expect(aNumero(null)).toBeNull();
  });
});

describe("encabezados", () => {
  it("los reconoce aunque vengan con tildes y símbolos", () => {
    expect(esFilaDeEncabezados(["Código", "Especie", "D1 (cm)", "D2 (cm)", "Largo (m)"])).toBe(true);
  });

  it("no confunde una fila de datos con encabezados", () => {
    expect(esFilaDeEncabezados(["T-01", "Tornillo", "45", "40", "3.5"])).toBe(false);
  });
});

describe("interpretar las trozas", () => {
  it("calcula el volumen por Huber cuando no viene declarado", () => {
    const r = interpretarTrozas(filasDesdeTexto("Codigo\tEspecie\tD1\tD2\tLargo\nT-01\tTornillo\t45\t40\t3.5"));
    expect(r.errores).toEqual([]);
    // π · ((45+40)/2/200)² · 3.5 = 0.4964
    expect(r.trozas[0]!.volumenM3).toBeCloseTo(0.4964, 3);
    expect(r.trozas[0]!.diametroCm).toBe(42.5);
  });

  it("el volumen DECLARADO gana sobre el calculado", () => {
    const r = interpretarTrozas(
      filasDesdeTexto("Codigo\tD1\tD2\tLargo\tVolumen\nT-01\t45\t40\t3.5\t0.5200"),
    );
    expect(r.trozas[0]!.volumenM3).toBe(0.52);
  });

  it("avisa cuando el declarado difiere más de 5 % del calculado, sin rechazarlo", () => {
    const r = interpretarTrozas(
      filasDesdeTexto("Codigo\tD1\tD2\tLargo\tVolumen\nT-01\t45\t40\t3.5\t0.9000"),
    );
    expect(r.trozas).toHaveLength(1);
    expect(r.trozas[0]!.volumenM3).toBe(0.9);
    expect(r.avisos.some((a) => a.includes("difiere"))).toBe(true);
  });

  it("RECHAZA la fila sin volumen ni forma de calcularlo", () => {
    const r = interpretarTrozas(filasDesdeTexto("Codigo\tEspecie\tD1\tD2\tLargo\nT-01\tTornillo\t\t\t"));
    expect(r.trozas).toHaveLength(0);
    expect(r.errores[0]!.motivo).toMatch(/Sin volumen/);
    // Fila 2 porque la 1 era el encabezado: el operador tiene que poder ir a ella.
    expect(r.errores[0]!.fila).toBe(2);
  });

  it("con un solo diámetro trata la troza como cilindro", () => {
    const r = interpretarTrozas(filasDesdeTexto("Codigo\tDiametro\tLargo\nT-01\t40\t3"));
    // π · (40/200)² · 3 = 0.3770
    expect(r.trozas[0]!.volumenM3).toBeCloseTo(0.377, 3);
    expect(r.trozas[0]!.d1Cm).toBe(40);
    expect(r.trozas[0]!.d2Cm).toBe(40);
  });

  it("lee por posición cuando no hay encabezados y lo avisa", () => {
    const r = interpretarTrozas(filasDesdeTexto("T-01\tTornillo\t45\t40\t3.5"));
    expect(r.trozas).toHaveLength(1);
    expect(r.trozas[0]!.codificacion).toBe("T-01");
    expect(r.trozas[0]!.especieComun).toBe("Tornillo");
    expect(r.avisos.some((a) => a.includes("por posición"))).toBe(true);
  });

  it("completa la especie de la guía cuando la lista no la trae", () => {
    const r = interpretarTrozas(filasDesdeTexto("Codigo\tD1\tD2\tLargo\nT-01\t45\t40\t3.5"), {
      especiePorDefecto: "Shihuahuaco",
      especieCientificaPorDefecto: "Dipteryx micrantha",
    });
    expect(r.trozas[0]!.especieComun).toBe("Shihuahuaco");
    expect(r.trozas[0]!.especieCientifica).toBe("Dipteryx micrantha");
  });

  it("saltea el total al pie sin romper la numeración", () => {
    const r = interpretarTrozas(
      filasDesdeTexto("Codigo\tD1\tD2\tLargo\nT-01\t45\t40\t3.5\nT-02\t50\t48\t4\nTOTAL"),
    );
    expect(r.trozas).toHaveLength(2);
    expect(r.errores).toHaveLength(1);
    expect(r.trozas.map((t) => t.orden)).toEqual([1, 2]);
  });

  it("suma el total importado", () => {
    const r = interpretarTrozas(
      filasDesdeTexto("Codigo\tVolumen\nT-01\t1.2500\nT-02\t2.7500"),
    );
    expect(r.volumenTotal).toBe(4);
  });

  it("una lista vacía no inventa trozas", () => {
    const r = interpretarTrozas([]);
    expect(r.trozas).toEqual([]);
    expect(r.volumenTotal).toBe(0);
  });
});

describe("comparación contra lo declarado en el ingreso", () => {
  it("calla cuando la diferencia es menor al 2 %", () => {
    expect(compararConDeclarado(10.05, 10)).toBeNull();
  });

  it("avisa cuando las trozas suman de más o de menos", () => {
    expect(compararConDeclarado(12, 10)).toMatch(/más/);
    expect(compararConDeclarado(8, 10)).toMatch(/menos/);
  });

  it("no compara contra cero", () => {
    expect(compararConDeclarado(10, 0)).toBeNull();
    expect(compararConDeclarado(0, 10)).toBeNull();
  });
});
