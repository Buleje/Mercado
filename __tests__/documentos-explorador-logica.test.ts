import { describe, expect, it, vi } from "vitest";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { agrupar, enOrden, ordenarCarpetas, ordenarDocs, tipoDeArchivo, tramoDeFecha } from "@/components/admin/documentos/explorador/orden-agrupar";
import { apilar, etiquetaDeshacer, NoSePuedeDeshacer, revertir, type ApiDeshacer } from "@/components/admin/documentos/explorador/pila-deshacer";
import {
  descendientesDe, escribirCarga, filtrarQueSeMueven, leerCarga, MIME_DOC, MIME_EXPLORADOR, puedeSoltarEn, type ContextoSoltar,
} from "@/components/admin/documentos/explorador/destino-soltar";
import { avanzar, llegar, retroceder, type Historial } from "@/components/admin/documentos/explorador/use-historial-carpetas";
import { alternarEn, rango } from "@/components/admin/documentos/explorador/use-seleccion-explorador";
import { saltarA } from "@/components/admin/documentos/explorador/use-teclado-explorador";
import { seTocan } from "@/components/admin/documentos/explorador/use-rectangulo-seleccion";
import { contieneTexto, estadisticasDe, fechaLarga } from "@/components/admin/documentos/explorador/propiedades-explorador";
import { itemsDelFondoExplorador, type AccionesDelFondo } from "@/components/admin/documentos/explorador/menu-fondo";
import { itemsDeVarios } from "@/components/admin/documentos/explorador/menu-elemento";
import { itemsDeLugares, ramaDeCarpetas } from "@/components/admin/documentos/explorador/menu-lugares";
import type { ItemMenu } from "@/components/admin/documentos/explorador/item-menu";

const doc = (id: string, x: Partial<DbDocument> = {}): DbDocument => ({
  id, tenantId: "t", folderId: null, name: `${id}.pdf`, originalName: id, mimeType: "application/pdf", size: 10, storagePath: "",
  category: "", tags: [], favorite: false, status: "none", expiresAt: null, customerId: null, orderId: null, supplierId: null,
  ocrText: null, ocrMetadata: null, aiCategory: null, aiTags: [], allowedRoles: [], uploadedById: "u",
  uploadedAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z", deletedAt: null, ...x,
});
const carpeta = (id: string, x: Partial<DbDocumentFolder> = {}): DbDocumentFolder => ({
  id, tenantId: "t", parentId: null, name: id, color: null, icon: null, emoji: null, tags: [], allowedRoles: [],
  createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z", ...x,
});
const ids = (l: { id: string }[]) => l.map((x) => x.id);

describe("ordenar", () => {
  const docs = [
    doc("b", { name: "Boleta 2.pdf", size: 30, uploadedAt: "2026-10-03T00:00:00Z" }),
    doc("a", { name: "acta.xlsx", mimeType: "", size: 10, uploadedAt: "2026-10-01T00:00:00Z", expiresAt: "2026-12-01T00:00:00Z" }),
    doc("c", { name: "Boleta 10.pdf", size: 20, uploadedAt: "2026-10-02T00:00:00Z", expiresAt: "2026-11-01T00:00:00Z" }),
  ];
  it("nombre A→Z con números naturales y sin distinguir mayúsculas; invertido = Z→A", () => {
    expect(ids(ordenarDocs(docs, "name", false))).toEqual(["a", "b", "c"]);
    expect(ids(ordenarDocs(docs, "name", true))).toEqual(["c", "b", "a"]);
  });
  it("lo más reciente y lo más pesado primero por defecto", () => {
    expect(ids(ordenarDocs(docs, "recent", false))).toEqual(["b", "c", "a"]);
    expect(ids(ordenarDocs(docs, "size", false))).toEqual(["b", "c", "a"]);
    expect(ids(ordenarDocs(docs, "size", true))).toEqual(["a", "c", "b"]);
  });
  it("vence primero deja al final lo que no vence, en los dos sentidos", () => {
    expect(ids(ordenarDocs(docs, "expiry", false))).toEqual(["c", "a", "b"]);
    expect(ids(ordenarDocs(docs, "expiry", true))).toEqual(["a", "c", "b"]);
  });
  it("por tipo agrupa la familia y desempata por nombre", () => {
    expect(ids(ordenarDocs(docs, "type", false))).toEqual(["b", "c", "a"]); // «Documento PDF» antes que «Hoja de cálculo»
    expect(tipoDeArchivo(doc("w", { name: "carta.docx", mimeType: "" }))).toBe("Documento de Word");
  });
  it("más parecidos respeta el orden de la búsqueda", () => {
    expect(ids(ordenarDocs(docs, "relevancia", false))).toEqual(["b", "a", "c"]);
  });
  it("carpetas por nombre aunque el orden sea por vencimiento", () => {
    const cs = [carpeta("Zeta"), carpeta("alfa"), carpeta("Beta")];
    expect(ids(ordenarCarpetas(cs, "expiry", false))).toEqual(["alfa", "Beta", "Zeta"]);
    expect(ids(ordenarCarpetas(cs, "name", true))).toEqual(["Zeta", "Beta", "alfa"]);
  });
});

