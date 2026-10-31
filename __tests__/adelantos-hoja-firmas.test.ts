import { describe, expect, it } from "vitest";
import { codigoDeHoja, conceptoParaHoja, hojasDeDocumento, REGEX_CODIGO_HOJA, tagDeHojaAdelanto, tagDeHojaCodigo } from "@/lib/adelantos/hoja-firmas";

describe("hoja de firmas", () => {
  it("el código usa el día de Lima y cumple su formato", () => {
    const c = codigoDeHoja(new Date("2026-10-26T03:00:00Z"), () => 0); // 25-10 22:00 en Lima
    expect(c).toBe("HF-261025-AAAA");
    expect(REGEX_CODIGO_HOJA.test(codigoDeHoja(new Date()))).toBe(true);
  });
  it("lee la hoja de cada adelanto desde las etiquetas del documento", () => {
    const r = hojasDeDocumento({
      id: "d1",
      tags: ["hoja-firmas", tagDeHojaCodigo("HF-261025-AAAA"), tagDeHojaAdelanto("a1"), tagDeHojaAdelanto("a2"), "adelanto:zz"],
      uploadedAt: new Date("2026-10-25T10:00:00Z"),
    });
    expect(r.map((x) => x.adelantoId)).toEqual(["a1", "a2"]);
    expect(r[0]).toMatchObject({ codigo: "HF-261025-AAAA", documentoId: "d1" });
  });
  it("concepto corto", () => {
    expect(conceptoParaHoja("  PRIMERA   CARGA ", null)).toBe("PRIMERA CARGA");
    expect(conceptoParaHoja(null, "SERVICIO")).toBe("Servicio");
    expect(conceptoParaHoja("x".repeat(200), null).length).toBe(88);
  });
});
