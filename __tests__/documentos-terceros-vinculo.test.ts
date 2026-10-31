import { describe, it, expect } from "vitest";
import {
  agruparPorTipo, armarTerceros, claveVinculo, docsDelTercero, filtrarTerceros, idDeOtro, leerVinculo,
  masUsados, nombreDeOtro, ordenarDocsTercero, vinculosDeCarpeta, TOPE_ETIQUETA,
  type CarpetaMin, type DocMin,
} from "@/lib/documentos/terceros-vinculo";
import { tagEntidad } from "@/lib/documentos/enlaces-entidad";

const c = (id: string, tags: string[] = [], parentId: string | null = null): CarpetaMin => ({ id, name: id, parentId, tags });
const d = (id: string, folderId: string | null, extra: Partial<DocMin> = {}): DocMin => ({
  id, folderId, name: id, uploadedAt: "2026-10-01T10:00:00.000Z", ...extra,
});
const HOY = new Date("2026-10-23T12:00:00.000Z");

describe("vínculo carpeta ↔ tercero (etiqueta ADR-502)", () => {
  it("persona y colaborador usan el mismo prefijo que sus papeles", () => {
    expect(claveVinculo("persona", "abc")).toBe(tagEntidad("tercero", "abc"));
    expect(claveVinculo("colaborador", "xyz")).toBe(tagEntidad("colaborador", "xyz"));
    expect(claveVinculo("comunidad", "P1")).toBe("parte:p1");
  });

  it("lee las etiquetas de vínculo e ignora las demás", () => {
    expect(leerVinculo("proveedor:sup-1")).toEqual({ tipo: "proveedor", id: "sup-1" });
    expect(leerVinculo("otro:")).toBeNull();
    expect(leerVinculo("contrato")).toBeNull();
    expect(vinculosDeCarpeta({ tags: ["contrato", "cliente:999", "CLIENTE:999", "otro:juan"] })).toEqual(["cliente:999", "otro:juan"]);
  });

  it("«otro» guarda el nombre recortado para que la etiqueta entre en el tope", () => {
    const id = idDeOtro("Notaría   Pérez, Calle: Larga de verdad muy muy larga");
    expect(claveVinculo("otro", id).length).toBeLessThanOrEqual(TOPE_ETIQUETA);
    expect(id).not.toMatch(/[:,]/);
    expect(nombreDeOtro("notaría pérez")).toBe("Notaría Pérez");
  });
});

describe("armarTerceros", () => {
  const carpetas = [
    c("f1", ["tercero:p1"]),
    c("f1a", [], "f1"),
    c("f2", ["proveedor:s1", "tercero:p1"]),
    c("f3", ["cliente:999"]),
    c("f4"),
  ];
  const docs = [
    d("a", "f1", { expiresAt: "2026-10-01T00:00:00.000Z" }),
    d("b", "f1a", { expiresAt: "2026-11-10T00:00:00.000Z", uploadedAt: "2026-10-20T10:00:00.000Z" }),
    d("c", "f2"),
    d("e", "f4"),
    d("g", null),
  ];

  it("junta las carpetas de cada tercero con sus subcarpetas y cuenta papeles y vencimientos", () => {
    const lista = armarTerceros({ carpetas, docs, nombres: { "tercero:p1": { nombre: "Juana", detalle: "DNI 1" } }, hoy: HOY });
    const juana = lista.find((t) => t.clave === "tercero:p1");
    expect(juana?.nombre).toBe("Juana");
    expect([...(juana?.carpetaIds ?? [])].sort()).toEqual(["f1", "f1a", "f2"]);
    expect(juana?.docs).toBe(3);
    expect(juana?.vencidos).toBe(1);
    expect(juana?.porVencer).toBe(1);
    expect(docsDelTercero(juana!, docs).map((x) => x.id).sort()).toEqual(["a", "b", "c"]);
    // Sin nombre resuelto sale «sin ficha», no el id crudo.
    expect(lista.find((t) => t.clave === "proveedor:s1")?.nombre).toBe("Proveedor sin ficha");
  });

  it("lo más usado primero: aperturas, después lo más reciente", () => {
    const lista = armarTerceros({
      carpetas, docs, hoy: HOY,
      uso: { f3: { vistas: 9, ultima: "2026-10-22T10:00:00.000Z" }, f1a: { vistas: 2, ultima: "2026-10-21T10:00:00.000Z" } },
    });
    expect(lista.map((t) => t.clave)).toEqual(["cliente:999", "tercero:p1", "proveedor:s1"]);
    expect(lista[1].vistas).toBe(2);
    expect(masUsados(lista).map((t) => t.clave)).toEqual(["cliente:999", "tercero:p1"]);
  });

  it("respeta lo que el rol ve: carpeta escondida = no aparece ni cuenta su subcarpeta", () => {
    // f1 no está en la lista del rol (candado o permiso): su vínculo no sale, y f1a (hija) tampoco
    // llega porque el servidor esconde la cadena entera.
    const visibles = carpetas.filter((x) => x.id !== "f1" && x.id !== "f1a");
    const lista = armarTerceros({ carpetas: visibles, docs: docs.filter((x) => x.folderId !== "f1" && x.folderId !== "f1a"), hoy: HOY });
    const juana = lista.find((t) => t.clave === "tercero:p1");
    expect([...(juana?.carpetaIds ?? [])]).toEqual(["f2"]);
    expect(juana?.docs).toBe(1);
  });

  it("desvincular (quitar la etiqueta) lo saca de la lista", () => {
    const sin = carpetas.map((x) => (x.id === "f3" ? { ...x, tags: [] } : x));
    expect(armarTerceros({ carpetas: sin, docs, hoy: HOY }).some((t) => t.clave === "cliente:999")).toBe(false);
  });

  it("agrupa por tipo en orden fijo y filtra sin tildes", () => {
    const lista = armarTerceros({ carpetas, docs, nombres: { "tercero:p1": { nombre: "Juana Pérez" } }, hoy: HOY });
    expect(agruparPorTipo(lista).map((g) => [g.tipo, g.terceros.length])).toEqual([["persona", 1], ["proveedor", 1], ["cliente", 1]]);
    expect(filtrarTerceros(lista, "perez").map((t) => t.clave)).toEqual(["tercero:p1"]);
    expect(filtrarTerceros(lista, "", "cliente").map((t) => t.clave)).toEqual(["cliente:999"]);
  });
});

describe("ordenarDocsTercero", () => {
  const docs = [
    d("Contrato 10", "f", { uploadedAt: "2026-10-02T00:00:00.000Z", expiresAt: null }),
    d("Contrato 2", "f", { uploadedAt: "2026-10-05T00:00:00.000Z", expiresAt: "2027-01-01T00:00:00.000Z" }),
    d("Acta", "f", { uploadedAt: "2026-09-01T00:00:00.000Z", expiresAt: "2026-11-01T00:00:00.000Z" }),
  ];
  it("por fecha, nombre (numérico) y vencimiento (sin fecha al final)", () => {
    expect(ordenarDocsTercero(docs, "fecha").map((x) => x.id)).toEqual(["Contrato 2", "Contrato 10", "Acta"]);
    expect(ordenarDocsTercero(docs, "nombre").map((x) => x.id)).toEqual(["Acta", "Contrato 2", "Contrato 10"]);
    expect(ordenarDocsTercero(docs, "vencimiento").map((x) => x.id)).toEqual(["Acta", "Contrato 2", "Contrato 10"]);
  });
});
