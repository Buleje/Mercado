/**
 * Documentos › Esenciales › la carpeta amplia (Brandon 23-10): el árbol entero de la
 * carpeta esencial con sus cuentas y los papeles que se arrastran entre subcarpetas.
 *
 * Lo que puede mentir:
 *  - la cuenta de una rama que no suma lo de sus subcarpetas (el 98 % de los papeles
 *    de Blas vive a 3 niveles o más: la raíz diría «0»);
 *  - un ciclo entre carpetas (dato roto) que cuelga la pestaña;
 *  - el árbol que no se abre hasta la elegida (hay que buscarla a mano);
 *  - soltar papeles que no llama a mover con los ids, o los mueve a donde ya estaban.
 */

import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import {
  ancestrosDe, aplanar, armarArbol, caminoHasta, coincideBusqueda, idsAMover, idsDeLaRama, leerIdsArrastrados,
  nodoDe, papelesDeLaVista, rutaRelativa, textoMovidos, visiblesEnOrden,
} from "@/lib/documentos/arbol-esencial";
import { armarEsenciales, TAG_ESENCIAL } from "@/lib/documentos/esenciales";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(() => "t") }));
vi.mock("sonner", () => ({ toast }));

import ArbolEsencial, { TIPO_ARRASTRE_PAPEL } from "@/components/admin/documentos/esenciales/ArbolEsencial";
import CarpetaAmplia from "@/components/admin/documentos/esenciales/CarpetaAmplia";
import type { ModeloArchivo } from "@/components/admin/documentos/archivo/use-archivo";

const F = (id: string, parentId: string | null, name = id, extra: Partial<DbDocumentFolder> = {}): DbDocumentFolder => ({
  id, tenantId: "t", parentId, name, color: null, icon: null, emoji: null, tags: [], allowedRoles: [],
  createdAt: "2026-01-10T10:00:00.000Z", updatedAt: "2026-01-10T10:00:00.000Z", ...extra,
});
const D = (id: string, folderId: string | null, extra: Partial<DbDocument> = {}): DbDocument => ({
  id, tenantId: "t", folderId, name: `${id}.pdf`, originalName: `${id}.pdf`, mimeType: "application/pdf", size: 1000,
  storagePath: "", category: "", tags: [], favorite: false, status: "none", expiresAt: null, customerId: null, orderId: null,
  supplierId: null, ocrText: null, ocrMetadata: null, aiCategory: null, aiTags: [], allowedRoles: [], uploadedById: "u",
  uploadedAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-01T10:00:00.000Z", deletedAt: null, ...extra,
});

