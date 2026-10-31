// @vitest-environment node
/**
 * Archivo (22-10): las fotos de máquina (detector de cámaras y asistencia) salen
 * de las vistas generales y el aviso de vencimientos separa lo vencido de lo
 * que está por vencer. Cubre las piezas con lógica: etiquetas, ruta de la
 * carpeta, reparto de vencimientos y el conteo del servidor (con y sin rol).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TAG_FOTO_PERSONA } from "@/lib/camaras/personas-retencion";
import { TAG_FOTO_ASISTENCIA } from "@/lib/rrhh/asistencia-fotos";
import {
  TAGS_FOTOS_DE_MAQUINA,
  esFotoDeMaquina,
  etiquetaParaVerFotos,
} from "@/lib/documents/fotos-de-maquina";
import { repartirVencimientos } from "@/lib/documentos/vencimientos-aviso";

type Fila = { tenantId: string; deletedAt: Date | null; folderId: string | null; allowedRoles: string[]; size: number; tags: string[] };

const H = vi.hoisted(() => ({
  docs: [] as Fila[],
  carpetas: [] as { id: string; parentId: string | null; allowedRoles: string[] }[],
}));

const cumple = (f: Fila, where: Record<string, unknown>): boolean => {
  if (where.tenantId !== f.tenantId) return false;
  if (where.deletedAt === null && f.deletedAt !== null) return false;
  const t = where.tags as { has?: string; hasSome?: string[] } | undefined;
  if (t?.has && !f.tags.includes(t.has)) return false;
  if (t?.hasSome && !t.hasSome.some((x) => f.tags.includes(x))) return false;
  return true;
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => H.docs.filter((f) => cumple(f, where)),
      count: async ({ where }: { where: Record<string, unknown> }) => H.docs.filter((f) => cumple(f, where)).length,
      aggregate: async ({ where }: { where: Record<string, unknown> }) => {
        const filas = H.docs.filter((f) => cumple(f, where));
        return { _count: { _all: filas.length }, _sum: { size: filas.length ? filas.reduce((a, f) => a + f.size, 0) : null } };
      },
    },
    documentFolder: { findMany: async () => H.carpetas },
  },
}));

const { DocumentsDB } = await import("@/lib/db/documents.db");

const foto = (tag: string, extra: Partial<Fila> = {}): Fila => ({
  tenantId: "t-a", deletedAt: null, folderId: "f-cam", allowedRoles: [], size: 1000, tags: [tag], ...extra,
});

describe("etiquetas de las fotos de máquina", () => {
  it("salen de las constantes de cámaras y asistencia, sin repetir el texto", () => {
    expect(TAGS_FOTOS_DE_MAQUINA).toEqual([TAG_FOTO_PERSONA, TAG_FOTO_ASISTENCIA]);
  });

  it("un documento es foto de máquina con cualquiera de las dos etiquetas", () => {
    expect(esFotoDeMaquina({ tags: [TAG_FOTO_PERSONA] })).toBe(true);
    expect(esFotoDeMaquina({ tags: ["contrato", TAG_FOTO_ASISTENCIA] })).toBe(true);
    expect(esFotoDeMaquina({ tags: ["contrato"] })).toBe(false);
    expect(esFotoDeMaquina({ tags: null })).toBe(false);
  });
});

describe("etiquetaParaVerFotos", () => {
  it("con fotos del detector abre esas; la asistencia queda para cuando es lo único", () => {
    expect(etiquetaParaVerFotos({ [TAG_FOTO_PERSONA]: 8, [TAG_FOTO_ASISTENCIA]: 5 })?.tag).toBe(TAG_FOTO_PERSONA);
    expect(etiquetaParaVerFotos({ [TAG_FOTO_PERSONA]: 0, [TAG_FOTO_ASISTENCIA]: 5 })?.tag).toBe(TAG_FOTO_ASISTENCIA);
  });

  it("sin fotos no hay nada que abrir", () => {
    expect(etiquetaParaVerFotos({})).toBeNull();
    expect(etiquetaParaVerFotos({ [TAG_FOTO_PERSONA]: 0 })).toBeNull();
  });

  it("el texto del aviso habla de fotos, no de etiquetas", () => {
    expect(etiquetaParaVerFotos({ [TAG_FOTO_PERSONA]: 1 })?.label).toBe("fotos de las cámaras");
  });
});

describe("repartirVencimientos", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T15:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  const doc = (id: string, dias: number | null, extra: { deletedAt?: string | null } = {}) => ({
    id,
    expiresAt: dias === null ? null : new Date(Date.parse("2026-10-22T15:00:00Z") + dias * 86_400_000).toISOString(),
    ...extra,
  });

  it("lo vencido va aparte de lo que vence en 30 días; «vence hoy» es por vencer", () => {
    const { vencidos, porVencer } = repartirVencimientos([
      doc("hace-10", -10), doc("ayer", -1), doc("hoy", 0), doc("en-5", 5), doc("en-30", 30), doc("en-31", 31), doc("sin", null),
    ]);
    expect(vencidos.map((x) => x.d.id)).toEqual(["hace-10", "ayer"]);
    expect(porVencer.map((x) => x.d.id)).toEqual(["hoy", "en-5", "en-30"]);
    expect(vencidos[0].n).toBe(-10);
  });

  it("no cuenta lo que está en la papelera", () => {
    const r = repartirVencimientos([doc("tirado", -3, { deletedAt: "2026-10-01T00:00:00Z" }), doc("vivo", 3)]);
    expect(r.vencidos).toEqual([]);
    expect(r.porVencer.map((x) => x.d.id)).toEqual(["vivo"]);
  });
});

describe("DocumentsDB.contarPorTags", () => {
  beforeEach(() => {
    H.carpetas = [
      { id: "f-cam", parentId: null, allowedRoles: ["admin"] }, // Cámaras: sólo admin
      { id: "f-libre", parentId: null, allowedRoles: [] },
    ];
    H.docs = [
      foto(TAG_FOTO_PERSONA, { size: 4000 }),
      foto(TAG_FOTO_PERSONA, { size: 6000 }),
      foto(TAG_FOTO_ASISTENCIA, { size: 500 }),
      foto(TAG_FOTO_PERSONA, { deletedAt: new Date(), size: 99999 }), // papelera: no cuenta
      foto(TAG_FOTO_PERSONA, { tenantId: "t-b", size: 99999 }), // otro negocio: no cuenta
      foto("contrato", { folderId: "f-libre" }), // no es foto de máquina
      foto(TAG_FOTO_ASISTENCIA, { folderId: "f-libre", size: 250 }), // asistencia en carpeta abierta
    ];
  });

  it("el dueño ve el total, el peso y el reparto por etiqueta", async () => {
    const c = await DocumentsDB.contarPorTags("t-a", [...TAGS_FOTOS_DE_MAQUINA], "admin");
    expect(c).toEqual({ total: 4, bytes: 4000 + 6000 + 500 + 250, porTag: { [TAG_FOTO_PERSONA]: 2, [TAG_FOTO_ASISTENCIA]: 2 } });
  });

  it("un rol sin acceso a la carpeta sólo cuenta lo que puede abrir", async () => {
    const c = await DocumentsDB.contarPorTags("t-a", [...TAGS_FOTOS_DE_MAQUINA], "cajero");
    expect(c).toEqual({ total: 1, bytes: 250, porTag: { [TAG_FOTO_PERSONA]: 0, [TAG_FOTO_ASISTENCIA]: 1 } });
  });

  it("sin etiquetas pedidas devuelve ceros y no consulta", async () => {
    expect(await DocumentsDB.contarPorTags("t-a", [" ", ""], "admin")).toEqual({ total: 0, bytes: 0, porTag: {} });
  });

  it("sin fotos, el peso es 0 y no null", async () => {
    H.docs = [];
    const c = await DocumentsDB.contarPorTags("t-a", [TAG_FOTO_PERSONA], "admin");
    expect(c).toEqual({ total: 0, bytes: 0, porTag: { [TAG_FOTO_PERSONA]: 0 } });
  });
});
