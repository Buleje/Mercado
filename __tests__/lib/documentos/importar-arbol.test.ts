import { describe, it, expect } from "vitest";
import {
  planificarImport, planReuso, limpiarNombre, bytesLegibles, PROFUNDIDAD_MAX,
} from "@/lib/documentos/importar-arbol";

/** File de mentira con la ruta que da el navegador al elegir una carpeta. */
function archivo(ruta: string, size = 100): File {
  const f = new File([new Uint8Array(size)], ruta.split("/").pop() ?? ruta, { type: "application/pdf" });
  Object.defineProperty(f, "webkitRelativePath", { value: ruta });
  return f;
}

describe("planificarImport", () => {
  it("crea una carpeta por nivel, en orden padre→hijo", () => {
    const plan = planificarImport([
      archivo("Contratos/2026/alquiler.pdf"),
      archivo("Contratos/2026/servicios.pdf"),
      archivo("Contratos/2025/viejo.pdf"),
    ]);

    expect(plan.carpetas.map((c) => c.ruta)).toEqual([
      "Contratos",
      "Contratos/2025",
      "Contratos/2026",
    ]);
    // El padre siempre aparece antes que el hijo: crearlas en orden es seguro.
    plan.carpetas.forEach((c, i) => {
      if (!c.padre) return;
      const iPadre = plan.carpetas.findIndex((p) => p.ruta === c.padre);
      expect(iPadre).toBeLessThan(i);
    });
    expect(plan.archivos).toHaveLength(3);
  });

  it("manda cada archivo a SU carpeta", () => {
    const plan = planificarImport([
      archivo("Facturas/enero/f1.pdf"),
      archivo("Facturas/febrero/f2.pdf"),
      archivo("suelto.pdf"),
    ]);
    const porNombre = Object.fromEntries(plan.archivos.map((a) => [a.file.name, a.carpeta]));
    expect(porNombre["f1.pdf"]).toBe("Facturas/enero");
    expect(porNombre["f2.pdf"]).toBe("Facturas/febrero");
    // Un archivo suelto va a la raíz donde se importa, no inventa carpeta.
    expect(porNombre["suelto.pdf"]).toBe("");
  });

  it("deja afuera la basura del sistema, los ocultos y los vacíos — y lo dice", () => {
    const plan = planificarImport([
      archivo("Docs/.DS_Store"),
      archivo("Docs/Thumbs.db"),
      archivo("Docs/.oculto.pdf"),
      archivo("Docs/vacio.pdf", 0),
      archivo("Docs/bueno.pdf"),
    ]);
    expect(plan.archivos).toHaveLength(1);
    expect(plan.archivos[0].file.name).toBe("bueno.pdf");
    expect(plan.ignorados.map((i) => i.motivo)).toEqual([
      "archivo del sistema",
      "archivo del sistema",
      "archivo oculto",
      "archivo vacío",
    ]);
  });

  it("corta los árboles demasiado profundos en vez de crear 20 carpetas", () => {
    const profundo = Array.from({ length: PROFUNDIDAD_MAX + 2 }, (_, i) => `n${i}`).join("/");
    const plan = planificarImport([archivo(`${profundo}/x.pdf`), archivo("ok/y.pdf")]);
    expect(plan.archivos.map((a) => a.file.name)).toEqual(["y.pdf"]);
    expect(plan.ignorados[0].motivo).toContain("niveles");
  });

  it("no repite una carpeta compartida por muchos archivos", () => {
    const plan = planificarImport(
      Array.from({ length: 50 }, (_, i) => archivo(`Lote/f${i}.pdf`)),
    );
    expect(plan.carpetas).toHaveLength(1);
    expect(plan.archivos).toHaveLength(50);
    expect(plan.totalBytes).toBe(50 * 100);
  });

  it("ordena en profundidad: el hijo va pegado a su padre, no al final de su nivel", () => {
    const plan = planificarImport([
      archivo("Boletas/enero/b1.pdf"),
      archivo("Contratos/2026/c1.pdf"),
      archivo("Contratos/2025/c2.pdf"),
    ]);
    // Nivel-primero dibujaba "Boletas, Contratos, enero, 2025, 2026" y "enero"
    // aparecía colgando de Contratos.
    expect(plan.carpetas.map((c) => c.ruta)).toEqual([
      "Boletas",
      "Boletas/enero",
      "Contratos",
      "Contratos/2025",
      "Contratos/2026",
    ]);
  });

  it("no deja que un hermano parecido se cuele entre el padre y sus hijos", () => {
    const plan = planificarImport([
      archivo("Contratos/2026/a.pdf"),
      archivo("Contratos 2026/b.pdf"), // el espacio ordena antes que la barra
    ]);
    expect(plan.carpetas.map((c) => c.ruta)).toEqual([
      "Contratos",
      "Contratos/2026",
      "Contratos 2026",
    ]);
  });

  it("acepta rutas con backslash (Windows)", () => {
    const f = new File([new Uint8Array(10)], "a.pdf");
    Object.defineProperty(f, "webkitRelativePath", { value: "Carpeta\\Sub\\a.pdf" });
    const plan = planificarImport([f]);
    expect(plan.carpetas.map((c) => c.ruta)).toEqual(["Carpeta", "Carpeta/Sub"]);
    expect(plan.archivos[0].carpeta).toBe("Carpeta/Sub");
  });
});

