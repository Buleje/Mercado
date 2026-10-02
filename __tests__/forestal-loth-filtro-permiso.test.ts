/**
 * Filtrar el Libro TH por permiso (02-10-2026).
 *
 * Medido ese día: `GET /api/admin/forestal/loth?planId=<id>` ignoraba el
 * `planId` y devolvía las líneas de TODO el negocio — un agente anuló 5 líneas
 * de «PO 12» creyendo que filtraba otro plan. Acá: el contrato de la query
 * (puro) y el `where` que de verdad sale de `ForestLothDB` (base simulada).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  const llamadas: { modelo: string; metodo: string; args: unknown }[] = [];
  const respuesta: Record<string, unknown> = {};
  const modelo = (nombre: string) =>
    new Proxy(
      {},
      {
        get: (_t, metodo: string) => {
          if (metodo === "then") return undefined;
          return async (args: unknown) => {
            llamadas.push({ modelo: nombre, metodo, args });
            const clave = `${nombre}.${metodo}`;
            if (clave in respuesta) return respuesta[clave];
            if (metodo === "count") return 0;
            if (metodo === "findFirst" || metodo === "findUnique") return null;
            return [];
          };
        },
      },
    );
  const prisma = new Proxy(
    {},
    { get: (_t, nombre: string) => (nombre === "then" ? undefined : modelo(nombre)) },
  );
  return { llamadas, respuesta, prisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/cache", () => ({ invalidate: vi.fn(), invalidateByPrefix: vi.fn() }));

import { ForestLothDB } from "@/lib/db/forest-loth.db";
import {
  PERMISO_SIN_PLAN,
  cumplePermiso,
  encabezadoDelPermiso,
  filtroDeSeleccion,
  leerFiltroPermiso,
  nombreArchivoLibro,
  permisoElegido,
  queryDelPermiso,
  type FiltroPermiso,
} from "@/lib/forestal/loth-filtro-permiso";
import { AUTO } from "@/lib/forestal/loth-tablero-permiso";
import { PLAN_SIN_PLAN } from "@/lib/forestal/loth-tablero-trozas";

/** El plan de `main` con el que se midió el bug. */
const PO12 = "cmpq6yhdu000073vzx1khmlap";
const qs = (s: string) => new URLSearchParams(s);

describe("contrato de la query (`planId` + `solo`)", () => {
  it("sin planId (o vacío) → el libro entero", () => {
    expect(leerFiltroPermiso(qs(""))).toEqual({ ok: true, filtro: null });
    expect(leerFiltroPermiso(qs("planId="))).toEqual({ ok: true, filtro: null });
    expect(leerFiltroPermiso(qs("planId=%20%20"))).toEqual({ ok: true, filtro: null });
  });

  it("planId + solo=1 → sólo ese plan; sin solo → ese plan y las sin plan (alcance del balance)", () => {
    expect(leerFiltroPermiso(qs(`planId=${PO12}&solo=1`))).toEqual({
      ok: true,
      filtro: { tipo: "plan", planId: PO12, conSinPlan: false },
    });
    expect(leerFiltroPermiso(qs(`planId=${PO12}`))).toEqual({
      ok: true,
      filtro: { tipo: "plan", planId: PO12, conSinPlan: true },
    });
  });

  it("planId=sin-plan → las líneas sin plan (el mismo valor que el Control del permiso)", () => {
    expect(PERMISO_SIN_PLAN).toBe(PLAN_SIN_PLAN);
    expect(leerFiltroPermiso(qs("planId=sin-plan"))).toEqual({ ok: true, filtro: { tipo: "sin-plan" } });
  });

  it("un planId mal formado o un solo raro → error con motivo, no «todo el libro»", () => {
    const malo = leerFiltroPermiso(qs("planId=' OR 1=1 --"));
    expect(malo.ok).toBe(false);
    expect(leerFiltroPermiso(qs(`planId=${"x".repeat(65)}`)).ok).toBe(false);
    const solo = leerFiltroPermiso(qs(`planId=${PO12}&solo=si`));
    expect(solo).toEqual({ ok: false, mensaje: "«solo» va como 1 o 0." });
  });

  it("lo que pide la pantalla se lee igual en el servidor (ida y vuelta)", () => {
    const casos: (FiltroPermiso | null)[] = [
      null,
      { tipo: "sin-plan" },
      { tipo: "plan", planId: PO12, conSinPlan: false },
      { tipo: "plan", planId: PO12, conSinPlan: true },
    ];
    for (const f of casos) expect(leerFiltroPermiso(qs(queryDelPermiso(f)))).toEqual({ ok: true, filtro: f });
    expect(queryDelPermiso(filtroDeSeleccion(PO12))).toBe(`planId=${PO12}&solo=1`);
    expect(queryDelPermiso(filtroDeSeleccion(null))).toBe("");
  });

  it("cumplePermiso decide igual que el where del servidor", () => {
    const solo = filtroDeSeleccion(PO12);
    expect(cumplePermiso(PO12, solo)).toBe(true);
    expect(cumplePermiso("otro", solo)).toBe(false);
    expect(cumplePermiso(null, solo)).toBe(false);
    expect(cumplePermiso(null, { tipo: "plan", planId: PO12, conSinPlan: true })).toBe(true);
    expect(cumplePermiso(null, { tipo: "sin-plan" })).toBe(true);
    expect(cumplePermiso(PO12, { tipo: "sin-plan" })).toBe(false);
    expect(cumplePermiso("cualquiera", null)).toBe(true);
  });
});