describe("agrupar", () => {
  // Domingo 18/10/2026 al mediodía: la semana empezó el lunes 12.
  const ahora = new Date(2026, 9, 18, 12);
  it("tramos de fecha como Windows", () => {
    const t = (d: Date) => tramoDeFecha(d.toISOString(), ahora).titulo;
    expect(t(new Date(2026, 9, 18, 8))).toBe("Hoy");
    expect(t(new Date(2026, 9, 17, 23))).toBe("Ayer");
    expect(t(new Date(2026, 9, 12, 1))).toBe("Esta semana");
    expect(t(new Date(2026, 9, 11, 23))).toBe("La semana pasada");
    expect(t(new Date(2026, 9, 2))).toBe("Este mes");
    expect(t(new Date(2026, 2, 2))).toBe("Este año");
    expect(t(new Date(2025, 11, 31))).toBe("Hace tiempo");
  });
  it("por tipo: carpetas arriba, después PDF, después hojas; sin grupos vacíos", () => {
    const g = agrupar([carpeta("f")], [doc("x", { name: "x.xlsx", mimeType: "" }), doc("y")], "tipo");
    expect(g.map((x) => x.titulo)).toEqual(["Carpetas", "Documento PDF", "Hoja de cálculo"]);
    expect(enOrden(g).map((e) => (e.tipo === "carpeta" ? e.carpeta.id : e.doc.id))).toEqual(["f", "y", "x"]);
  });
  it("por estado: «Sin estado» al final con la etiqueta del chip", () => {
    const g = agrupar([], [doc("a"), doc("b", { status: "approved" })], "estado", { etiquetaEstado: (s) => (s === "approved" ? "Aprobado" : s) });
    expect(g.map((x) => x.titulo)).toEqual(["Aprobado", "Sin estado"]);
  });
  it("ninguno = un solo grupo sin título", () => {
    const g = agrupar([carpeta("f")], [doc("a")], "ninguno");
    expect(g).toHaveLength(1);
    expect(g[0].titulo).toBe("");
  });
});

