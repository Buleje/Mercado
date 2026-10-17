/**
 * Revisión de seguridad 08-10 (ADR-482): los papeles de una guía nacen con los
 * roles de la ruta (el cajero no los ve en el Drive general) y el conteo de
 * papeles pide por lotes (el GET acepta hasta 200 guías).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const create = vi.fn();
vi.mock("@/lib/db/documents.db", () => ({
  DocumentsDB: {
    createFolderTree: vi.fn(async (_t: string, { rutas }: { rutas: string[] }) => ({
      idPorRuta: { [rutas[0]]: "carpeta-1" },
      creadas: 0,
    })),
    create: (...a: unknown[]) => create(...a),
    update: vi.fn(async (_t: string, id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
    hardDelete: vi.fn(),
    softDelete: vi.fn(async () => true),
    log: vi.fn(async () => undefined),
  },
}));
vi.mock("@/lib/documents/storage", () => ({
  buildStoragePath: () => "t/doc/v1/archivo.pdf",
  uploadToStorage: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/documents/analyze-document", () => ({
  analyzeDocumentContent: vi.fn(),
  isAnalyzableMime: () => false,
}));
vi.mock("@/lib/documents/cola-analisis", () => ({ enColaDeAnalisis: vi.fn(async () => undefined) }));
vi.mock("@/lib/documents/precalcular-miniatura", () => ({ precalcularMiniatura: vi.fn(async () => undefined) }));

import { guardarDocumentoDeGuia } from "@/lib/forestal/documentos-guia-server";
import { ROLES_PAPELES_GUIA } from "@/lib/forestal/documentos-guia";
import { useConteoDocumentosGuias } from "@/hooks/use-documentos-guia";

describe("papel de guía nace restringido", () => {
  beforeEach(() => {
    create.mockReset();
    create.mockImplementation(async (_t: string, input: Record<string, unknown>) => ({ id: "doc-1", ...input }));
  });

  it("DocumentsDB.create recibe los roles de la ruta, no los vacíos de la carpeta", async () => {
    const doc = await guardarDocumentoDeGuia({
      tenantId: "t1",
      user: "qaalmacen",
      role: "almacenero",
      guia: {
        gtfNumber: "019-001-0000771",
        entryDate: null,
        providerName: null,
        titular: "Juan Pérez",
        permiso: "PERM-1",
        origen: "libro-th",
      },
      casillero: "factura",
      archivo: { ok: true, buffer: Buffer.from("%PDF-1.4"), mime: "application/pdf", ext: "pdf" },
      nombreOriginal: "factura.pdf",
    });
    expect(doc).not.toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
    const input = create.mock.calls[0][1] as { allowedRoles?: string[]; folderId?: string };
    expect(input.allowedRoles).toEqual([...ROLES_PAPELES_GUIA]);
    expect(input.allowedRoles).not.toContain("cajero");
    expect(input.folderId).toBe("carpeta-1");
  });
});

describe("conteo de papeles por lotes", () => {
  const pedidos: string[][] = [];
  afterEach(() => {
    vi.unstubAllGlobals();
    pedidos.length = 0;
  });

  const guias = (n: number) => Array.from({ length: n }, (_, i) => `019-${String(i).padStart(7, "0")}`);
  const stubFetch = (fallaLote?: number) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const lista = decodeURIComponent(url.split("gtfs=")[1]).split(",");
        pedidos.push(lista);
        if (fallaLote != null && pedidos.length - 1 === fallaLote) return new Response("{}", { status: 400 });
        const faltan = Object.fromEntries(lista.map((g) => [g, []]));
        return new Response(JSON.stringify({ llenos: {}, faltan }), { status: 200 });
      }),
    );

  it("250 guías → 3 pedidos de ≤100 y todas medidas", async () => {
    stubFetch();
    const { result } = renderHook(() => useConteoDocumentosGuias(guias(250)));
    await waitFor(() => expect(Object.keys(result.current.faltan)).toHaveLength(250));
    expect(pedidos.map((p) => p.length)).toEqual([100, 100, 50]);
    expect(result.current.fallo).toBe(false);
  });

  it("un lote que falla → fallo=true (la barra muestra «—», no «…» para siempre)", async () => {
    stubFetch(1);
    const { result } = renderHook(() => useConteoDocumentosGuias(guias(250)));
    await waitFor(() => expect(result.current.fallo).toBe(true));
    expect(Object.keys(result.current.faltan)).toHaveLength(150);
  });
});
