import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/documents.db", () => ({ DocumentsDB: {} }));
vi.mock("@/lib/documents/storage", () => ({ buildStoragePath: vi.fn(), uploadToStorage: vi.fn() }));

import {
  nombreArchivoFotoAsistencia,
  tagsFotoAsistencia,
  leerNombreFotoAsistencia,
} from "@/lib/rrhh/asistencia-fotos.server";

describe("asistencia-fotos", () => {
  it("nombre en hora de Lima y sin separadores de ruta", () => {
    const n = nombreArchivoFotoAsistencia(new Date("2026-10-09T12:42:10Z"), "Juan/Pérez", "Entrada: portón");
    expect(n).toBe("07-42-10 · Juan-Pérez · Entrada- portón.webp");
  });
  it("tags del contrato", () => {
    expect(tagsFotoAsistencia("c1", "2026-10-09")).toEqual(["asistencia", "colaborador:c1", "fecha:2026-10-09"]);
  });
  it("lee hora y cámara del nombre", () => {
    expect(leerNombreFotoAsistencia("07-42-10 · Juan · Entrada.webp")).toEqual({ hora: "07:42", camara: "Entrada" });
    expect(leerNombreFotoAsistencia("foto.webp")).toBeNull();
  });
});