describe("deshacer", () => {
  const api = (): ApiDeshacer & { [k: string]: ReturnType<typeof vi.fn> } => ({
    moverDocs: vi.fn(async () => 1), moverCarpeta: vi.fn(async () => true), renombrarDoc: vi.fn(async () => true),
    renombrarCarpeta: vi.fn(async () => true), restaurar: vi.fn(async () => 1), carpetaVacia: vi.fn(() => true), borrarCarpeta: vi.fn(async () => true),
  });
  it("mover vuelve cada archivo a SU carpeta (un pedido por origen) y las carpetas a su padre", async () => {
    const a = api();
    await revertir({ tipo: "mover", nombreDestino: "X", docs: [{ id: "1", desde: "A" }, { id: "2", desde: null }, { id: "3", desde: "A" }], carpetas: [{ id: "c", desde: "P" }] }, a);
    expect(a.moverDocs).toHaveBeenCalledWith(["1", "3"], "A");
    expect(a.moverDocs).toHaveBeenCalledWith(["2"], null);
    expect(a.moverCarpeta).toHaveBeenCalledWith("c", "P");
  });
  it("renombrar pone el nombre de antes; eliminar saca de la papelera", async () => {
    const a = api();
    await revertir({ tipo: "renombrar", objeto: "carpeta", id: "c", antes: "Viejo", despues: "Nuevo" }, a);
    expect(a.renombrarCarpeta).toHaveBeenCalledWith("c", "Viejo");
    await revertir({ tipo: "eliminar", docs: ["1", "2"], nombre: "x" }, a);
    expect(a.restaurar).toHaveBeenCalledWith(["1", "2"]);
  });
  it("crear carpeta sólo se deshace si sigue vacía", async () => {
    const a = api();
    vi.mocked(a.carpetaVacia).mockReturnValue(false);
    await expect(revertir({ tipo: "crear-carpeta", id: "c", nombre: "Nueva" }, a)).rejects.toBeInstanceOf(NoSePuedeDeshacer);
    // Respuesta del servidor (archivos subidos después, fuera de la carpeta abierta): tampoco borra.
    vi.mocked(a.carpetaVacia).mockResolvedValue(false);
    await expect(revertir({ tipo: "crear-carpeta", id: "c", nombre: "Nueva" }, a)).rejects.toBeInstanceOf(NoSePuedeDeshacer);
    expect(a.borrarCarpeta).not.toHaveBeenCalled();
  });
  it("tope de 20 y etiqueta del menú", () => {
    let p: ReturnType<typeof apilar> = [];
    for (let i = 0; i < 25; i++) p = apilar(p, { tipo: "crear-carpeta", id: String(i), nombre: String(i) });
    expect(p).toHaveLength(20);
    expect(p[0]).toMatchObject({ id: "5" });
    expect(etiquetaDeshacer({ tipo: "mover", docs: [], carpetas: [], nombreDestino: "Facturas" })).toBe("Deshacer mover a «Facturas»");
    expect(etiquetaDeshacer(undefined)).toBeNull();
  });
});

describe("soltar", () => {
  // raiz → A → B → C ; D suelta. Archivo 1 en A.
  const padres: Record<string, string | null> = { A: null, B: "A", C: "B", D: null };
  const hijos = (p: string) => Object.entries(padres).filter(([, v]) => v === p).map(([id]) => ({ id }));
  const ctx: ContextoSoltar = {
    padreDeCarpeta: (id) => padres[id],
    carpetaDeDoc: (id) => (id === "1" ? "A" : null),
    descendientes: (id) => descendientesDe(id, hijos),
  };
  it("una carpeta no entra en sí misma ni en sus subcarpetas", () => {
    expect(puedeSoltarEn({ docs: [], carpetas: ["A"] }, "A", ctx).ok).toBe(false);
    expect(puedeSoltarEn({ docs: [], carpetas: ["A"] }, "C", ctx)).toEqual({ ok: false, motivo: "Una carpeta no puede ir dentro de una de sus subcarpetas" });
    expect(puedeSoltarEn({ docs: [], carpetas: ["C"] }, "D", ctx).ok).toBe(true);
  });
  it("si todo ya está ahí no hay nada que mover; lo que sí cambia se filtra", () => {
    expect(puedeSoltarEn({ docs: ["1"], carpetas: ["B"] }, "A", ctx)).toEqual({ ok: false, motivo: "Ya está en esa carpeta" });
    expect(filtrarQueSeMueven({ docs: ["1", "2"], carpetas: ["B", "D"] }, "A", ctx)).toEqual({ docs: ["2"], carpetas: ["D"] });
    expect(puedeSoltarEn({ docs: ["1"], carpetas: [] }, null, ctx).ok).toBe(true);
    expect(puedeSoltarEn(null, "A", ctx).ok).toBe(false);
  });
  it("la carga viaja en su tipo propio y cae al tipo viejo", () => {
    const datos = new Map<string, string>();
    const dt = { setData: (k: string, v: string) => datos.set(k, v), getData: (k: string) => datos.get(k) ?? "", effectAllowed: "" } as unknown as DataTransfer;
    escribirCarga(dt, { docs: ["1"], carpetas: [] });
    expect(datos.get(MIME_DOC)).toBe("1");
    expect(leerCarga(dt)).toEqual({ docs: ["1"], carpetas: [] });
    datos.set(MIME_EXPLORADOR, "{roto");
    expect(leerCarga(dt)).toEqual({ docs: ["1"], carpetas: [] });
    expect(leerCarga({ getData: () => "" })).toBeNull();
  });
});

