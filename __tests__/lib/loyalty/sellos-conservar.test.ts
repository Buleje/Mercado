import { describe, it, expect } from "vitest";
import { conservarSellos } from "@/lib/loyalty/sellos";

const sellos = { activo: true, compras: 10, premio: "Un café", desde: "2026-10-01", minimo: null };
const canjes = { "987654321": [{ sellos: 10, at: "2026-10-05T15:00:00.000Z", por: "qaadmin", premio: "Un café" }] };

describe("conservarSellos — el PUT de reglas no borra la tarjeta de sellos", () => {
  it("rules sin `sellos` hereda la config guardada", () => {
    const r = conservarSellos({ rules: { puntosPorSol: 1 } }, { rules: { sellos }, rewards: null });
    expect(r).toEqual({ rules: { puntosPorSol: 1, sellos } });
  });

  it("rewards sin canjes hereda sellosCanjes y sellosArchivo", () => {
    const archivo = { "987654321": { canjes: 3, sellos: 30, hasta: "2026-10-04T00:00:00.000Z" } };
    const r = conservarSellos({ rewards: { catalogo: [] } }, { rules: null, rewards: { sellosCanjes: canjes, sellosArchivo: archivo } });
    expect(r).toEqual({ rewards: { catalogo: [], sellosCanjes: canjes, sellosArchivo: archivo } });
  });

  it("si manda sus propias claves de sellos, ganan las suyas", () => {
    const otra = { ...sellos, compras: 8 };
    expect(conservarSellos({ rules: { sellos: otra } }, { rules: { sellos }, rewards: null })).toEqual({ rules: { sellos: otra } });
  });

  it("una lista donde hay sellos guardados → null (no se puede sin perderlos)", () => {
    expect(conservarSellos({ rewards: [{ id: 1 }] }, { rules: null, rewards: { sellosCanjes: canjes } })).toBeNull();
    expect(conservarSellos({ rules: null }, { rules: { sellos }, rewards: null })).toBeNull();
  });

  it("sin sellos guardados pasa tal cual (también listas) y no toca el campo que no vino", () => {
    expect(conservarSellos({ rewards: [{ id: 1 }] }, { rules: null, rewards: null })).toEqual({ rewards: [{ id: 1 }] });
    expect(conservarSellos({ rules: { a: 1 } }, { rules: null, rewards: { sellosCanjes: canjes } })).toEqual({ rules: { a: 1 } });
  });
});
