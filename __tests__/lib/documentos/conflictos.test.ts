import { describe, it, expect } from "vitest";
import { clasificarConflictos, nombreLibre, contar } from "@/lib/documentos/conflictos";

const archivo = (nombre: string, size: number, carpeta = "Contratos") =>
  ({ item: nombre, carpeta, nombre, size });

describe("clasificarConflictos", () => {
  it("lo que no está en la carpeta es nuevo", () => {
    const r = clasificarConflictos([archivo("nuevo.pdf", 100)], { Contratos: [] });
    expect(r[0].estado).toBe("nuevo");
  });

  it("mismo nombre y mismo peso = el mismo archivo (no se pregunta)", () => {
    const r = clasificarConflictos([archivo("a.pdf", 100)], { Contratos: [{ name: "a.pdf", size: 100 }] });
    expect(r[0].estado).toBe("identico");
  });

  it("mismo nombre y OTRO peso = conflicto (acá se pregunta)", () => {
    const r = clasificarConflictos([archivo("a.pdf", 999)], { Contratos: [{ name: "a.pdf", size: 100, id: "d1" }] });
    expect(r[0].estado).toBe("conflicto");
    expect(r[0].existente?.id).toBe("d1");
  });

  it("compara sin distinguir mayúsculas, como el explorador", () => {
    const r = clasificarConflictos([archivo("Contrato.PDF", 100)], { Contratos: [{ name: "contrato.pdf", size: 100 }] });
    expect(r[0].estado).toBe("identico");
  });

  it("el mismo nombre en OTRA carpeta no choca", () => {
    const r = clasificarConflictos(
      [archivo("a.pdf", 100, "Boletas")],
      { Contratos: [{ name: "a.pdf", size: 100 }], Boletas: [] },
    );
    expect(r[0].estado).toBe("nuevo");
  });

  it("con dos homónimos de distinto peso, uno igual gana sobre el conflicto", () => {
    // El drive permite duplicados viejos: si ALGUNO coincide, no hay nada que subir.
    const r = clasificarConflictos([archivo("a.pdf", 100)], {
      Contratos: [{ name: "a.pdf", size: 55 }, { name: "a.pdf", size: 100 }],
    });
    expect(r[0].estado).toBe("identico");
  });

  it("cuenta los tres estados para el encabezado", () => {
    const r = clasificarConflictos(
      [archivo("a.pdf", 1), archivo("b.pdf", 2), archivo("c.pdf", 3)],
      { Contratos: [{ name: "a.pdf", size: 1 }, { name: "b.pdf", size: 99 }] },
    );
    expect(contar(r)).toEqual({ identico: 1, conflicto: 1, nuevo: 1 });
  });
});

describe("nombreLibre", () => {
  it("si no choca, devuelve el mismo nombre", () => {
    expect(nombreLibre("a.pdf", new Set())).toBe("a.pdf");
  });

  it("agrega (2) como el explorador", () => {
    expect(nombreLibre("contrato.pdf", new Set(["contrato.pdf"]))).toBe("contrato (2).pdf");
  });

  it("sigue subiendo hasta encontrar libre", () => {
    const usados = new Set(["a.pdf", "a (2).pdf", "a (3).pdf"]);
    expect(nombreLibre("a.pdf", usados)).toBe("a (4).pdf");
  });

  it("no anida: 'a (2).pdf' pasa a 'a (3).pdf', no a 'a (2) (2).pdf'", () => {
    expect(nombreLibre("a (2).pdf", new Set(["a (2).pdf"]))).toBe("a (3).pdf");
  });

  it("respeta los nombres sin extensión", () => {
    expect(nombreLibre("BLAS doc", new Set(["blas doc"]))).toBe("BLAS doc (2)");
  });

  it("reserva lo que entrega: dos homónimos nuevos no eligen el mismo", () => {
    const usados = new Set<string>();
    expect(nombreLibre("a.pdf", usados)).toBe("a.pdf");
    expect(nombreLibre("a.pdf", usados)).toBe("a (2).pdf");
    expect(nombreLibre("a.pdf", usados)).toBe("a (3).pdf");
  });

  it("⚠️ si el set arranca vacío NO renombra — hay que sembrarlo con lo que ya está", () => {
    // Este fue el bug: "conservar los dos" subía un segundo "boleta.pdf" con el
    // mismo nombre porque nadie le había dicho que ese nombre estaba ocupado.
    expect(nombreLibre("boleta.pdf", new Set())).toBe("boleta.pdf");
    expect(nombreLibre("boleta.pdf", new Set(["boleta.pdf"]))).toBe("boleta (2).pdf");
  });

  it("no distingue mayúsculas al chocar", () => {
    expect(nombreLibre("Contrato.pdf", new Set(["contrato.pdf"]))).toBe("Contrato (2).pdf");
  });
});
