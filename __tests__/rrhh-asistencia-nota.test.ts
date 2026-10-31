/**
 * __tests__/rrhh-asistencia-nota.test.ts
 *
 * Nota del día SIN marca (23-10, «sólo una nota, sin poner presente ni nada»):
 * - `PUT/DELETE /api/rrhh/asistencia/nota`: guardar, editar, borrar; persona de
 *   otro negocio → 404; rol fuera de RRHH → 403; fuera de la ventana del cajero
 *   → 403; día ya marcado → 409.
 * - `AsistenciaDB.guardar`: al marcar, la nota suelta pasa a `Asistencia.nota`
 *   en la MISMA tx y se borra; al quitar la marca, su nota vuelve a ser suelta.
 * - La nota no cuenta en presentes/tardanzas/faltas.
 * - Carrera (revisión de seguridad 23-10): nota y marca del mismo día a la vez
 *   se ponen en fila con el mismo candado persona+día; al quitar la marca, su
 *   nota se JUNTA con una suelta que ya hubiera.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { renderHook } from "@testing-library/react";

vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: vi.fn(() => null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/utils", async (orig) => ({ ...(await orig<typeof import("@/lib/utils")>()), limaDateKey: () => "2026-10-23" }));

const m = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  obtener: vi.fn(),
  guardarNota: vi.fn(),
  borrarNota: vi.fn(),
  transaccion: vi.fn(),
  tx: {
    $executeRaw: vi.fn(),
    asistencia: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    asistenciaNota: { findMany: vi.fn(), deleteMany: vi.fn(), upsert: vi.fn() },
  },
  colaboradorFindMany: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: m.requireAdmin }));
vi.mock("@/lib/db/rrhh-colaboradores.db", () => ({ ColaboradoresDB: { obtener: m.obtener } }));
vi.mock("@/lib/db/asistencia-notas.db", async (orig) => {
  const real = await orig<typeof import("@/lib/db/asistencia-notas.db")>();
  return { ...real, AsistenciaNotasDB: { guardar: m.guardarNota, borrar: m.borrarNota } };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    colaborador: { findMany: m.colaboradorFindMany },
    $transaction: (cb: (tx: unknown) => unknown) => m.transaccion(cb),
  },
}));

const { PUT, DELETE } = await import("@/app/api/rrhh/asistencia/nota/route");
const { DiaMarcadoError } = await import("@/lib/db/asistencia-notas.db");
const { AsistenciaDB } = await import("@/lib/db/rrhh-asistencia.db");
const { notaAlMarcar, notaDelDia } = await import("@/lib/rrhh/nota-del-dia");
const { useCuentasDelDia } = await import("@/components/admin/rrhh/asistencia/use-cuentas-del-dia");

const K = "colab-qa";
const URL_NOTA = "https://host/api/rrhh/asistencia/nota";

function comoRol(role: string) {
  m.requireAdmin.mockImplementation(async (_req: unknown, roles: readonly string[]) =>
    roles.includes(role) ? { tenantId: "t1", username: "qa", role } : NextResponse.json({ error: "forbidden" }, { status: 403 }),
  );
}
const put = (body: unknown) => PUT(new NextRequest(URL_NOTA, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const del = (q: string) => DELETE(new NextRequest(`${URL_NOTA}?${q}`, { method: "DELETE" }));

beforeEach(() => {
  vi.clearAllMocks();
  m.transaccion.mockImplementation((cb: (tx: typeof m.tx) => unknown) => cb(m.tx));
  comoRol("admin");
  m.obtener.mockImplementation(async (tenantId: string, id: string) =>
    tenantId === "t1" && id === K ? { id: K, fechaIngreso: null, fechaCese: null } : null,
  );
  m.guardarNota.mockImplementation(async (_t: string, i: { colaboradorId: string; fecha: string; nota: string; autor: string }) => ({
    ...i,
    actualizadaEn: "2026-10-23T12:00:00.000Z",
  }));
  m.borrarNota.mockResolvedValue(1);
});

describe("PUT/DELETE /api/rrhh/asistencia/nota", () => {
  it("guarda y edita la nota de un día sin marca, con el tenant del JWT", async () => {
    const r1 = await put({ colaboradorId: K, fecha: "2026-10-23", nota: "  Avisó que llega el lunes " });
    expect(r1.status).toBe(200);
    expect(m.guardarNota).toHaveBeenCalledWith("t1", { colaboradorId: K, fecha: "2026-10-23", nota: "Avisó que llega el lunes", autor: "qa" });
    const r2 = await put({ colaboradorId: K, fecha: "2026-10-23", nota: "Llega el martes" });
    expect(r2.status).toBe(200);
    expect((await r2.json()).nota.nota).toBe("Llega el martes");
  });

  it("borra la nota", async () => {
    const r = await del(`colaboradorId=${K}&fecha=2026-10-23`);
    expect(r.status).toBe(200);
    expect(m.borrarNota).toHaveBeenCalledWith("t1", K, "2026-10-23");
  });

  it("persona de otro negocio → 404 y no escribe", async () => {
    const r = await put({ colaboradorId: "de-otro-negocio", fecha: "2026-10-23", nota: "x" });
    expect(r.status).toBe(404);
    expect((await del("colaboradorId=de-otro-negocio&fecha=2026-10-23")).status).toBe(404);
    expect(m.guardarNota).not.toHaveBeenCalled();
    expect(m.borrarNota).not.toHaveBeenCalled();
  });

  it("rol fuera de RRHH → 403; cajero fuera de su ventana → 403; dentro → 200", async () => {
    comoRol("repartidor");
    expect((await put({ colaboradorId: K, fecha: "2026-10-23", nota: "x" })).status).toBe(403);
    comoRol("cajero");
    const fuera = await put({ colaboradorId: K, fecha: "2026-10-10", nota: "x" });
    expect(fuera.status).toBe(403);
    expect((await fuera.json()).error).toBe("fuera_de_ventana");
    expect((await put({ colaboradorId: K, fecha: "2026-10-21", nota: "x" })).status).toBe(200);
    expect(m.guardarNota).toHaveBeenCalledTimes(1);
  });

  it("nota vacía o fecha futura → 422; día ya marcado → 409", async () => {
    expect((await put({ colaboradorId: K, fecha: "2026-10-23", nota: "   " })).status).toBe(422);
    expect((await put({ colaboradorId: K, fecha: "2026-10-24", nota: "x" })).status).toBe(422);
    m.guardarNota.mockRejectedValueOnce(new DiaMarcadoError());
    expect((await put({ colaboradorId: K, fecha: "2026-10-23", nota: "x" })).status).toBe(409);
  });
});

describe("AsistenciaDB.guardar — la nota suelta pasa a la marca", () => {
  const marca = (p: Partial<Parameters<typeof AsistenciaDB.guardar>[1][number]> = {}) => ({
    colaboradorId: K,
    fecha: "2026-10-23",
    quitar: false,
    estado: "PRESENTE" as const,
    entradaMin: null,
    salidaMin: null,
    refrigerioMin: 0,
    horas: null,
    nota: null,
    marcadoPor: "qa",
    origen: "manual" as const,
    ...p,
  });
  const fecha = new Date("2026-10-23T00:00:00.000Z");

  beforeEach(() => {
    m.colaboradorFindMany.mockResolvedValue([{ id: K }]);
    m.tx.asistencia.findMany.mockResolvedValue([]);
    m.tx.asistenciaNota.findMany.mockResolvedValue([{ id: "n1", colaboradorId: K, fecha, nota: "Avisó que llega tarde" }]);
    m.tx.asistencia.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "a1", createdAt: new Date(), deletedAt: null, deletedBy: null, reemplazadaPorId: null, motivoCorreccion: null, ...data,
    }));
    m.tx.asistencia.updateMany.mockResolvedValue({ count: 1 });
    m.tx.asistenciaNota.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("marcar Presente escribe la nota en la marca y borra la suelta en la misma tx", async () => {
    const r = await AsistenciaDB.guardar("t1", [marca()], { usuario: "qa", origen: "manual" });
    expect(r.guardadas[0].nota).toBe("Avisó que llega tarde");
    expect(m.tx.asistencia.create.mock.calls[0][0].data.nota).toBe("Avisó que llega tarde");
    expect(m.tx.asistenciaNota.deleteMany).toHaveBeenCalledWith({ where: { tenantId: "t1", id: { in: ["n1"] } } });
    // El candado persona+día va ANTES de leer marcas y notas.
    expect(m.tx.$executeRaw.mock.calls[0].slice(1)).toEqual(["t1", `asistencia-dia:${K}:2026-10-23`]);
    expect(m.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(m.tx.asistencia.findMany.mock.invocationCallOrder[0]);
  });

  it("si la marca trae otra nota, se juntan (no se pierde lo anotado antes)", async () => {
    await AsistenciaDB.guardar("t1", [marca({ nota: "Salió temprano" })], { usuario: "qa", origen: "manual" });
    expect(m.tx.asistencia.create.mock.calls[0][0].data.nota).toBe("Avisó que llega tarde · Salió temprano");
  });

  it("quitar la marca devuelve su nota a suelta", async () => {
    m.tx.asistencia.findMany.mockResolvedValue([{ id: "viva", colaboradorId: K, fecha, estado: "PRESENTE", entradaMin: null, salidaMin: null, refrigerioMin: 0, horas: null, nota: "Llegó en moto" }]);
    m.tx.asistenciaNota.findMany.mockResolvedValue([]);
    const r = await AsistenciaDB.guardar("t1", [marca({ quitar: true, estado: null })], { usuario: "qa", origen: "manual", motivo: "Se marcó por error" });
    expect(r.quitadas).toBe(1);
    expect(m.tx.asistenciaNota.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ tenantId: "t1", colaboradorId: K, nota: "Llegó en moto" }) }),
    );
    expect(m.tx.asistenciaNota.deleteMany).not.toHaveBeenCalled();
  });

  it("quitar la marca JUNTA su nota con una suelta que ya hubiera (no la pisa)", async () => {
    m.tx.asistencia.findMany.mockResolvedValue([{ id: "viva", colaboradorId: K, fecha, estado: "PRESENTE", entradaMin: null, salidaMin: null, refrigerioMin: 0, horas: null, nota: "Llegó en moto" }]);
    await AsistenciaDB.guardar("t1", [marca({ quitar: true, estado: null })], { usuario: "qa", origen: "manual", motivo: "Se marcó por error" });
    const arg = m.tx.asistenciaNota.upsert.mock.calls[0][0];
    expect(arg.create.nota).toBe("Avisó que llega tarde · Llegó en moto");
    expect(arg.update.nota).toBe("Avisó que llega tarde · Llegó en moto");
  });

  describe("carrera: anotar y marcar el mismo día a la vez", () => {
    /** Base en memoria + candado de verdad (o ninguno, para ver la carrera de antes). */
    function montarBase(conCandado: boolean) {
      const vivas: Record<string, unknown>[] = [];
      const notas: { id: string; colaboradorId: string; fecha: Date; nota: string; autor: string; updatedAt: Date }[] = [];
      const colas = new Map<string, Promise<void>>();
      let avisarQueLeyoNotas = () => {};
      const marcadoLeyoNotas = new Promise<void>((r) => (avisarQueLeyoNotas = r));
      const crearTx = (soltar: (() => void)[]) => ({
        $executeRaw: async (_sql: TemplateStringsArray, tenantId: string, claves: string | string[]) => {
          if (!conCandado) return 0;
          for (const clave of [claves].flat().sort()) {
            const k = `${tenantId}|${clave}`;
            const antes = colas.get(k) ?? Promise.resolve();
            let suelto = () => {};
            const mio = new Promise<void>((r) => (suelto = r));
            colas.set(k, antes.then(() => mio));
            await antes;
            soltar.push(suelto);
          }
          return 1;
        },
        colaborador: { findFirst: async () => ({ id: K }) },
        asistencia: {
          findFirst: async ({ where }: { where: { colaboradorId: string; fecha: Date } }) =>
            vivas.find((v) => v.colaboradorId === where.colaboradorId && +(v.fecha as Date) === +where.fecha && !v.deletedAt) ?? null,
          findMany: async () => vivas.filter((v) => !v.deletedAt),
          create: async ({ data }: { data: Record<string, unknown> }) => {
            const fila = { id: `a${vivas.length + 1}`, createdAt: new Date(), deletedAt: null, deletedBy: null, reemplazadaPorId: null, motivoCorreccion: null, ...data };
            vivas.push(fila);
            return fila;
          },
          updateMany: async () => ({ count: 1 }),
          update: async () => ({}),
        },
        asistenciaNota: {
          findMany: async () => {
            avisarQueLeyoNotas();
            return notas.map((n) => ({ ...n }));
          },
          // La nota se demora entre leer el día y escribir: sin candado, el marcado lee «sin nota» en ese hueco.
          upsert: async ({ create }: { create: { colaboradorId: string; fecha: Date; nota: string; autor: string } }) => {
            await Promise.race([marcadoLeyoNotas, new Promise((r) => setTimeout(r, 30))]);
            const fila = { id: `n${notas.length + 1}`, ...create, updatedAt: new Date() };
            notas.push(fila);
            return fila;
          },
          deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
            const antes = notas.length;
            notas.splice(0, notas.length, ...notas.filter((n) => !where.id.in.includes(n.id)));
            return { count: antes - notas.length };
          },
        },
      });
      m.transaccion.mockImplementation(async (cb: (tx: unknown) => unknown) => {
        const soltar: (() => void)[] = [];
        try {
          return await cb(crearTx(soltar));
        } finally {
          soltar.forEach((f) => f());
        }
      });
      return { vivas, notas };
    }

    async function anotarYMarcarALaVez() {
      const { AsistenciaNotasDB: NotasReal } = await vi.importActual<typeof import("@/lib/db/asistencia-notas.db")>("@/lib/db/asistencia-notas.db");
      await Promise.all([
        NotasReal.guardar("t1", { colaboradorId: K, fecha: "2026-10-23", nota: "Avisó que llega tarde", autor: "qa" }),
        AsistenciaDB.guardar("t1", [marca()], { usuario: "qa", origen: "manual" }),
      ]);
    }

    it("con el candado se ponen en fila: la nota termina en la marca y no queda suelta", async () => {
      const base = montarBase(true);
      await anotarYMarcarALaVez();
      expect(base.vivas).toHaveLength(1);
      expect(base.vivas[0].nota).toBe("Avisó que llega tarde");
      expect(base.notas).toHaveLength(0);
    });

    it("control: sin candado el mismo cruce deja marca + nota suelta invisible (lo que se cerró)", async () => {
      const base = montarBase(false);
      await anotarYMarcarALaVez();
      expect(base.vivas[0].nota).toBeNull();
      expect(base.notas).toHaveLength(1);
    });
  });
});

