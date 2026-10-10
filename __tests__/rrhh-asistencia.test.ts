/**
 * __tests__/rrhh-asistencia.test.ts
 *
 * ADR-414 §4 — `revisarMarca` es la ÚNICA puerta de una marca de asistencia.
 * Cada motivo de rechazo tiene su caso, y cada uno con un control negativo
 * (la marca hermana que SÍ debe pasar) para que un rechazo de más no se cuele.
 */
import { describe, expect, it, vi } from "vitest";
import {
  calcularHoras,
  esIgualALaViva,
  incluidosEnMasivo,
  revisarMarca,
  type ColaboradorParaMasivo,
  type ContextoColaborador,
  type MarcaInput,
  type MarcaNormalizada,
  type RevisarMarcaCtx,
} from "@/lib/rrhh/asistencia";
import { escribirMarcaEnTx, VivaCambiadaError } from "@/lib/db/rrhh-asistencia.db";
import type { Prisma } from "@/lib/generated/prisma/client";

const colaborador = (p: Partial<ContextoColaborador> = {}): ContextoColaborador => ({
  fechaIngreso: null,
  fechaCese: null,
  eliminado: false,
  ...p,
});

const ctx = (p: Partial<RevisarMarcaCtx> = {}): RevisarMarcaCtx => ({
  colaborador: colaborador(),
  hoy: "2026-09-11",
  ventana: { desde: null, hasta: "2026-09-11" },
  marcadoPor: "qaadmin",
  origen: "manual",
  ...p,
});

const input = (p: Partial<MarcaInput> = {}): MarcaInput => ({
  colaboradorId: "c1",
  fecha: "2026-09-11",
  estado: "PRESENTE",
  ...p,
});

