/**
 * «Emitir GTF» (ADR-446, punto 7) mirado desde el lado que ESCRIBE.
 *
 * La función pura dice cuál es el siguiente; acá se prueba lo que queda en la
 * línea del libro: el número con la serie y los dígitos de la Ficha, que los
 * Anexos 04 del KV y los despachos anulados empujan el máximo, que un número
 * que ya lleva otro despacho vigente NO se escribe, y que un tenant no ve los
 * números de otro. Base simulada (patrón `vi.hoisted` + tx falsa).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const BLAS = "cmpxiv6p4000bohvzwl6bnfpv";
const OTRO = "tenant-otro-6-digitos";

const H = vi.hoisted(() => {
  type Despacho = {
    id: string;
    tenantId: string;
    section: string;
    status: string;
    lineNo: number;
    gtfNumber: string | null;
    deletedAt: Date | null;
    entryDate: Date;
    productType: string | null;
    speciesCommon: string | null;
  };
  const estado = {
    despachos: [] as Despacho[],
    fichas: {} as Record<string, { gtfSerie: string; gtfDigitos: number | null }>,
    kv: {} as Record<string, unknown>,
    updates: [] as { where: Record<string, unknown>; data: Record<string, unknown> }[],
    bloqueos: 0,
    audit: [] as { action: string; detail: string }[],
    /** Lo que «otra pestaña» commitea mientras esta tx espera el FOR UPDATE. */
    alBloquear: null as null | (() => void),
  };
  const deTenant = (where: { tenantId: string; section?: string; id?: string; deletedAt?: null }) =>
    estado.despachos.filter(
      (d) =>
        d.tenantId === where.tenantId &&
        (where.section === undefined || d.section === where.section) &&
        (where.id === undefined || d.id === where.id) &&
        (where.deletedAt === undefined || d.deletedAt === null),
    );
  const modelo = {
    findFirst: async ({ where }: { where: { tenantId: string; id: string; deletedAt?: null } }) => deTenant(where)[0] ?? null,
    findMany: async ({ where }: { where: { tenantId: string; section: string } }) =>
      deTenant(where).filter((d) => d.gtfNumber != null),
    updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      estado.updates.push(args);
      return { count: 1 };
    },
  };
  const tx = {
    forestCtpEntry: modelo,
    $queryRaw: async () => {
      estado.bloqueos++;
      estado.alBloquear?.();
      return [];
    },
  };
  return { estado, tx, modelo };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    forestCtpEntry: H.modelo,
    $transaction: (fn: (tx: unknown) => unknown) => fn(H.tx),
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {}, invalidate: () => {}, getOrSet: () => null }));
vi.mock("@/lib/forestal/ctp-audit", () => ({
  auditCtp: (a: { action: string; detail: string }) => { H.estado.audit.push(a); },
  auditCtpEsperando: async () => {},
}));
vi.mock("@/lib/db/forest-ctp-ficha.db", () => ({
  ForestCtpFichaDB: {
    getFresco: async (tenantId: string) => ({ ...(H.estado.fichas[tenantId] ?? { gtfSerie: "", gtfDigitos: null }) }),
    get: async (tenantId: string) => ({ ...(H.estado.fichas[tenantId] ?? { gtfSerie: "", gtfDigitos: null }) }),
  },
}));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    getFresco: async (key: string) => H.estado.kv[key] ?? null,
    get: async (key: string) => H.estado.kv[key] ?? null,
  },
}));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { closedPeriodOf: async () => null } }));

import { ForestCtpDespachoDB } from "@/lib/db/forest-ctp-despacho.db";

const despacho = (tenantId: string, id: string, lineNo: number, gtfNumber: string | null, status = "registrado") => ({
  id,
  tenantId,
  section: "despacho",
  status,
  lineNo,
  gtfNumber,
  deletedAt: null,
  entryDate: new Date("2026-09-28T00:00:00Z"),
  productType: "tabla",
  speciesCommon: "Tornillo",
});

/** Los números de guía de los Anexos 04 de Blas (KV `ctp-anexos:<id>`, 28-09). */
const ANEXOS_BLAS = ["064", "064", "063", "062", "060", "057", "058", "054", "056", "055"].map((n, i) => ({
  id: `anx-${i}`,
  numero: `2-19-04806${String(i).padStart(2, "0")}`,
  gtf: `19-001-0000${n}`,
  fecha: "2026-09-25",
  piezas: [],
}));

