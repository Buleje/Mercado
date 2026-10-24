import { describe, it, expect } from "vitest";
import {
  TAG_ESENCIAL, armarEsenciales, contenidoDe, esEsencial, esTagDeMarca, filtrarEsenciales, masAbiertos,
  moverEnOrden, ordenarEsenciales, rutaDe, sugerirEsenciales, vencimientosEncontrados, type DocEsencial,
} from "@/lib/documentos/esenciales";
import type { CarpetaMin } from "@/lib/documentos/terceros-vinculo";

const c = (id: string, tags: string[] = [], parentId: string | null = null, name = id): CarpetaMin => ({ id, name, parentId, tags });
const d = (id: string, folderId: string | null, extra: Partial<DocEsencial> = {}): DocEsencial => ({
  id, folderId, name: id, uploadedAt: "2026-10-01T10:00:00.000Z", size: 100, ...extra,
});
const HOY = new Date("2026-10-23T12:00:00.000Z");

describe("marca «esencial» de la carpeta", () => {
  it("se reconoce sin importar mayúsculas y es etiqueta de máquina", () => {
    expect(esEsencial({ tags: ["legal", "MARCA:Esencial"] })).toBe(true);
    expect(esEsencial({ tags: ["esencial"] })).toBe(false);
    expect(esEsencial({ tags: null })).toBe(false);
    expect(esTagDeMarca(TAG_ESENCIAL)).toBe(true);
    expect(esTagDeMarca("legal")).toBe(false);
  });
});

describe("armarEsenciales", () => {
  const carpetas = [
    c("raiz", [], null, "Empresa"),
    c("lic", [TAG_ESENCIAL], "raiz", "Licencias"),
    c("lic-2026", [], "lic", "2026"),
    c("otra", []),
    c("cont", [TAG_ESENCIAL], null, "Contratos"),
  ];
  const docs = [
    d("a", "lic", { size: 1000, expiresAt: "2026-10-01T00:00:00.000Z" }),
    d("b", "lic-2026", { size: 500, expiresAt: "2026-11-10T00:00:00.000Z", uploadedAt: "2026-10-20T10:00:00.000Z" }),
    d("c", "otra"),
    d("e", "cont"),
  ];

  it("sólo las marcadas, con lo de sus subcarpetas y dónde viven", () => {
    const lista = armarEsenciales({ carpetas, docs, hoy: HOY });
    expect(lista.map((e) => e.carpeta.id)).toEqual(["lic", "cont"]);
    const lic = lista[0];
    expect(lic.ruta).toEqual(["Empresa"]);
    expect(lic.docs).toBe(2);
    expect(lic.bytes).toBe(1500);
    expect(lic.subcarpetas).toBe(1);
    expect(lic.vencidos).toBe(1);
    expect(lic.porVencer).toBe(1);
    expect(lic.ultima).toBe("2026-10-20T10:00:00.000Z");
    expect(lista[1].ruta).toEqual([]);
  });

  it("las aperturas suman sólo papeles que el rol ve y ordenan por uso", () => {
    const uso = {
      e: { vistas: 9, ultima: "2026-10-22T10:00:00.000Z" },
      a: { vistas: 2, ultima: "2026-10-21T10:00:00.000Z" },
      c: { vistas: 50, ultima: "2026-10-22T10:00:00.000Z" },
      fantasma: { vistas: 99, ultima: null },
    };
    const lista = armarEsenciales({ carpetas, docs, uso, hoy: HOY });
    expect(lista.find((e) => e.carpeta.id === "lic")?.vistas).toBe(2);
    expect(ordenarEsenciales(lista, "uso").map((e) => e.carpeta.id)).toEqual(["cont", "lic"]);
    expect(ordenarEsenciales(lista, "nombre").map((e) => e.carpeta.name)).toEqual(["Contratos", "Licencias"]);
    expect(filtrarEsenciales(lista, "empresa").map((e) => e.carpeta.id)).toEqual(["lic"]);
    expect(filtrarEsenciales(lista, "licéncias").map((e) => e.carpeta.id)).toEqual(["lic"]);
  });

  it("una carpeta escondida para el rol no aparece aunque esté marcada", () => {
    const visibles = carpetas.filter((x) => x.id !== "cont");
    expect(armarEsenciales({ carpetas: visibles, docs, hoy: HOY }).map((e) => e.carpeta.id)).toEqual(["lic"]);
  });
});

