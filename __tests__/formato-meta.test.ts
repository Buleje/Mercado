/**
 * La unidad libre de una meta a mano en singular cuando el valor es ±1
 * («1 viaje», no «1 viajes» ni «1 viaj»). Las del catálogo pasan por el mapa.
 */
import { describe, expect, it } from "vitest";
import { cifraDeMeta } from "@/components/admin/metas/formato-meta";

describe("cifraDeMeta: singular de la unidad", () => {
  it.each([
    ["viajes", "1 viaje"],
    ["mes", "1 mes"],
    ["meses", "1 mes"],
    ["veces", "1 vez"],
    ["gas", "1 gas"],
    ["visitas", "1 visita"],
    ["flores", "1 flor"],
    ["árboles", "1 árbol"],
    ["luces", "1 luz"],
    ["clientes", "1 cliente"],
    ["kg", "1 kg"],
  ])("1 %s → %s", (unidad, esperado) => {
    expect(cifraDeMeta(1, unidad)).toBe(esperado);
  });

  it("con otro valor la unidad no cambia", () => {
    expect(cifraDeMeta(3, "viajes")).toBe("3 viajes");
    expect(cifraDeMeta(-1, "meses")).toBe("-1 mes");
  });

  it("las unidades con símbolo no llevan palabra", () => {
    expect(cifraDeMeta(1, "m³")).toBe("1 m³");
  });
});
