/**
 * ADR-504 paso 2 — la plata de una guía es la de SU guía (N° + permiso).
 *
 * Dos guías GTF N° 4 de permisos distintos (P1 y P2) son dos guías: el abono
 * de una no suma la madera de la otra (pago cruzado), la cubicación de una no
 * frena a la otra (freno falso), una guía 4 SIN permiso frena a las dos (doble
 * pago), el N° pelado con dos permisos es ambiguo (409) y `moverPlataAlPermiso`
 * sólo cambia el permiso, nunca un monto.
 *
 * Por la DB class real contra una base en memoria: lo que importa es qué se
 * LEE y qué se ESCRIBE, no la función pura.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn(), auditCtpEsperando: vi.fn(async () => {}) }));

import { ForestCuentaDB } from "@/lib/db/forest-cuenta.db";
import {
  GuiaSinPermisoFrenaError,
  PlataEnOtroPermisoError,
  cubicacionQuePagoLaGuia,
  filtroPermisoDePlata,
  pedidoDePlata,
  refDePlata,
  resolverPlataDeGuia,
  respuestaGuiaPorPermiso,
} from "@/lib/db/guia-cubicacion.db";
import { GuiaAmbiguaError, SIN_PERMISO } from "@/lib/forestal/identidad-guia";
import { contratoDeGuia, estadoDePagoDeGuias } from "@/lib/forestal/plata-de-guia";

// ── Base en memoria: lo justo de Prisma que usan estas funciones ─────────────

type Fila = Record<string, unknown> & { id: string };
type Where = Record<string, unknown>;

function cumple(row: Fila, where: Where | undefined): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (k === "OR") {
      if (!(v as Where[]).some((w) => cumple(row, w))) return false;
      continue;
    }
    if (k === "NOT") {
      const lista = Array.isArray(v) ? (v as Where[]) : [v as Where];
      if (lista.some((w) => cumple(row, w))) return false;
      continue;
    }
    const val = row[k];
    if (v === null) {
      if (val != null) return false;
      continue;
    }
    if (typeof v === "object" && v !== null && !(v instanceof Date)) {
      const o = v as Record<string, unknown>;
      if ("in" in o && !(o.in as unknown[]).includes(val)) return false;
      if ("notIn" in o && (o.notIn as unknown[]).includes(val)) return false;
      if ("not" in o && (o.not === null ? val == null : val === o.not)) return false;
      if ("endsWith" in o && (val == null || !String(val).toLowerCase().endsWith(String(o.endsWith).toLowerCase()))) return false;
      continue;
    }
    if (val !== v) return false;
  }
  return true;
}

function tabla(filas: Fila[], extra?: (f: Fila) => Record<string, unknown>) {
  const ver = (f: Fila) => ({ ...f, ...(extra ? extra(f) : {}) });
  return {
    filas,
    findMany: vi.fn(async (a: { where?: Where } = {}) => filas.filter((f) => cumple(f, a.where)).map(ver)),
    findFirst: vi.fn(async (a: { where?: Where } = {}) => {
      const f = filas.find((x) => cumple(x, a.where));
      return f ? ver(f) : null;
    }),
    aggregate: vi.fn(async (a: { where?: Where; _sum: Record<string, true> }) => {
      const [campo] = Object.keys(a._sum);
      return { _sum: { [campo]: filas.filter((f) => cumple(f, a.where)).reduce((s, f) => s + Number(f[campo] ?? 0), 0) } };
    }),
    count: vi.fn(async (a: { where?: Where } = {}) => filas.filter((f) => cumple(f, a.where)).length),
    update: vi.fn(async (a: { where: { id: string }; data: Record<string, unknown> }) => {
      const f = filas.find((x) => x.id === a.where.id)!;
      Object.assign(f, a.data);
      return ver(f);
    }),
    updateMany: vi.fn(async (a: { where?: Where; data: Record<string, unknown> }) => {
      const tocadas = filas.filter((f) => cumple(f, a.where));
      for (const f of tocadas) Object.assign(f, a.data);
      return { count: tocadas.length };
    }),
    create: vi.fn(async (a: { data: Record<string, unknown> }) => {
      const f = { id: `nuevo-${filas.length + 1}`, deletedAt: null, ...a.data } as Fila;
      filas.push(f);
      return ver(f);
    }),
  };
}

const T = "tenant-qa";
const N4 = "019-001-0000004";
const CONTRATOS: Record<string, { codigo: string; titularNombre: string }> = {
  P1: { codigo: "PERMISO-UNO", titularNombre: "Titular Uno" },
  P2: { codigo: "PERMISO-DOS", titularNombre: "Titular Dos" },
};

function base(datos: {
  ingresos?: Fila[];
  movs?: Fila[];
  cubicaciones?: Fila[];
  fletes?: Fila[];
  gastos?: Fila[];
}) {
  const woodEntry = tabla(
    (datos.ingresos ?? []).map((f) => ({ tenantId: T, deletedAt: null, status: "registrado", moneda: "PEN", maderaDeTercero: false, providerName: null, ...f })),
    (f) => ({ contrato: f.contratoId ? (CONTRATOS[f.contratoId as string] ?? null) : null }),
  );
  const forestCuentaMov = tabla((datos.movs ?? []).map((f) => ({ tenantId: T, deletedAt: null, ...f })));
  const forestCubicacionTrozas = tabla((datos.cubicaciones ?? []).map((f) => ({ tenantId: T, deletedAt: null, sentido: "compra", ...f })));
  const forestFlete = tabla((datos.fletes ?? []).map((f) => ({ tenantId: T, deletedAt: null, tipo: "ingreso", ...f })));
  const expense = tabla((datos.gastos ?? []).map((f) => ({ tenantId: T, ...f })));
  const forestContrato = tabla(Object.keys(CONTRATOS).map((id) => ({ id, tenantId: T, deletedAt: null })));
  const candados: string[] = [];
  const tx = {
    woodEntry,
    forestCuentaMov,
    forestCubicacionTrozas,
    forestFlete,
    expense,
    forestContrato,
    $executeRaw: vi.fn(async (_s: TemplateStringsArray, ...valores: unknown[]) => {
      candados.push(String(valores[0]));
      return 1;
    }),
  };
  return { tx, candados };
}

type TxFalso = ReturnType<typeof base>["tx"];
const comoTx = (tx: TxFalso) => tx as unknown as Parameters<typeof ForestCuentaDB.resincronizarMaderaDeGuiaEnTx>[0];

const ingreso = (id: string, contratoId: string | null, costoTotal: number | null) => ({ id, gtfNumber: N4, contratoId, costoTotal });

beforeEach(() => vi.clearAllMocks());

describe("(a) pago cruzado — el abono de la guía 4 de P1 no suma la madera de la 4 de P2", () => {
  const datos = () => ({
    ingresos: [ingreso("we-p1", "P1", 1000), ingreso("we-p2", "P2", 700)],
    movs: [{ id: "abono-p1", gtfNumber: N4, contratoId: "P1", tipo: "abono", concepto: "madera", monto: 500, parteId: "parte-1" }],
  });

  it("con la ref de P1: el abono vale 1000 (sus asientos), no 1700", async () => {
    const { tx } = base(datos());
    const r = await ForestCuentaDB.resincronizarMaderaDeGuiaEnTx(comoTx(tx), T, { gtfNumber: N4, contratoId: "P1" });
    expect(r).toBe("actualizada");
    expect(Number(tx.forestCuentaMov.filas[0].monto)).toBe(1000);
  });

  it("llamada vieja por N° (sin permiso): igual cuenta sólo los asientos del permiso del abono", async () => {
    const { tx } = base(datos());
    await ForestCuentaDB.resincronizarMaderaDeGuiaEnTx(comoTx(tx), T, N4);
    expect(Number(tx.forestCuentaMov.filas[0].monto)).toBe(1000);
  });

  it("los pagos imputados a la 4 de P2 no cuentan como pagos de la 4 de P1", async () => {
    const { tx } = base({
      movs: [
        { id: "pago-p1", gtfNumber: N4, contratoId: "P1", tipo: "cargo", concepto: "pago", monto: 300, parteId: "parte-1" },
        { id: "pago-p2", gtfNumber: N4, contratoId: "P2", tipo: "cargo", concepto: "pago", monto: 900, parteId: "parte-1" },
      ],
    });
    expect(await ForestCuentaDB.pagosImputadosEnTx(comoTx(tx), T, { gtfNumber: N4, contratoId: "P1" })).toBe(300);
    expect(await ForestCuentaDB.pagosImputadosEnTx(comoTx(tx), T, N4)).toBe(1200); // la llamada vieja: como siempre
  });

  it("el N° en un solo permiso se lee y escribe por N°, como siempre (sin filtro)", async () => {
    const { tx } = base({ ingresos: [ingreso("we-p1", "P1", 1000)] });
    const plata = await resolverPlataDeGuia(comoTx(tx), T, { gtfNumber: N4, contratoId: "P1" }, "escribir");
    expect(plata.unica).toBe(true);
    expect(refDePlata(plata)).toBe(N4);
  });
});

describe("(b) freno falso — una cubicación de P1 no frena la guía 4 de P2", () => {
  const datos = () => ({
    ingresos: [ingreso("we-p1", "P1", null), ingreso("we-p2", "P2", null)],
    cubicaciones: [{ id: "cub-1", codigo: "CUB-0001", gtfNumber: N4, contratoId: "P1", estado: "aplicada" }],
  });

  it("P2 libre, P1 frenada", async () => {
    const { tx } = base(datos());
    const p2 = await resolverPlataDeGuia(comoTx(tx), T, { gtfNumber: N4, contratoId: "P2" }, "escribir");
    expect(p2.unica).toBe(false);
    expect(await cubicacionQuePagoLaGuia(comoTx(tx), T, refDePlata(p2))).toBeNull();
    const p1 = await resolverPlataDeGuia(comoTx(tx), T, { gtfNumber: N4, contratoId: "P1" }, "escribir");
    expect(await cubicacionQuePagoLaGuia(comoTx(tx), T, refDePlata(p1))).toEqual({ codigo: "CUB-0001" });
  });

  it("una cubicación SIN permiso frena a las dos (no se sabe de cuál es)", async () => {
    const { tx } = base({ ...datos(), cubicaciones: [{ id: "cub-2", codigo: "CUB-0002", gtfNumber: N4, contratoId: null, estado: "aplicada" }] });
    expect(await cubicacionQuePagoLaGuia(comoTx(tx), T, { gtfNumber: N4, contratoId: "P1" })).toEqual({ codigo: "CUB-0002" });
    expect(await cubicacionQuePagoLaGuia(comoTx(tx), T, { gtfNumber: N4, contratoId: "P2" })).toEqual({ codigo: "CUB-0002" });
  });

  it("la llamada vieja por N° frena con cualquier permiso (como siempre)", async () => {
    const { tx } = base(datos());
    expect(await cubicacionQuePagoLaGuia(comoTx(tx), T, N4)).toEqual({ codigo: "CUB-0001" });
  });
});

describe("(c) doble pago — una guía 4 SIN permiso frena a las de P1 y P2", () => {
  const datos = () => ({ ingresos: [ingreso("we-p1", "P1", null), ingreso("we-p2", "P2", null), ingreso("we-sin", null, null)] });

  it.each(["P1", "P2"])("escribir en la 4 de %s → GuiaSinPermisoFrenaError (409)", async (permiso) => {
    const { tx } = base(datos());
    const err = await resolverPlataDeGuia(comoTx(tx), T, { gtfNumber: N4, contratoId: permiso }, "escribir").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GuiaSinPermisoFrenaError);
    expect(respuestaGuiaPorPermiso(err)).toMatchObject({ status: 409, body: { error: "GUIA_SIN_PERMISO_FRENA" } });
  });

  it("el 409 trae la guía que frena: su N° y sus ingresos (para «Asignar permiso»)", async () => {
    const { tx } = base({ ingresos: [...datos().ingresos, ingreso("we-sin-2", null, null)] });
    const err = await resolverPlataDeGuia(comoTx(tx), T, { gtfNumber: N4, contratoId: "P1" }, "escribir").catch((e: unknown) => e);
    const r = respuestaGuiaPorPermiso(err);
    expect(r?.body).toMatchObject({ error: "GUIA_SIN_PERMISO_FRENA", gtfNumber: N4, woodEntryIds: ["we-sin", "we-sin-2"] });
    expect(r?.body.guias).toEqual([{ gtfNumber: N4, woodEntryIds: ["we-sin", "we-sin-2"], titular: null }]);
    expect(r?.body.woodEntryIds).not.toContain("we-p1");
  });

  it("leer no falla: devuelve quién la frena (la pantalla lo muestra)", async () => {
    const { tx } = base(datos());
    const p = await resolverPlataDeGuia(comoTx(tx), T, { gtfNumber: N4, contratoId: "P1" }, "leer");
    expect(p.frenadaPor?.map((g) => g.contratoId)).toEqual([null]);
    expect(p.unica).toBe(false);
  });
});

describe("ambigua — el N° pelado con dos permisos → 409 GUIA_AMBIGUA con las candidatas", () => {
  it("sin contratoId", async () => {
    const { tx } = base({ ingresos: [ingreso("we-p1", "P1", null), ingreso("we-p2", "P2", null)] });
    const err = await resolverPlataDeGuia(comoTx(tx), T, { gtfNumber: N4, contratoId: null }, "leer").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GuiaAmbiguaError);
    const r = respuestaGuiaPorPermiso(err);
    expect(r?.status).toBe(409);
    expect(r?.body.error).toBe("GUIA_AMBIGUA");
    expect((r?.body.candidatas as { permiso: string }[]).map((c) => c.permiso).sort()).toEqual(["PERMISO-DOS", "PERMISO-UNO"]);
  });

  it("con contratoId elegido ya no es ambigua", async () => {
    const { tx } = base({ ingresos: [ingreso("we-p1", "P1", null), ingreso("we-p2", "P2", null)] });
    await expect(resolverPlataDeGuia(comoTx(tx), T, { gtfNumber: N4, contratoId: "P2" }, "leer")).resolves.toMatchObject({ contratoId: "P2" });
  });
});

describe("«∅» = la guía SIN permiso elegida a propósito (ventana «¿De qué permiso?»)", () => {
  it("el Zod de las rutas acepta «∅», un id o nada; no un texto largo", () => {
    expect(contratoDeGuia.safeParse(SIN_PERMISO)).toMatchObject({ success: true, data: SIN_PERMISO });
    expect(contratoDeGuia.safeParse(" P1 ")).toMatchObject({ success: true, data: "P1" });
    expect(contratoDeGuia.safeParse(null).success).toBe(true);
    expect(contratoDeGuia.safeParse(undefined).success).toBe(true);
    expect(contratoDeGuia.safeParse("x".repeat(41)).success).toBe(false);
  });

  it("con P1, P2 y la sin permiso: «∅» es la sin permiso — no ambigua, no frenada, y nunca un id literal", async () => {
    const { tx } = base({ ingresos: [ingreso("we-p1", "P1", null), ingreso("we-p2", "P2", null), ingreso("we-sin", null, null)] });
    const p = await resolverPlataDeGuia(comoTx(tx), T, { gtfNumber: N4, contratoId: SIN_PERMISO }, "escribir");
    expect(p).toEqual({ gtfNumber: N4, contratoId: null, unica: false, frenadaPor: null });
    expect(refDePlata(p)).toEqual({ gtfNumber: N4, contratoId: null });
    expect(filtroPermisoDePlata(p)).toEqual({ contratoId: null });
    /* Releer después de escribir pide la MISMA guía (null sería «elige» → 409). */
    expect(pedidoDePlata(p)).toBe(SIN_PERMISO);
    await expect(resolverPlataDeGuia(comoTx(tx), T, { gtfNumber: N4, contratoId: pedidoDePlata(p) }, "leer")).resolves.toMatchObject({ contratoId: null });
  });

  it("la sin permiso sigue frenada por una cubicación de cualquier permiso con ese N° (doble pago)", async () => {
    const { tx } = base({
      ingresos: [ingreso("we-p1", "P1", null), ingreso("we-sin", null, null)],
      cubicaciones: [{ id: "cub-1", codigo: "CUB-0001", gtfNumber: N4, contratoId: "P1", estado: "aplicada" }],
    });
    const p = await resolverPlataDeGuia(comoTx(tx), T, { gtfNumber: N4, contratoId: SIN_PERMISO }, "escribir");
    expect(await cubicacionQuePagoLaGuia(comoTx(tx), T, refDePlata(p))).toEqual({ codigo: "CUB-0001" });
  });

  it("si ya no hay guía sin permiso con ese N° → 409 GUIA_AMBIGUA con las que hay (la ventana quedó vieja)", async () => {
    const { tx } = base({ ingresos: [ingreso("we-p1", "P1", null), ingreso("we-p2", "P2", null)] });
    const err = await resolverPlataDeGuia(comoTx(tx), T, { gtfNumber: N4, contratoId: SIN_PERMISO }, "escribir").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GuiaAmbiguaError);
    const r = respuestaGuiaPorPermiso(err);
    expect(r?.body.error).toBe("GUIA_AMBIGUA");
    expect((r?.body.candidatas as { contratoId: string }[]).map((c) => c.contratoId).sort()).toEqual(["P1", "P2"]);
  });

  it("el N° sólo sin permiso: «∅» = como siempre (por N°), y releer no necesita «∅»", async () => {
    const { tx } = base({ ingresos: [ingreso("we-sin", null, null)] });
    const p = await resolverPlataDeGuia(comoTx(tx), T, { gtfNumber: N4, contratoId: SIN_PERMISO }, "escribir");
    expect(p).toMatchObject({ contratoId: null, unica: true });
    expect(refDePlata(p)).toBe(N4);
    expect(pedidoDePlata(p)).toBeNull();
  });
});

