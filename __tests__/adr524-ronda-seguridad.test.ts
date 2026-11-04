/**
 * Ronda de seguridad de ADR-524 (fichas, trámites, alquileres): candados de
 * papeles, datos personales por rol, vencimientos por rol y en el ICS, requisito
 * sin papel, alquiler terminado sin fin y roles del PATCH de una ficha.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  prisma: {
    document: { updateMany: vi.fn(async () => ({ count: 1 })) },
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), getOrSet: vi.fn() }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn() }));

import { CandadoDocumentosDB } from "@/lib/db/candado-documentos.db";
import { datosCambioRequisito } from "@/lib/db/tramites.db";
import { terminadoSinFin } from "@/lib/db/alquileres.db";
import { ROL_CANDADO_DUENO } from "@/lib/documents/doc-access";
import { ROLES_PAPEL_SENSIBLE, rutaSensible } from "@/lib/documentos/enlaces-entidad";
import { CAMPOS_PERSONALES, esFichaPersonal, parteParaRol, patchParaRol, type Parte, type PartePatch } from "@/lib/forestal/directorio";
import { ORIGENES_ADMINISTRACION, vencimientoEntraAlIcs, veVencimiento } from "@/lib/agenda/tipos";
import { alquilerCrearSchema, alquilerPatchSchema } from "@/app/api/admin/alquileres/esquemas";

describe("S4: carpetas y papeles con candado", () => {
  it("raíces sensibles con o sin tilde, mayúsculas y barras; el resto no", () => {
    for (const r of ["Trámites/Agrobanco 2026-10", "tramites", "  ALQUILERES / Drucila", "Socios y familia\\Brandon"]) {
      expect(rutaSensible(r), r).toBe(true);
    }
    for (const r of ["Libro TH/Trámites", "Trámites y Oficios (CTP)/SERFOR", "Guías forestales (GTF)", "", null, undefined]) {
      expect(rutaSensible(r), String(r)).toBe(false);
    }
  });
  it("el candado lleva el rol de dueños", () => {
    expect(ROLES_PAPEL_SENSIBLE).toContain(ROL_CANDADO_DUENO);
  });
});

describe("S4/R5/R6: CandadoDocumentosDB.atar", () => {
  beforeEach(() => h.prisma.document.updateMany.mockClear());
  it("tag sin repetir y candado solo a los que no tenían roles, siempre con tenantId", async () => {
    await CandadoDocumentosDB.atar("t1", ["d1", null, "d1", "d2"], "alquiler:a1");
    const [tag, candado] = h.prisma.document.updateMany.mock.calls.map((c) => (c as unknown as [{ where: Record<string, unknown>; data: Record<string, unknown> }])[0]);
    expect(tag?.where).toMatchObject({ tenantId: "t1", id: { in: ["d1", "d2"] }, deletedAt: null, NOT: { tags: { has: "alquiler:a1" } } });
    expect(candado?.where).toMatchObject({ tenantId: "t1", allowedRoles: { isEmpty: true } });
    expect(candado?.data).toEqual({ allowedRoles: [...ROLES_PAPEL_SENSIBLE] });
  });
  it("sin ids no toca la base; sin tenant revienta", async () => {
    expect(await CandadoDocumentosDB.atar("t1", [null, undefined], "x")).toEqual({ conTag: 0, conCandado: 0 });
    expect(h.prisma.document.updateMany).not.toHaveBeenCalled();
    await expect(CandadoDocumentosDB.atar("", ["d1"], null)).rejects.toThrow();
  });
  it("papeles de ficha de PERSONA sí; de una empresa de la madera no", () => {
    expect(esFichaPersonal(["socio"])).toBe(true);
    expect(esFichaPersonal(["proveedor", "arrendador"])).toBe(true);
    expect(esFichaPersonal(["proveedor", "transportista"])).toBe(false);
  });
});

describe("R7: requisito sin papel", () => {
  it("quitar el documento sin estado → falta; poner uno → hay; el estado explícito manda", () => {
    expect(datosCambioRequisito({ id: "r", documentId: null }).estado).toBe("falta");
    expect(datosCambioRequisito({ id: "r", documentId: "d" }).estado).toBe("hay");
    expect(datosCambioRequisito({ id: "r", documentId: null, estado: "no_aplica" }).estado).toBe("no_aplica");
    expect(datosCambioRequisito({ id: "r", nota: "x" }).estado).toBeUndefined();
  });
});

describe("R4: terminado exige fecha de fin", () => {
  const base = { nombre: "Local Agrobanco", rentaMensual: 1500, inicioEl: "2026-09-01" };
  it("schema de alta y de patch", () => {
    expect(alquilerCrearSchema.safeParse({ ...base, estado: "terminado" }).success).toBe(false);
    expect(alquilerCrearSchema.safeParse({ ...base, estado: "terminado", finEl: "2027-08-31" }).success).toBe(true);
    expect(alquilerPatchSchema.safeParse({ estado: "terminado", finEl: null }).success).toBe(false);
    expect(alquilerPatchSchema.safeParse({ estado: "vigente" }).success).toBe(true);
  });
  it("chequeo de la base con el estado ya fusionado", () => {
    expect(terminadoSinFin("terminado", null)).toBe(true);
    expect(terminadoSinFin("terminado", "2027-08-31")).toBe(false);
    expect(terminadoSinFin("vigente", null)).toBe(false);
  });
});

describe("S3/R1: datos personales por rol", () => {
  const parte = { id: "p1", nombre: "Drucila", dniVenceEl: "2030-01-01", estadoCivil: "casada", parentesco: "madre" } as unknown as Parte;
  it("almacenero los recibe vacíos; admin/owner/manager enteros", () => {
    const vacia = parteParaRol(parte, "almacenero") as unknown as Record<string, unknown>;
    for (const k of CAMPOS_PERSONALES) expect(vacia[k], k).toBeNull();
    expect(vacia.nombre).toBe("Drucila");
    for (const rol of ["admin", "owner", "manager"]) expect(parteParaRol(parte, rol)).toBe(parte);
  });
  it("el patch del almacenero descarta los datos personales sin 403", () => {
    const patch = { telefono: "917013738", estadoCivil: "casada", dniVenceEl: "2030-01-01" } as unknown as PartePatch;
    const r = patchParaRol(patch, "almacenero");
    expect(r.patch).toEqual({ telefono: "917013738" });
    expect(r.descartados.sort()).toEqual(["dniVenceEl", "estadoCivil"]);
    expect(patchParaRol(patch, "owner")).toEqual({ patch, descartados: [] });
  });
  it("PATCH /directorio/[id] deja pasar los mismos roles que el POST", () => {
    const roles = (archivo: string, metodo: string): string[] => {
      const src = readFileSync(join(process.cwd(), archivo), "utf8");
      const desde = src.slice(src.indexOf(`export const ${metodo}`));
      const m = /requireAdmin\(req, (\[[^\]]*\])\)/.exec(desde);
      return (JSON.parse((m?.[1] ?? "[]").replace(/'/g, '"')) as string[]).sort();
    };
    const post = roles("app/api/admin/forestal/directorio/route.ts", "POST");
    expect(post.length).toBeGreaterThan(0);
    expect(roles("app/api/admin/forestal/directorio/[id]/route.ts", "PATCH")).toEqual(post);
  });
});

describe("S1/S2: vencimientos de Administración", () => {
  it("el analista ve adelantos pero no trámites, alquileres ni DNI", () => {
    for (const o of ORIGENES_ADMINISTRACION) {
      expect(veVencimiento(o, "analista", true), o).toBe(false);
      expect(veVencimiento(o, "manager", false), o).toBe(true);
    }
    expect(veVencimiento("adelanto", "analista", true)).toBe(true);
    expect(veVencimiento("adelanto", "cajero", false)).toBe(false);
    expect(veVencimiento("recordatorio", "cajero", false)).toBe(true);
  });
  it("ICS: el DNI nunca; los otros 5 solo con feed de admin/owner activo", () => {
    expect(vencimientoEntraAlIcs("dni_vence", "owner")).toBe(false);
    expect(vencimientoEntraAlIcs("alquiler_pago", "owner")).toBe(true);
    expect(vencimientoEntraAlIcs("tramite_vence", "manager")).toBe(false);
    expect(vencimientoEntraAlIcs("tramite_vence", null)).toBe(false);
    expect(vencimientoEntraAlIcs("adelanto", null)).toBe(true);
  });
});
