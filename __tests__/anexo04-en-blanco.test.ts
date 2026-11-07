import { describe, expect, it } from "vitest";
import { construirDocDeVarios } from "@/lib/forestal/anexo04-pdf";
import { DATOS_ANEXO04_DEFAULT } from "@/lib/forestal/anexo04-serfor";

describe("Anexo 04 en blanco", () => {
  it("N anexos sin piezas arman N hojas del formato", async () => {
    const items = Array.from({ length: 3 }, () => ({ piezas: [], datos: { ...DATOS_ANEXO04_DEFAULT } }));
    const doc = await construirDocDeVarios(items);
    expect(doc?.getNumberOfPages()).toBe(3);
  });
});
