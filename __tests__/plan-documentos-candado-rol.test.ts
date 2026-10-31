/**
 * Papeles del permiso con candado (security 25-10, MEDIO 2): un archivo que el
 * rol no abre en el Drive tampoco se ve por nombre en la carpeta del plan ni en
 * «Papeles del permiso», pero cuenta: el papel está, «1 archivo con candado».
 *
 * Recorre la misma cadena que la ruta: `marcarLosQueNoVe` (lo que hace
 * `ForestPlanDocumentosDB.vista` con el rol de la sesión) → `armarCarpetas` →
 * `archivosDeVista` → `papelesDePlan`.
 */
import { describe, expect, it } from "vitest";
import { ROL_CANDADO_DUENO, type CarpetaConRoles } from "@/lib/documents/doc-access";
import { archivosDeVista, papelesDePlan, tagPapel } from "@/lib/forestal/loth-plan-papeles";
import { armarCarpetas, marcarLosQueNoVe, type DocumentoFila } from "@/lib/forestal/plan-documentos-semilla";
import { tagCarpetaPlan } from "@/lib/forestal/plan-documentos-tipos";

const HOY = "2026-10-25";
const PLAN = { planType: "PLANTACION", titularName: "COMUNIDAD NATIVA SAN LUIS", propietarioNombre: null, vigenciaHasta: null };

const doc = (id: string, folderId: string, tags: string[], allowedRoles: string[] = []): DocumentoFila & { allowedRoles: string[] } => ({
  id,
  name: `${id}.pdf`,
  mimeType: "application/pdf",
  size: 1000,
  expiresAt: null,
  uploadedAt: new Date("2026-10-20T15:00:00.000Z"),
  folderId,
  tags,
  allowedRoles,
});

/* «Resolución» sólo para admin y dueño; «Jefe» con el candado de dueños. */
const CARPETAS = new Map<string, CarpetaConRoles>([
  ["f-res", { parentId: null, allowedRoles: ["admin", "owner"] }],
  ["f-jefe", { parentId: null, allowedRoles: [ROL_CANDADO_DUENO] }],
]);
const DOCS = [
  doc("d-res", "f-res", [tagPapel("resolucion")]),
  doc("d-dni", "f-jefe", [tagPapel("representante")]),
];

function vistaComo(rol: string, docs = DOCS) {
  return armarCarpetas({
    planId: "plan-1",
    hoy: HOY,
    plantilla: [
      { id: "t-res", clave: "resolucion", nombre: "Resolución", soloParaRegistroId: null, orden: 1 },
      { id: "t-jefe", clave: "jefe", nombre: "Jefe", soloParaRegistroId: null, orden: 2 },
    ],
    camposArchivo: [],
    carpetasDrive: [
      { id: "f-res", name: "Resolución", tags: [tagCarpetaPlan("resolucion")] },
      { id: "f-jefe", name: "Jefe", tags: [tagCarpetaPlan("jefe")] },
      { id: "f-mano", name: "Copias", tags: [] },
    ],
    documentos: marcarLosQueNoVe(docs, rol, CARPETAS),
    subcarpetasPorCarpeta: new Map(),
  });
}

const papel = (rol: string, clave: string) =>
  papelesDePlan(PLAN, archivosDeVista({ carpetas: vistaComo(rol) }), HOY).lista.find((p) => p.clave === clave);

describe("archivo con candado en los papeles del plan", () => {
  it("el almacenero no ve el nombre ni el id de la resolución; el papel igual está", () => {
    const res = vistaComo("almacenero").find((c) => c.clave === "resolucion");
    expect(res?.sueltos).toEqual([]);
    expect(res?.sueltosConCandado).toHaveLength(1);
    expect(JSON.stringify(res)).not.toContain("d-res");

    const p = papel("almacenero", "resolucion");
    expect(p).toMatchObject({ estado: "presente", cuantos: 1, conCandado: 1 });
    expect(p?.archivo).toMatchObject({ documentId: null, nombre: null, conCandado: true });
  });

  it("el admin sí lo ve, con su nombre y sin candado", () => {
    const res = vistaComo("admin").find((c) => c.clave === "resolucion");
    expect(res?.sueltos.map((s) => s.documentId)).toEqual(["d-res"]);
    expect(res?.sueltosConCandado).toBeUndefined();
    const p = papel("admin", "resolucion");
    expect(p?.archivo).toMatchObject({ documentId: "d-res", nombre: "d-res.pdf" });
    expect(p?.conCandado).toBeUndefined();
  });

  it("el candado de dueños frena también al encargado; el dueño lo abre", () => {
    expect(papel("manager", "representante")?.archivo).toMatchObject({ documentId: null, nombre: null });
    expect(papel("manager", "resolucion")?.archivo?.documentId).toBe("d-res");
    expect(papel("owner", "representante")?.archivo?.documentId).toBe("d-dni");
  });

  it("con una copia que sí abre, «Ver» lleva a esa y la otra se cuenta como candado", () => {
    const docs = [...DOCS, doc("d-res-copia", "f-mano", [tagPapel("resolucion")])];
    const p = papelesDePlan(PLAN, archivosDeVista({ carpetas: vistaComo("almacenero", docs) }), HOY).lista.find((x) => x.clave === "resolucion");
    expect(p).toMatchObject({ estado: "presente", cuantos: 2, conCandado: 1 });
    expect(p?.archivo).toMatchObject({ documentId: "d-res-copia", nombre: "d-res-copia.pdf" });
  });
});