describe("historial (Atrás / Adelante)", () => {
  it("ir, volver y avanzar como el Explorador; ir a otra borra lo de adelante", () => {
    let h: Historial = { atras: [], adelante: [], actual: null };
    h = llegar(llegar(h, "A"), "B");
    const r = retroceder(h);
    expect(r?.destino).toBe("A");
    const a = avanzar(r!.h);
    expect(a?.destino).toBe("B");
    const otra = llegar(r!.h, "C");
    expect(otra.adelante).toEqual([]);
    expect(avanzar(otra)).toBeNull();
    expect(retroceder({ atras: [], adelante: [], actual: null })).toBeNull();
    expect(llegar(h, "B")).toBe(h);
  });
});

describe("selección y teclado", () => {
  const orden = ["c:A", "c:B", "d:1", "d:2", "d:3"];
  it("Shift elige el tramo en los dos sentidos; Ctrl suma y saca", () => {
    expect(rango(orden, "c:B", "d:2")).toEqual(["c:B", "d:1", "d:2"]);
    expect(rango(orden, "d:2", "c:B")).toEqual(["c:B", "d:1", "d:2"]);
    expect([...alternarEn(new Set(["d:1"]), "d:2")]).toEqual(["d:1", "d:2"]);
    expect([...alternarEn(new Set(["d:1"]), "d:1")]).toEqual([]);
  });
  it("una letra salta al primero que empieza así; repetirla pasa al siguiente (sin tildes)", () => {
    const nombres = [{ clave: "a", nombre: "Árbol" }, { clave: "b", nombre: "acta" }, { clave: "c", nombre: "boleta" }];
    expect(saltarA(nombres, "a", null)).toBe("a");
    expect(saltarA(nombres, "a", "a")).toBe("b");
    expect(saltarA(nombres, "a", "b")).toBe("a");
    expect(saltarA(nombres, "bo", null)).toBe("c");
    expect(saltarA(nombres, "z", null)).toBeNull();
  });
  it("el rectángulo toca lo que se cruza, no lo que sólo roza el borde", () => {
    const caja = { left: 0, top: 0, width: 10, height: 10 };
    expect(seTocan(caja, { left: 5, top: 5, width: 10, height: 10 })).toBe(true);
    expect(seTocan(caja, { left: 10, top: 0, width: 5, height: 5 })).toBe(false);
  });
});

describe("propiedades", () => {
  const hijos = new Map<string | null, DbDocumentFolder[]>([[null, [carpeta("A"), carpeta("D")]], ["A", [carpeta("B", { parentId: "A" })]]]);
  const docs = [doc("1", { folderId: "A", size: 100 }), doc("2", { folderId: "B", size: 50 }), doc("3", { size: 7 })];
  it("cuenta todo lo que cuelga, a cualquier profundidad; la raíz es todo", () => {
    expect(estadisticasDe(["A"], docs, hijos, 3)).toEqual({ archivos: 2, carpetas: 1, bytes: 150 });
    expect(estadisticasDe([null], docs, hijos, 3)).toEqual({ archivos: 3, carpetas: 3, bytes: 157 });
    expect(estadisticasDe(["A", "B"], docs, hijos, 3)).toEqual({ archivos: 2, carpetas: 1, bytes: 150 });
  });
  it("fecha con el día y textos en singular/plural", () => {
    expect(fechaLarga(new Date(2026, 8, 10, 14, 32).toISOString())).toBe("jueves 10/09/2026 · 14:32");
    expect(fechaLarga(null)).toBe("—");
    expect(contieneTexto({ archivos: 0, carpetas: 0 })).toBe("Vacía");
    expect(contieneTexto({ archivos: 1, carpetas: 2 })).toBe("1 archivo y 2 carpetas");
  });
});

const idsDe = (items: readonly ItemMenu[]) => items.filter((i) => i.tipo !== "separador").map((i) => i.id);