beforeEach(() => {
  H.estado.despachos = [
    // Las dos pruebas del 28-09, anuladas, con la serie mal cargada.
    despacho(BLAS, "b1", 1, "19-00000-000001", "anulado"),
    despacho(BLAS, "b4", 4, "19-00000-000002", "anulado"),
    despacho(BLAS, "b5", 5, null),
    // Otro tenant con la MISMA serie a 6 dígitos: no ve los anexos de Blas.
    despacho(OTRO, "o1", 1, "19-001-000010"),
    despacho(OTRO, "o2", 2, null),
  ];
  H.estado.fichas = {
    [BLAS]: { gtfSerie: "19-001", gtfDigitos: 7 },
    [OTRO]: { gtfSerie: "19-001", gtfDigitos: null },
  };
  H.estado.kv = { [`ctp-anexos:${BLAS}`]: ANEXOS_BLAS };
  H.estado.updates = [];
  H.estado.bloqueos = 0;
  H.estado.audit = [];
  H.estado.alBloquear = null;
});

describe("proximaGtf — proponer sin escribir", () => {
  it("Blas propone 19-001-0000065 (el 064 vive en un Anexo 04) y no escribe nada", async () => {
    const r = await ForestCtpDespachoDB.proximaGtf(BLAS);
    expect(r.ok && r.propuesta.gtf).toBe("19-001-0000065");
    expect(r.ok && r.propuesta.ultimo?.fuente).toBe("anexo");
    expect(H.estado.updates).toHaveLength(0);
  });

  it("otro tenant con la misma serie a 6 dígitos sigue a 6 y no ve a Blas", async () => {
    const r = await ForestCtpDespachoDB.proximaGtf(OTRO);
    expect(r.ok && r.propuesta.gtf).toBe("19-001-000011");
  });

  it("sin serie en la Ficha no inventa: serie_no_configurada", async () => {
    H.estado.fichas[BLAS] = { gtfSerie: "", gtfDigitos: 7 };
    expect(await ForestCtpDespachoDB.proximaGtf(BLAS)).toEqual({ ok: false, reason: "serie_no_configurada" });
  });
});

describe("emitirGtf — lo que queda escrito", () => {
  it("sin número confirmado escribe la propuesta, con el tenant en el WHERE y bajo lock", async () => {
    const r = await ForestCtpDespachoDB.emitirGtf(BLAS, "b5", "qa");
    expect(r).toMatchObject({ ok: true, gtf: "19-001-0000065", correlativo: 65, digitos: 7, yaEmitida: false });
    expect(H.estado.bloqueos).toBe(1);
    expect(H.estado.updates).toEqual([{ where: { id: "b5", tenantId: BLAS }, data: { gtfNumber: "19-001-0000065" } }]);
  });

  it("el número que el operador cambió se escribe en la forma de la Ficha", async () => {
    const r = await ForestCtpDespachoDB.emitirGtf(BLAS, "b5", "qa", "019-001-66");
    expect(r).toMatchObject({ ok: true, gtf: "19-001-0000066" });
    expect(H.estado.updates[0]?.data).toEqual({ gtfNumber: "19-001-0000066" });
    expect(H.estado.audit[0]?.detail).toContain("el sistema proponía 19-001-0000065");
  });

  it("un número que ya lleva otro despacho vigente se rechaza y no se escribe", async () => {
    H.estado.despachos.push(despacho(BLAS, "b6", 6, "019-001-0000065"));
    const r = await ForestCtpDespachoDB.emitirGtf(BLAS, "b5", "qa", "19-001-0000065");
    expect(r).toMatchObject({ ok: false, reason: "gtf_en_uso", gtf: "19-001-0000065", propuesta: "19-001-0000066" });
    expect(!r.ok && r.reason === "gtf_en_uso" && r.usadaPor.lineNo).toBe(6);
    expect(H.estado.updates).toHaveLength(0);
  });

  it("un anulado de la serie empuja el máximo (no se reusa)", async () => {
    H.estado.despachos.push(despacho(BLAS, "b7", 7, "19-001-0000070", "anulado"));
    const r = await ForestCtpDespachoDB.emitirGtf(BLAS, "b5", "qa");
    expect(r).toMatchObject({ ok: true, gtf: "19-001-0000071" });
  });

  it("un número de otra serie no se acepta (fuera_de_serie)", async () => {
    const r = await ForestCtpDespachoDB.emitirGtf(BLAS, "b5", "qa", "19-00000-000003");
    expect(r).toMatchObject({ ok: false, reason: "fuera_de_serie", serie: "19-001" });
    expect(H.estado.updates).toHaveLength(0);
  });

  it("la guía que ya tiene número de la serie no se re-numera", async () => {
    H.estado.despachos.find((d) => d.id === "b5")!.gtfNumber = "019-001-0000060";
    const r = await ForestCtpDespachoDB.emitirGtf(BLAS, "b5", "qa", "19-001-0000099");
    expect(r).toMatchObject({ ok: true, gtf: "019-001-0000060", correlativo: 60, yaEmitida: true });
    expect(H.estado.updates).toHaveLength(0);
  });

  it("otro tenant: emite 19-001-000011 a 6 dígitos, sin tocar los despachos de Blas", async () => {
    const r = await ForestCtpDespachoDB.emitirGtf(OTRO, "o2", "qa");
    expect(r).toMatchObject({ ok: true, gtf: "19-001-000011", digitos: 6 });
    expect(H.estado.updates).toEqual([{ where: { id: "o2", tenantId: OTRO }, data: { gtfNumber: "19-001-000011" } }]);
  });

  it("un despacho de otro tenant no se encuentra (no_despacho) y no se escribe", async () => {
    const r = await ForestCtpDespachoDB.emitirGtf(OTRO, "b5", "qa");
    expect(r).toEqual({ ok: false, reason: "no_despacho" });
    expect(H.estado.updates).toHaveLength(0);
  });
});