describe("revisarMarca — cada motivo de rechazo, con su control negativo", () => {
  it("fecha futura → futuro", () => {
    const r = revisarMarca(input({ fecha: "2026-09-12" }), ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("futuro");
  });
  it("CONTROL NEGATIVO: hoy mismo sí pasa", () => {
    const r = revisarMarca(input({ fecha: "2026-09-11" }), ctx());
    expect(r.ok).toBe(true);
  });

  it("fuera de la ventana del rol → fuera_de_ventana", () => {
    const r = revisarMarca(input({ fecha: "2026-09-05" }), ctx({ ventana: { desde: "2026-09-09", hasta: "2026-09-11" } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("fuera_de_ventana");
  });
  it("CONTROL NEGATIVO: dentro de la ventana sí pasa", () => {
    const r = revisarMarca(input({ fecha: "2026-09-09" }), ctx({ ventana: { desde: "2026-09-09", hasta: "2026-09-11" } }));
    expect(r.ok).toBe(true);
  });

  it("antes del ingreso → antes_del_ingreso", () => {
    const r = revisarMarca(input({ fecha: "2026-09-01" }), ctx({ colaborador: colaborador({ fechaIngreso: "2026-09-05" }) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("antes_del_ingreso");
  });
  it("CONTROL NEGATIVO: el día mismo del ingreso sí pasa", () => {
    const r = revisarMarca(input({ fecha: "2026-09-05" }), ctx({ colaborador: colaborador({ fechaIngreso: "2026-09-05" }) }));
    expect(r.ok).toBe(true);
  });

  it("después del cese → despues_del_cese", () => {
    const r = revisarMarca(input({ fecha: "2026-09-11" }), ctx({ colaborador: colaborador({ fechaCese: "2026-09-10" }) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("despues_del_cese");
  });
  it("CONTROL NEGATIVO: el día mismo del cese sí pasa", () => {
    const r = revisarMarca(input({ fecha: "2026-09-10" }), ctx({ colaborador: colaborador({ fechaCese: "2026-09-10" }) }));
    expect(r.ok).toBe(true);
  });

  it("colaborador eliminado → colaborador_eliminado", () => {
    const r = revisarMarca(input(), ctx({ colaborador: colaborador({ eliminado: true }) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("colaborador_eliminado");
  });

  it("una FALTA con horas → horas_en_estado_sin_trabajo", () => {
    const r = revisarMarca(input({ estado: "FALTA", entrada: "08:00" }), ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("horas_en_estado_sin_trabajo");
  });
  it("CONTROL NEGATIVO: una FALTA sin horas sí pasa", () => {
    const r = revisarMarca(input({ estado: "FALTA" }), ctx());
    expect(r.ok).toBe(true);
  });

  it("salida antes o igual a la entrada → turno_cruza_medianoche", () => {
    const r = revisarMarca(input({ entrada: "08:00", salida: "07:00" }), ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("turno_cruza_medianoche");
  });
  it("CONTROL NEGATIVO: salida después de la entrada sí pasa", () => {
    const r = revisarMarca(input({ entrada: "08:00", salida: "17:00" }), ctx());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.marca.horas).toBe(9);
  });

  it("refrigerio mayor que el turno → horas_invalidas", () => {
    const r = revisarMarca(input({ entrada: "08:00", salida: "08:30", refrigerioMin: 60 }), ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("horas_invalidas");
  });

  it("estado null (quitar) no revisa horas y siempre pasa dentro de la ventana", () => {
    const r = revisarMarca(input({ estado: null }), ctx());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.marca.quitar).toBe(true);
  });
});

describe("calcularHoras", () => {
  it("con entrada y salida: (salida - entrada - refrigerio) / 60", () => {
    expect(calcularHoras({ entradaMin: 480, salidaMin: 1020, refrigerioMin: 60, horasTipeadas: null })).toBe(8);
  });
  it("sin entrada/salida: la que se tipeó", () => {
    expect(calcularHoras({ entradaMin: null, salidaMin: null, refrigerioMin: 0, horasTipeadas: 5 })).toBe(5);
  });
  it("sin ninguna de las dos: null", () => {
    expect(calcularHoras({ entradaMin: null, salidaMin: null, refrigerioMin: 0, horasTipeadas: null })).toBeNull();
  });
});

describe("esIgualALaViva", () => {
  const marca = { estado: "PRESENTE" as const, entradaMin: 480, salidaMin: 1020, refrigerioMin: 60, horas: 8, nota: null };

  it("idéntica → true (no escribe)", () => {
    expect(esIgualALaViva(marca, { ...marca })).toBe(true);
  });
  it("CONTROL NEGATIVO: un campo distinto → false", () => {
    expect(esIgualALaViva(marca, { ...marca, estado: "TARDANZA" })).toBe(false);
  });
  it("sin viva y se pide quitar → true (nada que quitar)", () => {
    expect(esIgualALaViva(null, { estado: null, entradaMin: null, salidaMin: null, refrigerioMin: 0, horas: null, nota: null })).toBe(
      true,
    );
  });
  it("con viva y se pide quitar → false (hay algo que quitar)", () => {
    expect(esIgualALaViva(marca, { estado: null, entradaMin: null, salidaMin: null, refrigerioMin: 0, horas: null, nota: null })).toBe(
      false,
    );
  });
});

describe("incluidosEnMasivo", () => {
  const gente: ColaboradorParaMasivo[] = [
    { id: "activo", nombre: "Activo Hoy", estado: "ACTIVO", fechaIngreso: null },
    { id: "cesado", nombre: "Cesado", estado: "CESADO", fechaIngreso: null },
    { id: "vacaciones", nombre: "De Vacaciones", estado: "VACACIONES", fechaIngreso: null },
    { id: "no-ingreso", nombre: "Ingresa Mañana", estado: "ACTIVO", fechaIngreso: "2026-09-12" },
  ];

  it("ACTIVO con ingreso ya cumplido → incluido; el resto, omitido con su motivo", () => {
    const { incluidos, omitidos } = incluidosEnMasivo(gente, "2026-09-11", new Set(), { sobrescribir: false });
    expect(incluidos).toEqual(["activo"]);
    expect(omitidos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ colaboradorId: "cesado", motivo: "cesado" }),
        expect.objectContaining({ colaboradorId: "vacaciones", motivo: "no_activo" }),
        expect.objectContaining({ colaboradorId: "no-ingreso", motivo: "no_ingresado" }),
      ]),
    );
  });

  it("ya marcado y sobrescribir=false (default): se omite con ya_marcado", () => {
    const { incluidos, omitidos } = incluidosEnMasivo(gente, "2026-09-11", new Set(["activo"]), { sobrescribir: false });
    expect(incluidos).toEqual([]);
    expect(omitidos).toEqual(expect.arrayContaining([expect.objectContaining({ colaboradorId: "activo", motivo: "ya_marcado" })]));
  });

  it("CONTROL NEGATIVO: con sobrescribir=true, el ya marcado SÍ se incluye", () => {
    const { incluidos } = incluidosEnMasivo(gente, "2026-09-11", new Set(["activo"]), { sobrescribir: true });
    expect(incluidos).toEqual(["activo"]);
  });

  it("colaboradorIds filtra el universo: alguien fuera de la lista no aparece ni en incluidos ni en omitidos", () => {
    const { incluidos, omitidos } = incluidosEnMasivo(gente, "2026-09-11", new Set(), {
      sobrescribir: false,
      colaboradorIds: ["activo"],
    });
    expect(incluidos).toEqual(["activo"]);
    expect(omitidos.find((o) => o.colaboradorId === "cesado")).toBeUndefined();
  });
});

/**
 * BUG medido en QA 2026-09-14: corregir una marca existente daba 503 SIEMPRE
 * (no era una carrera). Causa: `guardar` creaba la fila nueva ANTES de dar de
 * baja la viva, y el índice único parcial `(tenantId, colaboradorId, fecha)
 * WHERE deletedAt IS NULL` rechazaba la convivencia de dos filas vivas dentro
 * de la misma transacción. Este test fija el ORDEN de escritura con un `tx`
 * falso — sin base real — para que una regresión al orden viejo lo rompa acá,
 * no en QA.
 */
describe("escribirMarcaEnTx — orden de escritura (baja ANTES de crear)", () => {
  function txFalso(opts: { countBaja?: number } = {}) {
    const llamadas: string[] = [];
    const asistencia = {
      updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        llamadas.push("updateMany");
        return { count: opts.countBaja ?? 1, _where: args.where, _data: args.data };
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        llamadas.push("update");
        return { id: args.where.id };
      }),
      create: vi.fn(async (_args: { data: Record<string, unknown> }) => {
        llamadas.push("create");
        return { id: "nueva-1", ..._args.data };
      }),
    };
    const tx = { asistencia } as unknown as Pick<Prisma.TransactionClient, "asistencia">;
    return { tx, llamadas, asistencia };
  }

  const marca: MarcaNormalizada = {
    colaboradorId: "c1",
    fecha: "2026-09-14",
    quitar: false,
    estado: "FALTA",
    entradaMin: null,
    salidaMin: null,
    refrigerioMin: 0,
    horas: null,
    nota: null,
    marcadoPor: "qaadmin",
    origen: "manual",
  };

  it("con una viva: da de baja PRIMERO (updateMany con deletedAt:null), crea DESPUÉS, y recién ahí apunta reemplazadaPorId", async () => {
    const { tx, llamadas, asistencia } = txFalso();
    const nueva = await escribirMarcaEnTx(tx, "t1", marca, { id: "viva-1" }, { origen: "manual", motivo: "QA" });

    expect(llamadas).toEqual(["updateMany", "create", "update"]);
    expect(nueva.id).toBe("nueva-1");

    // La baja usa `updateMany` con el guard — nunca `update` por id pelado.
    const baja = asistencia.updateMany.mock.calls[0][0] as { where: Record<string, unknown>; data: Record<string, unknown> };
    expect(baja.where).toMatchObject({ id: "viva-1", tenantId: "t1", deletedAt: null });
    expect(baja.data).not.toHaveProperty("reemplazadaPorId");
    expect(baja.data.deletedAt).toBeInstanceOf(Date);

    // El único `update` (no `updateMany`) es el que completa el puntero, ya
    // con la fila nueva creada — nadie más puede haber tocado esta fila
    // porque la tenemos exclusiva desde que la dimos de baja en esta misma tx.
    const segundoUpdate = asistencia.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(segundoUpdate.data.reemplazadaPorId).toBe("nueva-1");
  });

  it("ALTO (revisión 2026-09-14): si la viva ya no es viva (updateMany count 0), tira VivaCambiadaError y NUNCA crea nada", async () => {
    const { tx, llamadas } = txFalso({ countBaja: 0 });
    await expect(escribirMarcaEnTx(tx, "t1", marca, { id: "viva-1" }, { origen: "manual" })).rejects.toBeInstanceOf(
      VivaCambiadaError,
    );
    // No reporta éxito sobre una fila que otra escritura ya reemplazó/quitó.
    expect(llamadas).toEqual(["updateMany"]);
  });

  it("CONTROL NEGATIVO: sin viva (alta nueva), no hay ningún update/updateMany — sólo create", async () => {
    const { tx, llamadas, asistencia } = txFalso();
    await escribirMarcaEnTx(tx, "t1", marca, null, { origen: "manual" });
    expect(llamadas).toEqual(["create"]);
    expect(asistencia.update).not.toHaveBeenCalled();
    expect(asistencia.updateMany).not.toHaveBeenCalled();
  });

  it("sin estado (quitar mal enrutado): tira, no crea una fila fantasma", async () => {
    const { tx } = txFalso();
    const quitar: MarcaNormalizada = { ...marca, quitar: true, estado: null };
    await expect(escribirMarcaEnTx(tx, "t1", quitar, null, { origen: "manual" })).rejects.toThrow();
  });
});
