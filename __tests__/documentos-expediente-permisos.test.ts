// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";

/**
 * Revisión del 22-10: el PDF que junta papeles (expediente y «Combinar en un
 * PDF») nacía con `allowedRoles: []` y sacaba del candado lo que lo tenía.
 * Quien abre el combinado tiene que poder ver CADA papel de adentro.
 */

const db = vi.hoisted(() => ({
  carpetas: [] as { id: string; parentId: string | null; name: string; allowedRoles: string[] }[],
  docs: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/db/documents.db", () => ({
  DocumentsDB: {
    listFolders: vi.fn(async () => db.carpetas),
    list: vi.fn(async (_t: string, f: { folderId?: string; tags?: string[] }) =>
      db.docs.filter((d) => (f.folderId ? d.folderId === f.folderId : true) && (f.tags ? (d.tags as string[]).some((t) => f.tags?.includes(t)) : true)),
    ),
    // Como la base: deja pasar a los privilegiados (manager incluido) aunque haya candado.
    getById: vi.fn(async (_t: string, id: string) => db.docs.find((d) => d.id === id) ?? null),
    create: vi.fn(async (_t: string, input: Record<string, unknown>) => ({ id: "nuevo", ...input })),
    setStoragePath: vi.fn(async () => undefined),
    hardDelete: vi.fn(async () => undefined),
    log: vi.fn(async () => undefined),
  },
  CarpetaAjenaError: class extends Error {},
}));
vi.mock("@/lib/documents/storage", () => ({
  buildStoragePath: vi.fn(() => "t/nuevo/v1.pdf"),
  uploadToStorage: vi.fn(async () => ({ ok: true })),
  downloadFromStorage: vi.fn(async () => {
    const d = await PDFDocument.create();
    d.addPage([400, 600]);
    return Buffer.from(await d.save());
  }),
}));
vi.mock("@/lib/db/membrete.db", () => ({
  MembreteDB: { del: vi.fn(async () => ({ nombre: "Agroforestal Blas", logoUrl: null, telefono: null, direccion: null, ruc: null, pie: null })) },
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { DocumentsDB } from "@/lib/db/documents.db";
import { armarExpediente, planearExpediente } from "@/lib/documents/armar-expediente";
import { canRoleSeeEnCadena, ROL_CANDADO_DUENO, rolesDelCombinado } from "@/lib/documents/doc-access";
import { mergeDocuments } from "@/lib/documents/merge-documents";

const crear = vi.mocked(DocumentsDB.create);
const rolesCreados = () => (crear.mock.calls.at(-1)?.[1] as { allowedRoles?: string[] }).allowedRoles;

function papel(id: string, folderId: string | null, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: `Papel ${id}`,
    folderId,
    mimeType: "application/pdf",
    size: 1000,
    storagePath: `t/${id}.pdf`,
    allowedRoles: [],
    expiresAt: null,
    tags: [],
    customerId: null,
    supplierId: null,
    ...extra,
  };
}

beforeEach(() => {
  crear.mockClear();
  db.carpetas = [
    { id: "empresa", parentId: null, name: "Empresa", allowedRoles: [] },
    { id: "nomina", parentId: "empresa", name: "Nómina", allowedRoles: [ROL_CANDADO_DUENO] },
    { id: "abierta", parentId: null, name: "Abierta", allowedRoles: [] },
    { id: "almacen", parentId: "abierta", name: "Almacén", allowedRoles: ["almacenero"] },
  ];
  db.docs = [
    papel("ruc", "empresa"),
    papel("planilla", "nomina"),
    papel("libre", "abierta", { customerId: "cli-1" }),
    papel("kardex", "almacen", { customerId: "cli-1" }),
  ];
});

describe("rolesDelCombinado", () => {
  it("sin papeles restringidos queda abierto; con candado en uno, con candado", () => {
    expect(rolesDelCombinado([{ docAllowed: [] }, { cadena: [] }])).toEqual([]);
    expect(rolesDelCombinado([{ docAllowed: [] }, { cadena: [[ROL_CANDADO_DUENO]] }])).toEqual([ROL_CANDADO_DUENO]);
    expect(rolesDelCombinado([{ docAllowed: [ROL_CANDADO_DUENO, "cajero"] }])).toEqual([ROL_CANDADO_DUENO, "cajero"]);
  });

  it("los roles que están en todos los niveles; si no queda ninguno, candado", () => {
    expect(rolesDelCombinado([{ docAllowed: ["cajero", "almacenero"] }, { cadena: [["cajero"]] }, {}])).toEqual(["cajero"]);
    expect(rolesDelCombinado([{ docAllowed: ["cajero"] }, { cadena: [["almacenero"]] }])).toEqual([ROL_CANDADO_DUENO]);
  });

  it("nadie ve el combinado sin ver cada papel (todas las combinaciones chicas)", () => {
    const niveles: string[][] = [[], ["cajero"], ["almacenero"], ["cajero", "almacenero"], [ROL_CANDADO_DUENO], [ROL_CANDADO_DUENO, "cajero"]];
    const roles = ["superadmin", "admin", "owner", "tienda_owner", "manager", "cajero", "almacenero", "analista"];
    for (const a of niveles) {
      for (const b of niveles) {
        for (const c of niveles) {
          const papeles = [{ docAllowed: a, cadena: [] }, { docAllowed: [], cadena: b.length ? [b] : [] }, { docAllowed: c, cadena: b.length ? [b] : [] }];
          const combinado = rolesDelCombinado(papeles);
          for (const rol of roles) {
            if (!canRoleSeeEnCadena(rol, combinado, [])) continue;
            for (const p of papeles) expect(canRoleSeeEnCadena(rol, p.docAllowed, p.cadena), `${rol} ${JSON.stringify(papeles)}`).toBe(true);
          }
        }
      }
    }
  });
});

describe("expediente: el candado sigue puesto", () => {
  it("el encargado (manager) no ve la planilla en el plan; el dueño sí", async () => {
    const delManager = await planearExpediente("t1", { tipo: "carpeta", folderId: "empresa", incluirSubcarpetas: true }, "manager");
    const delDueno = await planearExpediente("t1", { tipo: "carpeta", folderId: "empresa", incluirSubcarpetas: true }, "owner");
    expect(delManager.ok && delManager.plan.papeles.map((p) => p.id)).toEqual(["ruc"]);
    expect(delDueno.ok && delDueno.plan.papeles.map((p) => p.id)).toEqual(["ruc", "planilla"]);
  });

  it("el PDF del dueño nace con candado si trae la planilla", async () => {
    const r = await armarExpediente("t1", { tipo: "carpeta", folderId: "empresa", incluirSubcarpetas: true }, { actorId: "dueno", viewerRole: "owner" });
    expect(r.ok).toBe(true);
    expect(rolesCreados()).toContain(ROL_CANDADO_DUENO);
  });

  it("una subcarpeta de almacenero bajo una raíz abierta: el cajero no ve el PDF", async () => {
    const r = await armarExpediente("t1", { tipo: "ids", ids: ["libre", "kardex"] }, { actorId: "dueno", viewerRole: "admin" });
    expect(r.ok).toBe(true);
    expect(rolesCreados()).toEqual(["almacenero"]);
    expect(canRoleSeeEnCadena("cajero", rolesCreados(), [])).toBe(false);
  });

  it("sólo papeles abiertos → PDF abierto", async () => {
    await armarExpediente("t1", { tipo: "ids", ids: ["ruc", "libre"] }, { actorId: "dueno", viewerRole: "admin" });
    expect(rolesCreados()).toEqual([]);
  });

  it("se liga a la ficha del cliente sólo si algún papel ya es de ese cliente", async () => {
    await armarExpediente("t1", { tipo: "ids", ids: ["libre", "kardex"] }, { customerId: "cli-1", actorId: "d", viewerRole: "admin" });
    expect((crear.mock.calls.at(-1)?.[1] as { customerId?: string }).customerId).toBe("cli-1");
    await armarExpediente("t1", { tipo: "ids", ids: ["libre", "kardex"] }, { customerId: "cli-de-otro", actorId: "d", viewerRole: "admin" });
    expect((crear.mock.calls.at(-1)?.[1] as { customerId?: string }).customerId).toBeUndefined();
  });
});

describe("Combinar en un PDF: el mismo candado", () => {
  it("el dueño combina la planilla y el PDF nace con candado", async () => {
    const r = await mergeDocuments("t1", ["ruc", "planilla"], { actorId: "dueno", viewerRole: "owner" });
    expect(r.ok).toBe(true);
    expect(rolesCreados()).toContain(ROL_CANDADO_DUENO);
  });

  it("el encargado no puede meter la planilla en un combinado", async () => {
    const r = await mergeDocuments("t1", ["ruc", "planilla"], { actorId: "enc", viewerRole: "manager" });
    expect(r).toEqual({ ok: false, error: "not_found", status: 404 });
    expect(crear).not.toHaveBeenCalled();
  });
});