// GTF › 2026 › Lote 2 / Lote 10 › Enero (4 niveles, como Blas) + «Anuladas» al costado.
const RAIZ = F("gtf", null, "GTF", { tags: [TAG_ESENCIAL] });
const CARPETAS: DbDocumentFolder[] = [
  RAIZ,
  F("a2026", "gtf", "2026"),
  F("lote10", "a2026", "Lote 10"),
  F("lote2", "a2026", "Lote 2"),
  F("enero", "lote2", "Enero"),
  F("anuladas", "gtf", "Anuladas"),
  F("afuera", null, "Otra cosa"),
];
const DOCS: DbDocument[] = [
  D("suelto", "gtf"),
  D("g1", "enero", { size: 2000 }),
  D("g2", "enero", { ocrText: "Guía de transporte forestal — Ucayali" }),
  D("g3", "lote10"),
  D("an1", "anuladas", { name: "Anulación.pdf" }),
  D("fuera", "afuera"),
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("armarArbol", () => {
  const arbol = armarArbol(RAIZ, CARPETAS, DOCS);

  it("cada rama cuenta lo suyo y lo de sus subcarpetas; los niveles salen de la raíz", () => {
    expect(arbol.docsTotales).toBe(5);
    expect(arbol.docsDirectos).toBe(1);
    const a2026 = nodoDe(arbol, "a2026");
    expect(a2026?.docsTotales).toBe(3);
    expect(a2026?.docsDirectos).toBe(0);
    expect(nodoDe(arbol, "enero")?.nivel).toBe(3);
    expect(nodoDe(arbol, "enero")?.bytesTotales).toBe(3000);
    expect(nodoDe(arbol, "afuera")).toBeNull();
  });

  it("las hermanas van por nombre natural: «Lote 2» antes que «Lote 10»", () => {
    expect(nodoDe(arbol, "a2026")?.hijos.map((h) => h.carpeta.name)).toEqual(["Lote 2", "Lote 10"]);
    expect(arbol.hijos.map((h) => h.carpeta.name)).toEqual(["2026", "Anuladas"]);
  });

  it("un ciclo entre carpetas, una que apunta a sí misma o un id repetido no cuelgan", () => {
    // y ↔ x2 en ciclo (sin llegar a la raíz), «yo» madre de sí misma, «x» dos veces.
    const rotas = [F("x", "r"), F("y", "x2"), F("x2", "y"), F("yo", "yo"), F("x", "r", "x repetida")];
    expect(aplanar(armarArbol(F("r", null), rotas, [])).map((n) => n.carpeta.id)).toEqual(["r", "x"]);
    // La raíz con madre dentro de su propia rama.
    const conCiclo = armarArbol(F("r", "z"), [F("r", "z"), F("z", "r")], [D("p", "z")]);
    expect(aplanar(conCiclo).map((n) => n.carpeta.id)).toEqual(["r", "z"]);
    expect(conCiclo.docsTotales).toBe(1);
  });

  it("camino, antecesoras y la ruta relativa para «Dónde»", () => {
    expect(caminoHasta(arbol, "enero").map((n) => n.carpeta.id)).toEqual(["gtf", "a2026", "lote2", "enero"]);
    expect(ancestrosDe(arbol, "enero")).toEqual(["gtf", "a2026", "lote2"]);
    expect(ancestrosDe(arbol, "afuera")).toEqual([]);
    expect(rutaRelativa(arbol, "enero", "a2026")).toBe("Lote 2 › Enero");
    expect(rutaRelativa(arbol, "a2026", "a2026")).toBe("");
    // Desde una rama que no la contiene (búsqueda): desde abajo de la raíz.
    expect(rutaRelativa(arbol, "anuladas", "a2026")).toBe("Anuladas");
    expect([...idsDeLaRama(nodoDe(arbol, "a2026") ?? arbol)].sort()).toEqual(["a2026", "enero", "lote10", "lote2"]);
  });

  it("visibles en orden respeta lo desplegado y dice la madre de cada una", () => {
    const v = visiblesEnOrden(arbol, new Set(["gtf", "a2026"]));
    expect(v.map((x) => x.nodo.carpeta.id)).toEqual(["gtf", "a2026", "lote2", "lote10", "anuladas"]);
    expect(v.find((x) => x.nodo.carpeta.id === "lote10")?.padreId).toBe("a2026");
  });
});

describe("arrastre y búsqueda", () => {
  const arbol = armarArbol(RAIZ, CARPETAS, DOCS);

  it("lee los ids arrastrados y descarta lo que no es una lista de textos", () => {
    expect(leerIdsArrastrados(JSON.stringify(["a", "b", "a", 3, ""]))).toEqual(["a", "b"]);
    expect(leerIdsArrastrados("no es json")).toEqual([]);
    expect(leerIdsArrastrados(JSON.stringify({ ids: ["a"] }))).toEqual([]);
    expect(leerIdsArrastrados(null)).toEqual([]);
  });

  it("mueve sólo los que cambian de carpeta y los que existen", () => {
    expect(idsAMover(["g1", "g3", "nadie"], DOCS, "enero")).toEqual(["g3"]);
    expect(textoMovidos(3, "GTF 2026")).toBe("3 papeles movidos a «GTF 2026»");
    expect(textoMovidos(1, "Enero")).toBe("1 papel movido a «Enero»");
  });

  it("los papeles del centro: sueltos, con subcarpetas, y la búsqueda en toda la esencial", () => {
    const ids = (xs: DbDocument[]) => xs.map((d) => d.id).sort();
    expect(ids(papelesDeLaVista({ arbol, docs: DOCS, dentroDe: "a2026", incluirSubcarpetas: false }))).toEqual([]);
    expect(ids(papelesDeLaVista({ arbol, docs: DOCS, dentroDe: "a2026", incluirSubcarpetas: true }))).toEqual(["g1", "g2", "g3"]);
    // Una carpeta mirada que ya no está en el árbol cae a la esencial.
    expect(ids(papelesDeLaVista({ arbol, docs: DOCS, dentroDe: "afuera", incluirSubcarpetas: false }))).toEqual(["suelto"]);
    // Busca sin tildes, en el texto leído y fuera de la rama mirada; nunca fuera de la esencial.
    expect(ids(papelesDeLaVista({ arbol, docs: DOCS, dentroDe: "lote10", incluirSubcarpetas: false, q: "guia ucayali" }))).toEqual([]);
    expect(ids(papelesDeLaVista({ arbol, docs: DOCS, dentroDe: "lote10", incluirSubcarpetas: false, q: "ucayali" }))).toEqual(["g2"]);
    expect(ids(papelesDeLaVista({ arbol, docs: DOCS, dentroDe: "lote10", incluirSubcarpetas: false, q: "anulacion" }))).toEqual(["an1"]);
    expect(ids(papelesDeLaVista({ arbol, docs: DOCS, dentroDe: "gtf", incluirSubcarpetas: true, q: "fuera" }))).toEqual([]);
    expect(coincideBusqueda(D("x", null, { tags: ["Contrato"] }), "contrato")).toBe(true);
  });
});

/** Un `dataTransfer` de mentira que guarda lo que se le pone (jsdom no trae DataTransfer). */
function arrastre(tipos: string[] = [], datos: Record<string, string> = {}) {
  const dt = {
    types: [...tipos],
    datos: { ...datos },
    dropEffect: "none",
    effectAllowed: "all",
    items: [] as unknown[],
    setData(t: string, v: string) { this.datos[t] = v; if (!this.types.includes(t)) this.types.push(t); },
    getData(t: string) { return this.datos[t] ?? ""; },
  };
  return dt;
}

const fila = (id: string) => {
  const li = document.querySelector(`[role="treeitem"][data-id="${id}"]`);
  if (!li) throw new Error(`sin nodo ${id}`);
  return li as HTMLElement;
};
const renglon = (id: string) => fila(id).firstElementChild as HTMLElement;

describe("ArbolEsencial", () => {
  const montar = (props: Partial<Parameters<typeof ArbolEsencial>[0]> = {}) => {
    const onElegir = vi.fn();
    const onMoverDocs = vi.fn();
    const onSoltarArchivos = vi.fn();
    render(createElement(ArbolEsencial, { raiz: RAIZ, carpetas: CARPETAS, docs: DOCS, elegida: "enero", onElegir, onMoverDocs, onSoltarArchivos, ...props }));
    return { onElegir, onMoverDocs, onSoltarArchivos };
  };

  it("se abre hasta la elegida, la marca y deja plegado lo que no está en el camino", () => {
    montar();
    expect(screen.getByRole("tree")).toBeTruthy();
    for (const id of ["gtf", "a2026", "lote2"]) expect(fila(id).getAttribute("aria-expanded")).toBe("true");
    expect(fila("enero").getAttribute("aria-selected")).toBe("true");
    expect(fila("enero").getAttribute("aria-expanded")).toBeNull();
    expect(fila("enero").tabIndex).toBe(0);
    expect(fila("gtf").tabIndex).toBe(-1);
    // «Lote 10» se ve (hermana en el camino) pero «Anuladas» no tiene hijas que mostrar.
    expect(fila("lote10").getAttribute("aria-label")).toBe("Lote 10, 1 papel");
    expect(fila("gtf").getAttribute("aria-label")).toBe("GTF, 5 papeles");
  });

  it("el teclado recorre el árbol: ↑ ← → ↓, Inicio y Enter elige", () => {
    const { onElegir } = montar();
    const tree = screen.getByRole("tree");
    fila("enero").focus();
    fireEvent.keyDown(tree, { key: "ArrowLeft" }); // hoja: sube a la madre
    expect(document.activeElement).toBe(fila("lote2"));
    fireEvent.keyDown(tree, { key: "ArrowLeft" }); // abierta: se pliega
    expect(fila("lote2").getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector('[data-id="enero"]')).toBeNull();
    fireEvent.keyDown(tree, { key: "ArrowRight" }); // cerrada: se despliega
    expect(fila("lote2").getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(tree, { key: "ArrowRight" }); // abierta: entra a la primera hija
    expect(document.activeElement).toBe(fila("enero"));
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    expect(document.activeElement).toBe(fila("lote10"));
    fireEvent.keyDown(tree, { key: "ArrowUp" });
    fireEvent.keyDown(tree, { key: "ArrowUp" });
    expect(document.activeElement).toBe(fila("lote2"));
    fireEvent.keyDown(tree, { key: "Home" });
    expect(document.activeElement).toBe(fila("gtf"));
    fireEvent.keyDown(tree, { key: "End" });
    expect(document.activeElement).toBe(fila("anuladas"));
    fireEvent.keyDown(tree, { key: "Enter" });
    expect(onElegir).toHaveBeenCalledWith("anuladas");
  });

  it("soltar papeles sobre una carpeta llama a mover con sus ids y la resalta mientras pasa encima", () => {
    const { onMoverDocs, onSoltarArchivos } = montar();
    const dt = arrastre([TIPO_ARRASTRE_PAPEL], { [TIPO_ARRASTRE_PAPEL]: JSON.stringify(["g1", "g2"]) });
    fireEvent.dragOver(renglon("lote10"), { dataTransfer: dt });
    expect(renglon("lote10").className).toContain("outline-dashed");
    fireEvent.drop(renglon("lote10"), { dataTransfer: dt });
    expect(onMoverDocs).toHaveBeenCalledWith(["g1", "g2"], "lote10");
    expect(onSoltarArchivos).not.toHaveBeenCalled();
    expect(renglon("lote10").className).not.toContain("outline-dashed");
  });

  it("soltar archivos del disco sube a esa carpeta; arrastrar texto suelto no hace nada", () => {
    const { onMoverDocs, onSoltarArchivos } = montar();
    fireEvent.drop(renglon("anuladas"), { dataTransfer: arrastre(["Files"]) });
    expect(onSoltarArchivos).toHaveBeenCalledWith("anuladas", expect.anything());
    fireEvent.drop(renglon("anuladas"), { dataTransfer: arrastre(["text/plain"], { "text/plain": "hola" }) });
    expect(onMoverDocs).not.toHaveBeenCalled();
  });

  it("una carpeta cerrada se despliega sola si dejas el papel encima un rato", () => {
    vi.useFakeTimers();
    montar({ elegida: "gtf" });
    expect(fila("a2026").getAttribute("aria-expanded")).toBe("false");
    fireEvent.dragOver(renglon("a2026"), { dataTransfer: arrastre([TIPO_ARRASTRE_PAPEL]) });
    act(() => { vi.advanceTimersByTime(800); });
    expect(fila("a2026").getAttribute("aria-expanded")).toBe("true");
  });

  it("si la elegida cambia desde afuera, se despliega hasta ella", () => {
    const props = { raiz: RAIZ, carpetas: CARPETAS, docs: DOCS, onElegir: vi.fn() };
    const { rerender } = render(createElement(ArbolEsencial, { ...props, elegida: "gtf" }));
    expect(document.querySelector('[data-id="enero"]')).toBeNull();
    rerender(createElement(ArbolEsencial, { ...props, elegida: "enero" }));
    expect(fila("enero").getAttribute("aria-selected")).toBe("true");
  });
});

describe("CarpetaAmplia", () => {
  const montar = () => {
    const bulk = vi.fn(async () => 1);
    const vivos = DOCS;
    const arch = {
      folders: CARPETAS,
      documents: vivos,
      folderById: new Map(CARPETAS.map((f) => [f.id, f])),
      upload: vi.fn(async () => []),
      bulk,
      menuDe: () => null,
      abrirMenuEn: vi.fn(),
      setSharingFolder: vi.fn(),
      setExpediente: vi.fn(),
      setVinculando: vi.fn(),
      setWhatsappDoc: vi.fn(),
      zipAndDownload: vi.fn(async () => undefined),
    } as unknown as ModeloArchivo;
    const [e] = armarEsenciales({ carpetas: CARPETAS, docs: vivos, hoy: new Date("2026-10-23T12:00:00.000Z") });
    const abrir = vi.fn();
    render(createElement(CarpetaAmplia, {
      e: e as never, arch, uso: { g2: { vistas: 4, ultima: "2026-10-20T10:00:00.000Z" } }, ahora: Date.parse("2026-10-23T12:00:00.000Z"),
      dentroDe: "a2026", setDentroDe: vi.fn(), orden: "nombre", setOrden: vi.fn(), abrir,
      onVolver: vi.fn(), onAbrirEnArchivo: vi.fn(), onQuitar: vi.fn(),
      accionesExtra: createElement("button", { type: "button" }, "Leer los papeles"),
    }));
    return { bulk, abrir };
  };

  it("muestra los papeles de la rama con «Dónde», la cuenta y el hueco de acciones", () => {
    const { abrir } = montar();
    const tabla = screen.getByRole("table", { name: "Papeles" });
    const nombres = within(tabla).getAllByRole("row").slice(1).map((r) => r.getAttribute("data-id"));
    expect(nombres).toEqual(["g1", "g2", "g3"]);
    expect(within(tabla).getAllByText("Lote 2 › Enero").length).toBeGreaterThan(0);
    expect(document.querySelector('[data-qa="amplia-total"]')?.textContent).toBe("3 papeles");
    expect(screen.getByRole("button", { name: "Leer los papeles" })).toBeTruthy();
    expect(screen.getByText("Lo que más abres aquí")).toBeTruthy();
    fireEvent.click(within(tabla).getAllByRole("row")[2]);
    expect(abrir).toHaveBeenCalledWith(expect.objectContaining({ id: "g2" }), expect.arrayContaining([expect.objectContaining({ id: "g1" })]));
  });

  it("arrastrar un papel de la tabla al árbol lo mueve con un aviso", async () => {
    const { bulk } = montar();
    const dt = arrastre();
    const tr = document.querySelector('tr[data-id="g3"]') as HTMLElement;
    fireEvent.dragStart(tr, { dataTransfer: dt });
    expect(JSON.parse(dt.getData(TIPO_ARRASTRE_PAPEL))).toEqual(["g3"]);
    fireEvent.dragOver(renglon("lote2"), { dataTransfer: dt });
    await act(async () => { fireEvent.drop(renglon("lote2"), { dataTransfer: dt }); });
    expect(bulk).toHaveBeenCalledWith("move", ["g3"], { folderId: "lote2" });
    expect(toast.success).toHaveBeenCalledWith("1 papel movido a «Lote 2»");
  });

  it("elegir varios y «Mover a…» mueve sólo los que cambian; si falla, avisa", async () => {
    const { bulk } = montar();
    fireEvent.click(screen.getByRole("checkbox", { name: "Elegir g1.pdf" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Elegir g3.pdf" }));
    expect(screen.getByText("2 elegidos")).toBeTruthy();
    await act(async () => { fireEvent.change(screen.getByRole("combobox", { name: "Mover los elegidos a otra carpeta" }), { target: { value: "enero" } }); });
    expect(bulk).toHaveBeenCalledWith("move", ["g3"], { folderId: "enero" });
    expect(toast.success).toHaveBeenCalledWith("1 papel movido a «Enero»");

    bulk.mockRejectedValueOnce(new Error("No se pudo mover 1 documento(s): sin permiso"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Elegir g1.pdf" }));
    await act(async () => { fireEvent.change(screen.getByRole("combobox", { name: "Mover los elegidos a otra carpeta" }), { target: { value: "anuladas" } }); });
    expect(toast.error).toHaveBeenCalledWith("No se pudo mover 1 documento(s): sin permiso");
  });
});
