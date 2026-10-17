import { describe, it, expect } from "vitest";
import {
  decidirAcciones,
  aRutasLogicas,
  nombreDeConflicto,
  huellaDe,
  resumirAcciones,
  type ArchivoLocal,
  type DocumentoRemoto,
  type EstadoPrevio,
} from "@/lib/documentos/carpeta-local/decidir";
import {
  nombreSeguro,
  rutaSegura,
  rutaLogica,
  partirRutaLogica,
  rutaUnica,
} from "@/lib/documentos/carpeta-local/rutas";
import { manifiestoRemoto } from "@/lib/documentos/carpeta-local/motor";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";

/**
 * Sync de la carpeta del escritorio con el drive del panel.
 *
 * Cada caso de acá es una forma distinta de perder un archivo. El más caro es
 * el par "está sólo de un lado": según lo que se hizo antes, la misma foto
 * significa "copialo" o "borralo", y equivocarse borra trabajo de alguien.
 */

const local = (ruta: string, size = 100, modificado = 1000): ArchivoLocal =>
  ({ ruta, rutaLocal: ruta, size, modificado });
const remoto = (ruta: string, id: string, updatedAt = "2026-08-01T00:00:00.000Z"): DocumentoRemoto =>
  ({ ruta, id, updatedAt, size: 100 });
const previo = (documentId: string, huella: string, serverUpdatedAt: string, rutaLocal: string): EstadoPrevio =>
  ({ documentId, huella, serverUpdatedAt, rutaLocal });

const decidir = (
  locales: ArchivoLocal[],
  remotos: DocumentoRemoto[],
  previos: Record<string, EstadoPrevio> = {},
) =>
  decidirAcciones({
    locales: new Map(locales.map((l) => [l.ruta, l])),
    remotos: new Map(remotos.map((r) => [r.ruta, r])),
    previos,
  });

describe("decidirAcciones — archivo en un solo lado", () => {
  it("sólo en el disco y nunca sincronizado → se sube", () => {
    expect(decidir([local("nota.txt")], [])).toEqual([{ tipo: "subir", ruta: "nota.txt", documentId: null }]);
  });

  it("sólo en el disco pero YA se había sincronizado → lo borraron en el panel", () => {
    const previos = { "nota.txt": previo("d1", huellaDe({ size: 100, modificado: 1000 }), "u1", "nota.txt") };
    expect(decidir([local("nota.txt")], [], previos)).toEqual([{ tipo: "borrar-local", ruta: "nota.txt" }]);
  });

  it("sólo en el panel y nunca sincronizado → se baja", () => {
    expect(decidir([], [remoto("nota.txt", "d1")])).toEqual([
      { tipo: "bajar", ruta: "nota.txt", documentId: "d1", updatedAt: "2026-08-01T00:00:00.000Z" },
    ]);
  });

  it("sólo en el panel pero YA se había sincronizado → lo borraste vos, va a la papelera", () => {
    const previos = { "nota.txt": previo("d1", "100:1000", "2026-08-01T00:00:00.000Z", "nota.txt") };
    expect(decidir([], [remoto("nota.txt", "d1")], previos)).toEqual([
      { tipo: "borrar-remoto", ruta: "nota.txt", documentId: "d1" },
    ]);
  });

  it("no está en ningún lado pero quedó en el estado → se olvida", () => {
    const previos = { "viejo.txt": previo("d9", "1:1", "u", "viejo.txt") };
    expect(decidir([], [], previos)).toEqual([{ tipo: "olvidar", ruta: "viejo.txt" }]);
  });
});

