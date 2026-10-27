import { describe, expect, it } from "vitest";
import { despachosConAnexo } from "@/lib/forestal/anexo04-registro";

describe("despachosConAnexo", () => {
  it("cuenta el despacho de origen y los que el anexo pasado al libro ya cubre", () => {
    const ids = despachosConAnexo([
      { ctpEntryId: "d1" },
      { despachoIds: ["d2", "d3"] },
      { ctpEntryId: "d4", despachoIds: ["d4"] },
    ]);
    expect([...ids].sort()).toEqual(["d1", "d2", "d3", "d4"]);
  });

  it("ignora vacíos y no inventa nada sin anexos", () => {
    expect(despachosConAnexo([]).size).toBe(0);
    expect(despachosConAnexo([{ ctpEntryId: "", despachoIds: [""] }]).size).toBe(0);
  });
});