describe("qué permiso vale en el selector", () => {
  const planes = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("sin elección: con UN plan vivo, ése; con varios (Blas tiene 3), «Todos»", () => {
    expect(permisoElegido(AUTO, [{ id: "a" }])).toBe("a");
    expect(permisoElegido(AUTO, planes)).toBeNull();
    expect(permisoElegido(AUTO, null)).toBeNull();
  });
  it("lo elegido a mano se respeta; un plan de baja vuelve a «Todos»", () => {
    expect(permisoElegido("b", planes)).toBe("b");
    expect(permisoElegido(null, [{ id: "a" }])).toBeNull();
    expect(permisoElegido("borrado", planes)).toBeNull();
    expect(permisoElegido("b", null)).toBe("b");
    expect(permisoElegido(PERMISO_SIN_PLAN, planes)).toBe(PERMISO_SIN_PLAN);
  });
});

describe("lo que el impreso y el Excel dicen arriba", () => {
  it("un plan: nombre, tipo, titular, título y resolución; el archivo lleva el permiso", () => {
    const enc = encabezadoDelPermiso(filtroDeSeleccion("p1"), {
      planType: "PLANTACION",
      planNumber: "19-SEC/REG-PLT-2025-096",
      alias: null,
      titularName: "Inversiones Agroforestales Blas S.A.",
      tituloHabilitante: "19-SEC/REG-PLT-2025-096",
      resolucionNumber: null,
    });
    expect(enc.titulo).toBe("Permiso 19-SEC/REG-PLT-2025-096");
    expect(enc.filas[0]).toEqual(["Permiso", "19-SEC/REG-PLT-2025-096 (Plantación)"]);
    expect(enc.filas).toContainEqual(["Titular del permiso", "Inversiones Agroforestales Blas S.A."]);
    expect(enc.filas.map((f) => f[0])).not.toContain("Resolución");
    expect(enc.delLibroEntero).toBe(false);
    expect(nombreArchivoLibro(enc, "2026-10-02T15:00:00.000Z", "xlsx")).toBe("libro-loth-19-SEC-REG-PLT-2025-096-2026-10-02.xlsx");
  });

  it("«Todos» también lo dice, y el archivo se llama como siempre", () => {
    const enc = encabezadoDelPermiso(null);
    expect(enc).toMatchObject({ titulo: "Todos los permisos", delLibroEntero: true, sufijoArchivo: null });
    expect(nombreArchivoLibro(enc, "2026-10-02T15:00:00.000Z", "xlsx")).toBe("libro-loth-2026-10-02.xlsx");
  });

  it("sin plan: lo dice con todas las letras", () => {
    const enc = encabezadoDelPermiso({ tipo: "sin-plan" });
    expect(enc.titulo).toBe("Líneas sin permiso");
    expect(enc.sufijoArchivo).toBe("sin-plan");
  });
});