describe("mi orden", () => {
  const carpetas = [c("a", [TAG_ESENCIAL], null, "Alfa"), c("b", [TAG_ESENCIAL], null, "Beta"), c("z", [TAG_ESENCIAL], null, "Zeta")];
  const lista = armarEsenciales({ carpetas, docs: [], hoy: HOY });

  it("sigue la lista guardada y lo nuevo va al final", () => {
    expect(ordenarEsenciales(lista, "manual", ["z", "a"]).map((e) => e.carpeta.id)).toEqual(["z", "a", "b"]);
    expect(ordenarEsenciales(lista, "manual").map((e) => e.carpeta.id)).toEqual(["a", "b", "z"]);
  });

  it("moverEnOrden pone la carpeta antes de otra o al final", () => {
    expect(moverEnOrden(["a", "b", "z"], "z", "a")).toEqual(["z", "a", "b"]);
    expect(moverEnOrden(["a", "b", "z"], "a", null)).toEqual(["b", "z", "a"]);
    expect(moverEnOrden(["a", "b"], "x", "b")).toEqual(["a", "x", "b"]);
  });
});

describe("contenido y lo más abierto", () => {
  it("contenidoDe da lo directo: subcarpetas por nombre y papeles", () => {
    const carpetas = [c("p"), c("z", [], "p", "Zeta"), c("a", [], "p", "Alfa"), c("n", [], "z")];
    const docs = [d("1", "p"), d("2", "z")];
    const r = contenidoDe("p", carpetas, docs);
    expect(r.subcarpetas.map((x) => x.name)).toEqual(["Alfa", "Zeta"]);
    expect(r.docs.map((x) => x.id)).toEqual(["1"]);
  });

  it("masAbiertos deja afuera lo que nunca se abrió", () => {
    const docs = [d("1", "p"), d("2", "p"), d("3", "p")];
    const uso = { "1": { vistas: 1, ultima: null }, "3": { vistas: 5, ultima: null } };
    expect(masAbiertos(docs, uso).map((x) => x.id)).toEqual(["3", "1"]);
  });

  it("rutaDe no se cuelga con un ciclo en el árbol", () => {
    const porId = new Map([["x", c("x", [], "y")], ["y", c("y", [], "x")]]);
    expect(rutaDe("x", porId)).toEqual(["y"]);
  });
});

describe("sugerirEsenciales", () => {
  const carpetas = [
    c("ccnn", [TAG_ESENCIAL], null, "CCNN Santa Rosa"),
    c("ccnn-sub", [], "ccnn", "19-SEC"),
    c("plan", [], null, "Registro de plantación"),
    c("gtf", [], null, "Guías forestales"),
    c("poco", [], null, "Poco uso"),
  ];
  const docs = [d("a", "ccnn-sub"), d("b", "plan"), d("b2", "plan"), d("g", "gtf"), d("p", "poco")];
  const uso = { a: { vistas: 30, ultima: null }, b: { vistas: 5, ultima: null }, b2: { vistas: 3, ultima: null }, g: { vistas: 5, ultima: null }, p: { vistas: 1, ultima: null } };

  it("propone las más abiertas que no están ni cuelgan de una esencial", () => {
    const s = sugerirEsenciales({ carpetas, docs, uso });
    expect(s.map((x) => [x.carpeta.id, x.vistas])).toEqual([["plan", 8], ["gtf", 5]]);
  });

  it("no vuelve a proponer lo descartado", () => {
    expect(sugerirEsenciales({ carpetas, docs, uso, descartadas: ["plan"] }).map((x) => x.carpeta.id)).toEqual(["gtf"]);
  });
});

describe("vencimientosEncontrados", () => {
  it("las fechas leídas que faltan poner, la más cercana primero", () => {
    const docs = [
      { ...d("lic", "f"), ocrMetadata: { sugerencias: { expiresAt: "2030-05-12" } } },
      { ...d("dni", "f"), ocrMetadata: { sugerencias: { expiresAt: "2027-01-01" } } },
      { ...d("ya", "f", { expiresAt: "2028-01-01" }), ocrMetadata: { sugerencias: { expiresAt: "2028-01-01" } } },
      { ...d("roto", "f"), ocrMetadata: { sugerencias: { expiresAt: "no es fecha" } } },
      { ...d("nada", "f"), ocrMetadata: null },
    ];
    expect(vencimientosEncontrados(docs).map((x) => x.doc.id)).toEqual(["dni", "lic"]);
    expect(vencimientosEncontrados(docs, new Set(["dni"])).map((x) => x.doc.id)).toEqual(["lic"]);
  });
});