describe("decidirAcciones — está en los dos lados", () => {
  const sincronizado = { "nota.txt": previo("d1", "100:1000", "2026-08-01T00:00:00.000Z", "nota.txt") };

  it("nada cambió → no se toca nada", () => {
    expect(decidir([local("nota.txt")], [remoto("nota.txt", "d1")], sincronizado)).toEqual([]);
  });

  it("cambió en el disco → sube versión nueva al documento que ya existe", () => {
    const acciones = decidir([local("nota.txt", 200, 2000)], [remoto("nota.txt", "d1")], sincronizado);
    expect(acciones).toEqual([{ tipo: "subir", ruta: "nota.txt", documentId: "d1" }]);
  });

  it("cambió en el panel → se baja", () => {
    const acciones = decidir(
      [local("nota.txt")],
      [remoto("nota.txt", "d1", "2026-08-09T10:00:00.000Z")],
      sincronizado,
    );
    expect(acciones).toEqual([
      { tipo: "bajar", ruta: "nota.txt", documentId: "d1", updatedAt: "2026-08-09T10:00:00.000Z" },
    ]);
  });

  it("cambió en LOS DOS → conflicto (no se elige ganador a la callada)", () => {
    const acciones = decidir(
      [local("nota.txt", 200, 2000)],
      [remoto("nota.txt", "d1", "2026-08-09T10:00:00.000Z")],
      sincronizado,
    );
    expect(acciones[0].tipo).toBe("conflicto");
  });

  it("mismo tamaño pero guardado de nuevo (mtime distinto) cuenta como cambio", () => {
    const acciones = decidir([local("nota.txt", 100, 5555)], [remoto("nota.txt", "d1")], sincronizado);
    expect(acciones).toEqual([{ tipo: "subir", ruta: "nota.txt", documentId: "d1" }]);
  });
});

describe("aRutasLogicas — el nombre del panel no es el nombre en el disco", () => {
  it("recupera la ruta lógica de un archivo cuyo nombre hubo que sanear", () => {
    const previos = {
      "Reunión 10:30.pdf": previo("d1", "10:1", "u1", "Reunión 10_30.pdf"),
    };
    const escaneadas = new Map([["Reunión 10_30.pdf", { size: 10, modificado: 1 }]]);
    const locales = aRutasLogicas(escaneadas, previos);
    expect([...locales.keys()]).toEqual(["Reunión 10:30.pdf"]);
    expect(locales.get("Reunión 10:30.pdf")?.rutaLocal).toBe("Reunión 10_30.pdf");
  });

  it("sin esa traducción el archivo se subiría duplicado (regresión ADR-307)", () => {
    const previos = { "Reunión 10:30.pdf": previo("d1", "10:1", "u1", "Reunión 10_30.pdf") };
    const escaneadas = new Map([["Reunión 10_30.pdf", { size: 10, modificado: 1 }]]);
    const locales = aRutasLogicas(escaneadas, previos);
    const acciones = decidirAcciones({
      locales,
      remotos: new Map([["Reunión 10:30.pdf", remoto("Reunión 10:30.pdf", "d1", "u1")]]),
      previos,
    });
    expect(acciones).toEqual([]); // ni sube duplicado ni baja de nuevo
  });
});

describe("nombres que un disco acepta", () => {
  it("cambia los caracteres que Windows prohíbe", () => {
    expect(nombreSeguro('Reunión 10:30 <final>.pdf')).toBe("Reunión 10_30 _final_.pdf");
  });

  it("no deja punto ni espacio al final (Windows los recorta y el archivo 'no existe')", () => {
    expect(nombreSeguro("informe. ")).toBe("informe");
  });

  it("esquiva los nombres reservados", () => {
    expect(nombreSeguro("CON.txt")).toBe("_CON.txt");
  });

  it("saca los caracteres de control", () => {
    expect(nombreSeguro(`nota${String.fromCharCode(0)}${String.fromCharCode(10)}.txt`)).toBe("nota__.txt");
  });

  it("sanea cada segmento de la ruta por separado", () => {
    expect(rutaSegura("Boletas: 2026/enero|febrero.pdf")).toBe("Boletas_ 2026/enero_febrero.pdf");
  });

  it("arma y parte la ruta lógica", () => {
    expect(rutaLogica(["Boletas", "2026"], "enero.pdf")).toBe("Boletas/2026/enero.pdf");
    expect(partirRutaLogica("Boletas/2026/enero.pdf")).toEqual({ carpetas: ["Boletas", "2026"], nombre: "enero.pdf" });
  });

  it("desambigua dos documentos con el mismo nombre", () => {
    const tomadas = new Set(["a/factura.pdf", "a/factura (2).pdf"]);
    expect(rutaUnica("a/factura.pdf", tomadas)).toBe("a/factura (3).pdf");
  });

  it("la copia del conflicto conserva la extensión", () => {
    expect(nombreDeConflicto("Boletas/enero.pdf")).toBe("Boletas/enero (del panel).pdf");
    expect(nombreDeConflicto("sin-extension")).toBe("sin-extension (del panel)");
  });
});

