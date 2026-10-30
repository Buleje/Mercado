/**
 * Anotar la GRE (guía de remisión SUNAT) en la GTF de un despacho — revisión
 * del 30-10 sobre 8c324a38b. Lo que se prueba es lo que queda en la base:
 *
 * - Dos pestañas a la vez con números distintos: una anota, la otra recibe
 *   `ya_tiene` (compare-and-set sobre `updatedAt`, no «el último gana»).
 * - La misma GRE en OTRO despacho del negocio = `duplicado`; las líneas de la
 *   misma GTF la comparten; una línea sin GTF también cuenta (Prisma `not`
 *   deja afuera los NULL: el fake lo imita).
 * - Guardar el formulario de la guía con la casilla (25) vacía no borra la
 *   GRE ya anotada.
 * - Cada escritura invalida la caché del libro.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const T = "t-blas";

const H = vi.hoisted(() => {
  type Fila = {
    id: string;
    tenantId: string;
    section: string;
    status: string;
    lineNo: number;
    gtfNumber: string | null;
    gtfDatos: unknown;
    entryDate: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  };
  type Where = Record<string, unknown>;
  const estado = {
    filas: [] as Fila[],
    escrituras: 0,
    invalidados: [] as string[],
    audit: [] as { action: string; detail: string }[],
    /** Las primeras N lecturas por id esperan a que lleguen todas: así las dos pestañas leen lo mismo. */
    barrera: 0,
  };
  let enEspera: (() => void)[] = [];

  const cumple = (r: Record<string, unknown>, w: Where): boolean =>
    Object.entries(w).every(([k, v]) => {
      if (k === "AND") return (v as Where[]).every((x) => cumple(r, x));
      if (k === "OR") return (v as Where[]).some((x) => cumple(r, x));
      const x = r[k];
      if (v instanceof Date) return x instanceof Date && x.getTime() === v.getTime();
      if (v && typeof v === "object") {
        const o = v as { not?: unknown; path?: string[]; equals?: unknown };
        // SQL `<>`: el NULL no es «distinto de X».
        if ("not" in o) return x !== null && x !== undefined && x !== o.not;
        if (o.path) {
          let cur: unknown = x;
          for (const p of o.path) cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[p] : undefined;
          return cur === o.equals;
        }
      }
      return x === v;
    });

  const modelo = {
    findFirst: async ({ where }: { where: Where }) => {
      const f = estado.filas.find((r) => cumple(r, where));
      const copia = f ? structuredClone(f) : null;
      if (estado.barrera > 0 && !("AND" in where)) {
        estado.barrera--;
        await new Promise<void>((ok) => {
          enEspera.push(ok);
          if (estado.barrera === 0) {
            enEspera.forEach((s) => s());
            enEspera = [];
          }
        });
      }
      return copia;
    },
    updateMany: async ({ where, data }: { where: Where; data: Partial<Fila> }) => {
      const hits = estado.filas.filter((r) => cumple(r, where));
      for (const r of hits) {
        Object.assign(r, structuredClone(data));
        r.updatedAt = new Date(r.updatedAt.getTime() + 1000);
        estado.escrituras++;
      }
      return { count: hits.length };
    },
  };
  return { estado, modelo };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { forestCtpEntry: H.modelo, $transaction: (fn: (tx: unknown) => unknown) => fn({ forestCtpEntry: H.modelo }) },
}));
vi.mock("@/lib/cache", () => ({
  invalidateByPrefix: (p: string) => { H.estado.invalidados.push(p); },
  invalidate: () => {},
  getOrSet: () => null,
}));
vi.mock("@/lib/forestal/ctp-audit", () => ({
  auditCtp: (a: { action: string; detail: string }) => { H.estado.audit.push(a); },
  auditCtpEsperando: async () => {},
}));
vi.mock("@/lib/db/forest-ctp-ficha.db", () => ({ ForestCtpFichaDB: { getFresco: async () => ({}), get: async () => ({}) } }));
vi.mock("@/lib/db/platform-settings.db", () => ({ PlatformSettingsDB: { getFresco: async () => null, get: async () => null } }));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { closedPeriodOf: async () => null } }));

import { ForestCtpDespachoDB, conservarGuiaRemision } from "@/lib/db/forest-ctp-despacho.db";

const despacho = (id: string, lineNo: number, gtfNumber: string | null, gre = "", tenantId = T) => ({
  id,
  tenantId,
  section: "despacho",
  status: "registrado",
  lineNo,
  gtfNumber,
  gtfDatos: { guia: { autoridad: "ARFFS Ucayali", guiaRemisionNro: gre }, destinatario: { nombre: "Maderas SAC" } },
  entryDate: new Date("2026-10-28T00:00:00Z"),
  updatedAt: new Date("2026-10-28T15:00:00Z"),
  deletedAt: null,
});
const greDe = (id: string) =>
  ((H.estado.filas.find((f) => f.id === id)?.gtfDatos as { guia?: { guiaRemisionNro?: string } })?.guia?.guiaRemisionNro) ?? "";