describe("menús", () => {
  const fondo = (x: Partial<AccionesDelFondo> = {}): AccionesDelFondo => ({
    vista: "medianos", cambiarVista: vi.fn(), panelVisible: false, alternarPanel: vi.fn(), orden: "name", cambiarOrden: vi.fn(),
    invertido: false, fijarInvertido: vi.fn(), agruparPor: "ninguno", cambiarAgrupar: vi.fn(), hayBusqueda: false, enCarpetas: true,
    etiquetaDeshacer: null, deshacer: vi.fn(), hayCortado: false, pegar: vi.fn(), hayElementos: true, seleccionarTodo: vi.fn(),
    nuevaCarpeta: vi.fn(), nuevoTexto: vi.fn(), nuevaHoja: vi.fn(), subir: vi.fn(), actualizar: vi.fn(), propiedades: vi.fn(), ...x,
  });
  it("fondo en el orden de Windows; Pegar sólo con algo cortado; fuera de carpetas no hay Nuevo ni Subir", () => {
    expect(idsDe(itemsDelFondoExplorador(fondo()))).toEqual(["ver", "ordenar", "agrupar", "deshacer", "nuevo", "todo", "subir", "actualizar", "propiedades"]);
    expect(idsDe(itemsDelFondoExplorador(fondo({ hayCortado: true })))).toContain("pegar");
    const fuera = idsDe(itemsDelFondoExplorador(fondo({ enCarpetas: false, hayCortado: true })));
    expect(fuera).not.toContain("nuevo");
    expect(fuera).not.toContain("pegar");
    expect(fuera).not.toContain("subir");
  });
  it("Ver trae «Panel lateral» marcado según se vea; en Tarjetas no", () => {
    const ver = (x: Partial<AccionesDelFondo>) => itemsDelFondoExplorador(fondo(x)).find((i) => i.id === "ver");
    const sub = ver({ panelVisible: true });
    expect(sub && sub.tipo === "submenu" && sub.items.find((i) => i.id === "panel")).toMatchObject({ marcado: true });
    const tarjetas = ver({ panelVisible: null });
    expect(tarjetas && tarjetas.tipo === "submenu" && tarjetas.items.some((i) => i.id === "panel")).toBe(false);
  });
  it("varios elegidos: sin Copiar ni Cambiar nombre; con carpetas no hay ZIP ni WhatsApp", () => {
    const x = { cortar: vi.fn(), renombrar: vi.fn(), eliminar: vi.fn(), propiedades: vi.fn(), estados: [], lote: { zip: vi.fn(), whatsapp: vi.fn(), favoritos: vi.fn(), estado: vi.fn() } };
    const soloDocs = idsDe(itemsDeVarios({ docs: 3, carpetas: 0 }, x));
    expect(soloDocs).toEqual(["t", "cortar", "zip", "whatsapp", "favoritos", "estado", "eliminar", "propiedades"]);
    const mixto = idsDe(itemsDeVarios({ docs: 0, carpetas: 2 }, x));
    expect(mixto).toEqual(["t", "cortar", "eliminar", "propiedades"]);
  });
  it("Lugares: carpetas anidadas con «Abrir» primero, sin colgarse con un ciclo", () => {
    const hijos = new Map<string | null, DbDocumentFolder[]>([
      [null, [carpeta("Zeta"), carpeta("Alfa")]],
      ["Alfa", [carpeta("Beta", { parentId: "Alfa" })]],
      ["Beta", [carpeta("Alfa")]],
    ]);
    const rama = ramaDeCarpetas(null, { hijos, carpetaActiva: "Zeta", abrirCarpeta: vi.fn() });
    expect(rama.map((i) => i.id)).toEqual(["rama-Alfa", "abrir-Zeta"]);
    const alfa = rama[0];
    expect(alfa.tipo === "submenu" && idsDe(alfa.items)).toEqual(["abrir-Alfa", "abrir-Beta"]);
    expect(rama[1]).toMatchObject({ marcado: true });
    const todo = itemsDeLugares({
      vistas: [], vistaActiva: "all", irAVista: vi.fn(), fijados: [], abrirFijado: vi.fn(), hijos, carpetaActiva: null, abrirCarpeta: vi.fn(),
      inteligentes: [], inteligenteActiva: null, abrirInteligente: vi.fn(), nuevaInteligente: vi.fn(), etiquetas: vi.fn(),
    });
    expect(idsDe(todo)).toEqual(["vistas", "acceso", "carpetas", "inteligentes", "etiquetas"]);
  });
});