describe("manifiestoRemoto — del drive a rutas de disco", () => {
  const doc = (id: string, name: string, folderId: string | null): DbDocument =>
    ({
      id, name, folderId, tenantId: "t1", originalName: name, mimeType: "application/pdf",
      size: 10, storagePath: "p", category: "otros", tags: [], favorite: false, status: "none",
      expiresAt: null, customerId: null, orderId: null, supplierId: null, ocrText: null,
      ocrMetadata: null, aiCategory: null, aiTags: [], allowedRoles: [], uploadedById: "u",
      uploadedAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", deletedAt: null,
    });
  const carpeta = (id: string, name: string, parentId: string | null): DbDocumentFolder =>
    ({
      id, name, parentId, tenantId: "t1", color: null, icon: null, emoji: null, tags: [],
      allowedRoles: [], createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
    });

  const carpetas = [carpeta("f1", "Boletas", null), carpeta("f2", "2026", "f1")];

  it("la ruta es la cadena de carpetas más el nombre", () => {
    const { remotos } = manifiestoRemoto([doc("d1", "enero.pdf", "f2")], carpetas, null);
    expect([...remotos.keys()]).toEqual(["Boletas/2026/enero.pdf"]);
  });

  it("con carpeta raíz elegida, las rutas se cuentan DESDE ahí", () => {
    const { remotos } = manifiestoRemoto([doc("d1", "enero.pdf", "f2")], carpetas, "f1");
    expect([...remotos.keys()]).toEqual(["2026/enero.pdf"]);
  });

  it("deja afuera lo que está fuera del subárbol elegido", () => {
    const docs = [doc("d1", "enero.pdf", "f2"), doc("d2", "suelto.pdf", null)];
    const { remotos } = manifiestoRemoto(docs, carpetas, "f1");
    expect([...remotos.keys()]).toEqual(["2026/enero.pdf"]);
  });

  it("no baja los que están en la papelera", () => {
    const borrado = { ...doc("d3", "viejo.pdf", null), deletedAt: "2026-08-02T00:00:00.000Z" };
    const { remotos } = manifiestoRemoto([borrado], carpetas, null);
    expect(remotos.size).toBe(0);
  });

  it("avisa cuando dos documentos comparten ruta en vez de pisar uno con otro", () => {
    const docs = [doc("d1", "factura.pdf", null), doc("d2", "factura.pdf", null)];
    const { remotos, repetidas } = manifiestoRemoto(docs, carpetas, null);
    expect(remotos.size).toBe(1);
    expect(repetidas).toEqual(["factura.pdf"]);
  });

  it("sanea el nombre del documento al convertirlo en ruta", () => {
    const { remotos } = manifiestoRemoto([doc("d1", "Reunión 10:30.pdf", null)], carpetas, null);
    expect([...remotos.keys()]).toEqual(["Reunión 10_30.pdf"]);
  });
});

describe("resumirAcciones — lo que se le muestra a la persona antes de tocar nada", () => {
  it("cuenta por tipo y da el total de trabajo real", () => {
    const acciones = decidir(
      [local("nuevo.txt"), local("cambiado.txt", 5, 9)],
      [remoto("delPanel.txt", "d2"), remoto("cambiado.txt", "d3")],
      { "cambiado.txt": previo("d3", "1:1", "2026-08-01T00:00:00.000Z", "cambiado.txt") },
    );
    const r = resumirAcciones(acciones);
    expect(r.subir).toBe(2);   // nuevo + la versión del cambiado
    expect(r.bajar).toBe(1);
    expect(r.total).toBe(3);
  });

  it("olvidar no cuenta como trabajo (no toca ningún archivo)", () => {
    const r = resumirAcciones(decidir([], [], { "x.txt": previo("d1", "1:1", "u", "x.txt") }));
    expect(r.total).toBe(0);
  });
});
