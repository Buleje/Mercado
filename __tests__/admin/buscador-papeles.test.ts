import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { papelesComoResultados, rutaCorta, vencimientoDe } from "@/components/admin/buscador/papeles-del-buscador";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";

const HOY = new Date("2026-10-22T15:00:00Z");

function carpeta(id: string, name: string, parentId: string | null = null): DbDocumentFolder {
  return { id, name, parentId } as DbDocumentFolder;
}

function papel(id: string, name: string, extra: Partial<DbDocument> = {}): DbDocument {
  return { id, name, folderId: null, expiresAt: null, deletedAt: null, ...extra } as DbDocument;
}

const CARPETAS = [carpeta("a", "Personal"), carpeta("b", "Jefe", "a"), carpeta("c", "DNI", "b")];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(HOY);
});
afterEach(() => vi.useRealTimers());

describe("rutaCorta", () => {
  const porId = new Map(CARPETAS.map((c) => [c.id, c]));
  it("deja los dos últimos niveles", () => {
    expect(rutaCorta("c", porId)).toBe("Jefe › DNI");
    expect(rutaCorta("a", porId)).toBe("Personal");
  });
  it("un papel suelto o con carpeta desconocida cuelga del Archivo", () => {
    expect(rutaCorta(null, porId)).toBe("Archivo");
    expect(rutaCorta("zzz", porId)).toBe("Archivo");
  });
});

describe("vencimientoDe", () => {
  it("sin fecha, no hay chip", () => {
    expect(vencimientoDe(null)).toBeNull();
  });
  it("cerca se dice en palabras y lo pasado queda marcado como vencido", () => {
    expect(vencimientoDe("2026-10-30T12:00:00Z")).toEqual({ texto: "Vence en 8 días", vencido: false });
    const v = vencimientoDe("2026-10-10T12:00:00Z");
    expect(v?.vencido).toBe(true);
    expect(v?.texto).toMatch(/^Venció hace \d+ días$/);
  });
  it("lejos se dice con la fecha", () => {
    const v = vencimientoDe("2030-01-31T12:00:00Z");
    expect(v?.vencido).toBe(false);
    expect(v?.texto).toMatch(/^Vence .*2030/);
    expect(vencimientoDe("2024-03-05T12:00:00Z")?.texto).toMatch(/^Venció .*2024/);
  });
});

describe("papelesComoResultados", () => {
  it("con menos de 2 letras o sin papeles no devuelve nada (ni el «Buscar en el Archivo»)", () => {
    expect(papelesComoResultados("d", [papel("1", "DNI")], CARPETAS)).toEqual([]);
    expect(papelesComoResultados("dni", [], CARPETAS)).toEqual([]);
  });

  it("deja 5 papeles, el de mejor nombre primero, y el ítem final que abre el Archivo con la búsqueda", () => {
    const docs = [
      papel("1", "Contrato Jefe"),
      papel("2", "Cédula del jefe", { folderId: "c" }),
      papel("3", "DNI jefe Brandon", { folderId: "c", expiresAt: "2026-10-01T12:00:00Z" }),
      papel("4", "Foto DNI"),
      papel("5", "Otro"),
      papel("6", "Otro 2"),
      papel("7", "Otro 3"),
    ];
    const filas = papelesComoResultados("DNI jefe", docs, CARPETAS);
    expect(filas).toHaveLength(6);
    expect(filas[0]).toMatchObject({ id: "papel-3", type: "papel", title: "DNI jefe Brandon", subtitle: "Jefe › DNI" });
    expect(filas[0].href).toBe("/admin?tab=documentos&vista=drive&doc=3");
    expect(filas[0].vence?.vencido).toBe(true);
    /* Con una sola palabra de las dos, queda detrás pero antes de lo que no coincide. */
    expect(filas.slice(1, 4).map((f) => f.id).sort()).toEqual(["papel-1", "papel-2", "papel-4"]);

    const ultimo = filas[5];
    expect(ultimo).toMatchObject({ type: "papel", sinContar: true, title: "Buscar “DNI jefe” en el Archivo" });
    expect(ultimo.href).toBe("/admin?tab=documentos&vista=drive&q=DNI+jefe");
  });

  it("compara sin tildes ni mayúsculas y salta los de la papelera", () => {
    const filas = papelesComoResultados("cedula", [papel("1", "CÉDULA"), papel("2", "Cédula vieja", { deletedAt: "2026-10-01T00:00:00Z" })], CARPETAS);
    expect(filas.filter((f) => !f.sinContar).map((f) => f.id)).toEqual(["papel-1"]);
  });
});