const anotar = (id: string, numero: string, reemplazar = false) =>
  ForestCtpDespachoDB.anotarGuiaRemision(T, id, numero, { reemplazar, user: "blasadmin" });

beforeEach(() => {
  H.estado.filas = [despacho("d1", 1, "19-001-000064"), despacho("d2", 2, "19-001-000064"), despacho("d3", 3, "19-001-000065")];
  H.estado.escrituras = 0;
  H.estado.invalidados = [];
  H.estado.audit = [];
  H.estado.barrera = 0;
});

describe("anotarGuiaRemision — dos pestañas a la vez", () => {
  it("con números distintos, una anota y la otra recibe ya_tiene con el de la primera", async () => {
    H.estado.barrera = 2;
    const [a, b] = await Promise.all([anotar("d1", "EG07-12"), anotar("d1", "EG07-13")]);
    const ganadora = a.ok ? a : b;
    const perdedora = a.ok ? b : a;
    expect(ganadora).toEqual({ ok: true, cambio: true, guiaRemisionNro: expect.stringMatching(/^EG07-1[23]$/) });
    expect(perdedora).toEqual({ ok: false, reason: "ya_tiene", actual: greDe("d1") });
    expect(H.estado.escrituras).toBe(1);
    expect(H.estado.audit).toHaveLength(1);
  });
  it("anota sin pisar el resto del cuerpo e invalida la caché del libro", async () => {
    expect(await anotar("d1", "EG07-12")).toEqual({ ok: true, cambio: true, guiaRemisionNro: "EG07-12" });
    const cuerpo = H.estado.filas[0].gtfDatos as { guia: Record<string, string>; destinatario: { nombre: string } };
    expect(cuerpo.guia).toEqual({ autoridad: "ARFFS Ucayali", guiaRemisionNro: "EG07-12" });
    expect(cuerpo.destinatario.nombre).toBe("Maderas SAC");
    expect(H.estado.invalidados).toEqual([`forest-ctp:${T}`]);
  });
});

describe("anotarGuiaRemision — la misma GRE en otro despacho", () => {
  it("en el despacho de OTRA GTF = duplicado (también si allá quedó con ceros); con reemplazar pasa", async () => {
    H.estado.filas[2].gtfDatos = { guia: { guiaRemisionNro: "EG07-00000012" } };
    expect(await anotar("d1", "EG07-12")).toEqual({ ok: false, reason: "duplicado", otroDespachoId: "d3", otraLinea: 3, otraGtf: "19-001-000065" });
    expect(H.estado.escrituras).toBe(0);
    expect((await anotar("d1", "EG07-12", true)).ok).toBe(true);
  });
  it("otra línea de la MISMA GTF sí la comparte; una línea sin GTF cuenta como otra", async () => {
    H.estado.filas[1].gtfDatos = { guia: { guiaRemisionNro: "EG07-12" } };
    expect((await anotar("d1", "EG07-12")).ok).toBe(true);
    H.estado.filas.push({ ...despacho("d4", 4, null, "EG07-20") });
    expect(await anotar("d3", "EG07-20")).toMatchObject({ ok: false, reason: "duplicado", otroDespachoId: "d4" });
  });
  it("la de otro negocio no cuenta", async () => {
    H.estado.filas.push(despacho("x1", 1, "19-001-000099", "EG07-12", "t-otro"));
    expect((await anotar("d1", "EG07-12")).ok).toBe(true);
  });
});

describe("guardarGtfDatos — no borra la GRE anotada", () => {
  it("la casilla (25) vacía conserva la anotada; una nueva tipeada la cambia; invalida caché", async () => {
    H.estado.filas.push(despacho("b1", 5, null, "EG07-30"));
    const r = await ForestCtpDespachoDB.guardarGtfDatos(T, "b1", { guia: { autoridad: "ARFFS", guiaRemisionNro: "" } }, "blasadmin");
    expect(r).toEqual({ ok: true, datos: { guia: { autoridad: "ARFFS", guiaRemisionNro: "EG07-30" } } });
    expect(greDe("b1")).toBe("EG07-30");
    expect(H.estado.invalidados).toContain(`forest-ctp:${T}`);
    await ForestCtpDespachoDB.guardarGtfDatos(T, "b1", { guia: { guiaRemisionNro: "EG07-31" } }, "blasadmin");
    expect(greDe("b1")).toBe("EG07-31");
  });
  it("conservarGuiaRemision: sin nada anotado devuelve lo que llegó tal cual", () => {
    const datos = { guia: { guiaRemisionNro: "" } };
    expect(conservarGuiaRemision(datos, null)).toBe(datos);
    expect(conservarGuiaRemision(datos, { guia: {} })).toBe(datos);
  });
});
