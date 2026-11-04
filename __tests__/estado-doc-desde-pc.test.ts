import { describe, expect, it } from "vitest";
import { estadoDeRutaDePc, META_ESTADO } from "@/lib/documents/estados-doc";

// El estado que un papel trae desde la carpeta de Windows (programa `persona`, 04-11).
describe("estadoDeRutaDePc", () => {
  it("lo que está dentro de Archivado es una versión vieja", () => {
    expect(estadoDeRutaDePc("Clientes/Rivers/Archivado/Madera/Cubicación (reemplazado 04-11-2026).pdf")).toBe("archived");
    expect(estadoDeRutaDePc("Clientes\\Rivers\\Archivado\\Pagos\\Estado de cuenta.pdf")).toBe("archived");
    expect(estadoDeRutaDePc("CCNN/San Luis/Versiones anteriores/Acta.pdf")).toBe("archived");
  });

  it("el nombre con [EN REVISIÓN] es uno que todavía se corrige", () => {
    expect(estadoDeRutaDePc("Clientes/Rivers/Madera/[EN REVISIÓN] Cubicación corta.pdf")).toBe("review");
    expect(estadoDeRutaDePc("Clientes/Rivers/Madera/[en revision] Cubicación corta.pdf")).toBe("review");
    // NFD (como a veces llega de Windows) cuenta igual
    expect(estadoDeRutaDePc("Clientes/Rivers/[EN REVISIÓN] Cubicación.pdf".normalize("NFD"))).toBe("review");
  });

  it("un nombre limpio no dice nada: no toca el estado", () => {
    expect(estadoDeRutaDePc("Clientes/Rivers/Madera/Cubicación corta.pdf")).toBeNull();
    // «Archivado» en el NOMBRE del archivo no es la carpeta
    expect(estadoDeRutaDePc("Clientes/Rivers/Archivado de guías.pdf")).toBeNull();
    // la marca en una carpeta no cuenta: es del archivo
    expect(estadoDeRutaDePc("Clientes/[EN REVISIÓN] Rivers/Cubicación.pdf")).toBeNull();
  });

  it("en el panel se llama igual que en la PC", () => {
    expect(META_ESTADO.approved.label).toBe("Oficial");
    expect(META_ESTADO.review.label).toBe("En revisión");
    expect(META_ESTADO.archived.label).toBe("Archivado");
  });
});