describe("ForestLothDB filtra en la base (el where que de verdad sale)", () => {
  beforeEach(() => {
    H.llamadas.length = 0;
    for (const k of Object.keys(H.respuesta)) delete H.respuesta[k];
  });

  const whereDe = (metodo: string) => {
    const ll = H.llamadas.find((l) => l.modelo === "forestLothEntry" && l.metodo === metodo);
    return (ll?.args as { where?: Record<string, unknown> } | undefined)?.where;
  };

  it("list con el permiso elegido: tenant primero y SÓLO ese plan; la lista y el total con el mismo where", async () => {
    await ForestLothDB.list("t-main", { permiso: filtroDeSeleccion(PO12), includeAnnulled: true });
    expect(whereDe("findMany")).toEqual({ tenantId: "t-main", deletedAt: null, AND: [{ planId: PO12 }] });
    expect(whereDe("count")).toEqual(whereDe("findMany"));
  });

  it("list con búsqueda Y permiso: los dos se cumplen (un OR no pisa al otro)", async () => {
    await ForestLothDB.list("t-main", { search: "TOR", section: "tala", permiso: { tipo: "plan", planId: PO12, conSinPlan: true } });
    const w = whereDe("findMany") as { AND: Record<string, unknown>[]; tenantId: string; section: string; status: string };
    expect(w.tenantId).toBe("t-main");
    expect(w.section).toBe("tala");
    expect(w.status).toBe("registrado");
    expect(w.AND).toHaveLength(2);
    expect(w.AND[0]).toHaveProperty("OR");
    expect(w.AND[1]).toEqual({ OR: [{ planId: PO12 }, { planId: null }] });
  });

  it("list sin permiso: el where de siempre (sin AND)", async () => {
    await ForestLothDB.list("t-main", { includeAnnulled: true });
    expect(whereDe("findMany")).toEqual({ tenantId: "t-main", deletedAt: null });
  });

  it("list «sin plan» → planId null", async () => {
    await ForestLothDB.list("t-main", { permiso: { tipo: "sin-plan" } });
    expect(whereDe("findMany")).toMatchObject({ tenantId: "t-main", AND: [{ planId: null }] });
  });

  it("stats: el alcance del balance (informe) y el estricto (pantalla)", async () => {
    H.respuesta["forestLothEntry.groupBy"] = [
      { section: "tala", _count: { _all: 3 }, _sum: { volumeM3: { toNumber: () => 4.5 }, quantity: null } },
    ];
    const conSinPlan = await ForestLothDB.stats("t-main", undefined, { tipo: "plan", planId: PO12, conSinPlan: true });
    expect(whereDe("groupBy")).toEqual({
      tenantId: "t-main",
      deletedAt: null,
      status: "registrado",
      AND: [{ OR: [{ planId: PO12 }, { planId: null }] }],
    });
    expect(conSinPlan).toEqual([{ section: "tala", count: 3, totalVolumeM3: 4.5, totalQuantity: 0 }]);

    H.llamadas.length = 0;
    await ForestLothDB.stats("t-main", undefined, filtroDeSeleccion(PO12));
    expect(whereDe("groupBy")).toMatchObject({ AND: [{ planId: PO12 }] });
  });

  it("lineasSinPlan cuenta las del tenant (anuladas incluidas: la tabla también las muestra)", async () => {
    H.respuesta["forestLothEntry.count"] = 2;
    expect(await ForestLothDB.lineasSinPlan("t-main")).toBe(2);
    expect(whereDe("count")).toEqual({ tenantId: "t-main", deletedAt: null, planId: null });
    await expect(ForestLothDB.lineasSinPlan("")).rejects.toThrow(/tenantId/);
  });
});
