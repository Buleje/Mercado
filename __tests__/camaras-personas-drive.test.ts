import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/documents.db", () => ({ DocumentsDB: {} }));
vi.mock("@/lib/documents/storage", () => ({ buildStoragePath: vi.fn(), uploadToStorage: vi.fn() }));

import {
  horaLimaParaArchivo,
  metaFotoPersonaSchema,
  nombreArchivoFotoPersona,
  nombreCarpetaCamara,
  subcarpetasFotoPersona,
} from "@/lib/camaras/personas-drive.server";

describe("fotos de personas → Drive", () => {
  // 2026-10-08 01:05:33 UTC = 2026-10-07 20:05:33 en Pucallpa (UTC-5)
  const noche = new Date("2026-10-08T01:05:33.000Z");

  it("hora y día salen en hora de Lima, no en UTC", () => {
    expect(horaLimaParaArchivo(noche)).toBe("20-05-33");
    expect(subcarpetasFotoPersona("Portón", noche)).toEqual(["Portón", "2026-10-07"]);
  });

  it("medianoche de Lima es 00, no 24", () => {
    expect(horaLimaParaArchivo(new Date("2026-10-07T05:00:00.000Z"))).toBe("00-00-00");
  });

  it("nombre de archivo con motivo y singular/plural", () => {
    expect(nombreArchivoFotoPersona(noche, { motivo: "aparecio", personas: 1 })).toBe("20-05-33 · Apareció alguien · 1 persona.webp");
    expect(nombreArchivoFotoPersona(noche, { motivo: "mas_gente", personas: 3 })).toBe("20-05-33 · Llegó otra persona · 3 personas.webp");
    expect(nombreArchivoFotoPersona(noche, { motivo: "sigue", personas: 2 })).toBe("20-05-33 · Sigue en cuadro · 2 personas.webp");
  });

  it("el nombre de la cámara no puede abrir otra carpeta ni romper Windows", () => {
    expect(nombreCarpetaCamara("Patio/../trozas: 1")).toBe("Patio-..-trozas- 1");
    expect(nombreCarpetaCamara("   ")).toBe("Cámara");
    expect(nombreCarpetaCamara("x".repeat(100))).toHaveLength(60);
  });

  it("schema: acepta lo del formulario (texto) y rechaza lo inválido", () => {
    expect(metaFotoPersonaSchema.safeParse({ motivo: "sigue", personas: "2", confianza: "0.83" })).toMatchObject({
      success: true,
      data: { motivo: "sigue", personas: 2, confianza: 0.83 },
    });
    for (const malo of [
      { motivo: "otro", personas: "1", confianza: "0.5" },
      { motivo: "sigue", personas: "0", confianza: "0.5" },
      { motivo: "sigue", personas: "51", confianza: "0.5" },
      { motivo: "sigue", personas: "1.5", confianza: "0.5" },
      { motivo: "sigue", personas: "1", confianza: "1.2" },
      { motivo: "sigue", personas: "1", confianza: "-0.1" },
      { motivo: "sigue", personas: null, confianza: "0.5" },
    ]) {
      expect(metaFotoPersonaSchema.safeParse(malo).success).toBe(false);
    }
  });
});