describe("moverPlataAlPermiso — sólo cambia el permiso, nunca un monto", () => {
  const datos = () => ({
    movs: [
      { id: "abono", gtfNumber: N4, contratoId: null, tipo: "abono", concepto: "madera", monto: 1234.56, parteId: "parte-1" },
      { id: "pago", gtfNumber: "19-1-4", contratoId: null, tipo: "cargo", concepto: "pago", monto: 200, parteId: "parte-1" },
      { id: "venta", gtfNumber: N4, contratoId: null, tipo: "cargo", concepto: "venta", monto: 50, parteId: "parte-2" },
      { id: "otra-guia", gtfNumber: "019-001-0000044", contratoId: null, tipo: "abono", concepto: "madera", monto: 99, parteId: "parte-1" },
    ],
    cubicaciones: [
      { id: "cub", codigo: "CUB-1", gtfNumber: N4, contratoId: null, estado: "aplicada", monto: 800 },
      { id: "cub-venta", codigo: "CUB-2", gtfNumber: N4, contratoId: null, estado: "aplicada", sentido: "venta", monto: 70 },
    ],
    fletes: [{ id: "flete", gtfNumber: N4, contratoId: null, monto: 150 }],
    gastos: [{ id: "gasto", gtfNumber: N4, contratoId: null, amount: 40 }],
  });
  const montos = (tx: TxFalso) =>
    JSON.stringify([tx.forestCuentaMov, tx.forestCubicacionTrozas, tx.forestFlete, tx.expense].map((t) => t.filas.map((f) => [f.id, f.monto ?? f.amount, f.parteId ?? null])));

  it("mueve abono, pagos, cubicación de compra, flete y gasto; no la venta ni otra guía; montos idénticos", async () => {
    const { tx, candados } = base(datos());
    const antes = montos(tx);
    const r = await ForestCuentaDB.moverPlataAlPermiso(comoTx(tx), T, { gtfNumber: N4, contratoId: null }, "P1");
    expect(r).toEqual({ movimientos: 2, cubicaciones: 1, fletes: 1, gastos: 1 });
    expect(montos(tx)).toBe(antes);
    const permiso = (t: { filas: Fila[] }, id: string) => t.filas.find((f) => f.id === id)?.contratoId;
    expect(permiso(tx.forestCuentaMov, "abono")).toBe("P1");
    expect(permiso(tx.forestCuentaMov, "pago")).toBe("P1");
    expect(permiso(tx.forestCuentaMov, "venta")).toBeNull();
    expect(permiso(tx.forestCuentaMov, "otra-guia")).toBeNull();
    expect(permiso(tx.forestCubicacionTrozas, "cub")).toBe("P1");
    expect(permiso(tx.forestCubicacionTrozas, "cub-venta")).toBeNull();
    expect(permiso(tx.forestFlete, "flete")).toBe("P1");
    expect(permiso(tx.expense, "gasto")).toBe("P1");
    expect(candados.some((c) => c.startsWith(`guia-plata:${T}:`))).toBe(true);
  });

  it("si el permiso destino ya tiene el abono de esa guía → PlataEnOtroPermisoError y no mueve nada", async () => {
    const d = datos();
    d.movs.push({ id: "abono-p1", gtfNumber: N4, contratoId: "P1", tipo: "abono", concepto: "madera", monto: 10, parteId: "parte-1" } as never);
    const { tx } = base(d);
    await expect(ForestCuentaDB.moverPlataAlPermiso(comoTx(tx), T, { gtfNumber: N4, contratoId: null }, "P1")).rejects.toBeInstanceOf(PlataEnOtroPermisoError);
    expect(tx.forestCuentaMov.updateMany).not.toHaveBeenCalled();
  });

  it("un permiso de otro negocio no se acepta", async () => {
    const { tx } = base(datos());
    await expect(ForestCuentaDB.moverPlataAlPermiso(comoTx(tx), T, { gtfNumber: N4, contratoId: null }, "P-AJENO")).rejects.toThrow(/no es de este negocio/);
  });
});

describe("estadoDePagoDeGuias — el pago de la 4 de P2 no cubre la 4 de P1", () => {
  it("cada guía con su permiso", () => {
    const estados = estadoDePagoDeGuias(
      [
        { gtfNumber: N4, contratoId: "P1", parteId: "parte-1", fecha: "2026-10-01", monto: 1000 },
        { gtfNumber: N4, contratoId: "P2", parteId: "parte-1", fecha: "2026-10-02", monto: 700 },
      ],
      [{ parteId: "parte-1", tipo: "cargo", concepto: "pago", monto: 700, gtfNumber: N4, contratoId: "P2" }],
    );
    const de = (c: string) => estados.find((e) => e.contratoId === c)!;
    expect(de("P2").estado).toBe("pagada");
    expect(de("P1").cubiertoDirecto).toBe(0);
  });
});