describe("la nota no cuenta en los totales", () => {
  it("una persona con nota y sin marca sigue en «sin marcar» y el conteo queda en cero", () => {
    const colaborador = { id: K, nombre: "Kevin", apodo: null, puesto: null, puestoId: null, fechaIngreso: null, fechaCese: null, eventual: false, estado: "ACTIVO" };
    const hoja = {
      nivel: "completo", hoy: "2026-10-23", desde: "2026-10-23", hasta: "2026-10-23", ventana: { desde: null, hasta: "2026-10-23" },
      colaboradores: [colaborador], ultimaVino: {}, marcas: [],
      notas: [{ colaboradorId: K, fecha: "2026-10-23", nota: "Avisó que llega tarde", autor: "qa", actualizadaEn: "x" }],
    } as unknown as Parameters<typeof useCuentasDelDia>[0];
    const { result } = renderHook(() => useCuentasDelDia(hoja, "2026-10-23", []));
    expect(result.current.sinMarcar.map((c) => c.id)).toEqual([K]);
    expect(Object.values(result.current.conteo).every((n) => n === 0)).toBe(true);
  });

  it("puros: una sola nota por día", () => {
    expect(notaAlMarcar(null, "A")).toBe("A");
    expect(notaAlMarcar("A", "A")).toBe("A");
    expect(notaAlMarcar("B", null)).toBe("B");
    expect(notaAlMarcar("B", "A")).toBe("A · B");
    expect(notaDelDia({ nota: "de la marca" }, { nota: "suelta vieja" })).toBe("de la marca");
    expect(notaDelDia({ nota: null }, { nota: "suelta vieja" })).toBeNull();
    expect(notaDelDia(undefined, { nota: "suelta" })).toBe("suelta");
  });
});