describe("planReuso", () => {
  const plan = planificarImport([
    archivo("Contratos/2026/a.pdf"),
    archivo("Contratos/2025/b.pdf"),
    archivo("Boletas/c.pdf"),
  ]);

  it("reusa la carpeta que ya está en el drive en vez de duplicarla", () => {
    const reuso = planReuso(plan.carpetas, [
      { id: "f1", name: "Contratos", parentId: null },
      { id: "f2", name: "2026", parentId: "f1" },
    ], null);
    expect(reuso.get("Contratos")).toBe("f1");
    expect(reuso.get("Contratos/2026")).toBe("f2");
    // Estas no existen: se van a crear.
    expect(reuso.has("Contratos/2025")).toBe(false);
    expect(reuso.has("Boletas")).toBe(false);
  });

  it("compara sin importar mayúsculas ni espacios de sobra", () => {
    const reuso = planReuso(plan.carpetas, [{ id: "f1", name: "  CONTRATOS ", parentId: null }], null);
    expect(reuso.get("Contratos")).toBe("f1");
  });

  it("una carpeta con el mismo nombre pero OTRO padre no cuenta", () => {
    // "2026" existe, pero colgando de Boletas: la de Contratos hay que crearla.
    const reuso = planReuso(plan.carpetas, [
      { id: "f1", name: "Contratos", parentId: null },
      { id: "f9", name: "2026", parentId: "otra-carpeta" },
    ], null);
    expect(reuso.has("Contratos/2026")).toBe(false);
  });

  it("si el padre es nuevo, la hija no puede existir todavía", () => {
    // "2026" cuelga de la raíz del drive, pero el plan la mete bajo Contratos,
    // que todavía no existe: no se puede reusar.
    const reuso = planReuso(plan.carpetas, [{ id: "f2", name: "2026", parentId: null }], null);
    expect(reuso.size).toBe(0);
  });

  it("respeta la carpeta destino: lo existente se busca DENTRO de ella", () => {
    const reuso = planReuso(plan.carpetas, [
      { id: "f1", name: "Contratos", parentId: null },        // en la raíz — no aplica
      { id: "f7", name: "Contratos", parentId: "destino-x" }, // dentro del destino — sí
    ], "destino-x");
    expect(reuso.get("Contratos")).toBe("f7");
  });
});

describe("limpiarNombre", () => {
  it("saca barras y espacios de más", () => {
    expect(limpiarNombre("  Contratos / 2026  ")).toBe("Contratos 2026");
  });
  it("corta los nombres kilométricos", () => {
    expect(limpiarNombre("x".repeat(200))).toHaveLength(120);
  });
});

describe("bytesLegibles", () => {
  it("usa la unidad que se lee de un vistazo", () => {
    expect(bytesLegibles(512)).toBe("512 B");
    expect(bytesLegibles(2048)).toBe("2.0 KB");
    expect(bytesLegibles(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(bytesLegibles(3 * 1024 * 1024 * 1024)).toBe("3.00 GB");
  });
});