describe("revisión independiente (28-09): los tres casos que se escapaban", () => {
  it("una guía con dos productos: la línea B lleva el MISMO N° sólo si se confirma que es la misma guía", async () => {
    // Línea A (#6) ya salió con el 065; la B (#5) es el segundo producto del mismo camión.
    H.estado.despachos.push(despacho(BLAS, "b6", 6, "19-001-0000065"));

    const sinConfirmar = await ForestCtpDespachoDB.emitirGtf(BLAS, "b5", "qa", "19-001-0000065");
    expect(sinConfirmar).toMatchObject({ ok: false, reason: "gtf_en_uso" });
    // Confirmar contra una línea que NO lleva ese número no destraba nada.
    const otraLinea = await ForestCtpDespachoDB.emitirGtf(BLAS, "b5", "qa", "19-001-0000065", { mismaGuiaQue: "b1" });
    expect(otraLinea).toMatchObject({ ok: false, reason: "gtf_en_uso" });
    expect(H.estado.updates).toHaveLength(0);

    const confirmado = await ForestCtpDespachoDB.emitirGtf(BLAS, "b5", "qa", "019-001-65", { mismaGuiaQue: "b6" });
    expect(confirmado).toMatchObject({ ok: true, gtf: "19-001-0000065", yaEmitida: false });
    expect(H.estado.updates).toEqual([{ where: { id: "b5", tenantId: BLAS }, data: { gtfNumber: "19-001-0000065" } }]);
    expect(H.estado.audit[0]?.detail).toContain("misma guía que el despacho #6");
  });

  it("un tipeo que corre el talonario («650» con el 65 propuesto) pide confirmar el salto", async () => {
    const tipeo = await ForestCtpDespachoDB.emitirGtf(BLAS, "b5", "qa", "650");
    expect(tipeo).toEqual({ ok: false, reason: "salto_de_correlativo", gtf: "19-001-0000650", propuesta: "19-001-0000065", salto: 585 });
    expect(H.estado.updates).toHaveLength(0);

    const pegado = await ForestCtpDespachoDB.emitirGtf(BLAS, "b5", "qa", "1900165");
    expect(pegado).toMatchObject({ ok: false, reason: "salto_de_correlativo" });

    // En el tope (+20) no se pregunta; uno más, sí.
    expect(await ForestCtpDespachoDB.emitirGtf(BLAS, "b5", "qa", "86")).toMatchObject({ ok: false, reason: "salto_de_correlativo", salto: 21 });
    expect(H.estado.updates).toHaveLength(0);

    const confirmado = await ForestCtpDespachoDB.emitirGtf(BLAS, "b5", "qa", "650", { confirmarSalto: true });
    expect(confirmado).toMatchObject({ ok: true, gtf: "19-001-0000650" });
    expect(H.estado.audit[0]?.detail).toContain("salto de 585 confirmado");
  });

  it("en el tope del salto (+20) se emite sin preguntar", async () => {
    expect(await ForestCtpDespachoDB.emitirGtf(BLAS, "b5", "qa", "85")).toMatchObject({ ok: true, gtf: "19-001-0000085" });
  });

  it("otra pestaña le pone N° a esta línea mientras se espera el lock: se lee DESPUÉS y no se pisa", async () => {
    H.estado.alBloquear = () => {
      const b5 = H.estado.despachos.find((d) => d.id === "b5");
      if (b5) b5.gtfNumber = "19-001-0000065";
    };
    const r = await ForestCtpDespachoDB.emitirGtf(BLAS, "b5", "qa");
    expect(r).toMatchObject({ ok: true, gtf: "19-001-0000065", yaEmitida: true });
    expect(H.estado.updates).toHaveLength(0);
  });

  it("los anexos enlazados por el puente (`despachoIds[]`) se leen junto con `ctpEntryId`", async () => {
    H.estado.kv[`ctp-anexos:${BLAS}`] = [
      ...ANEXOS_BLAS,
      { id: "anx-p", numero: "2-19-0490000", gtf: "19-001-0000070", fecha: "2026-09-28", piezas: [], ctpEntryId: "b9", despachoIds: ["b9", "b10"] },
    ];
    const r = await ForestCtpDespachoDB.proximaGtf(BLAS);
    expect(r.ok && r.propuesta.gtf).toBe("19-001-0000071");
    expect(r.ok && r.propuesta.ultimo?.despachoIds).toEqual(["b9", "b10"]);
  });
});
