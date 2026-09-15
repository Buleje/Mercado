/**
 * __tests__/adelantos-beneficiario-cross-tenant.test.ts
 *
 * El beneficiario de un adelanto tiene que ser de ESTE negocio.
 *
 * Encontrado en la auditoría del 2026-08-12: `create()` buscaba la persona con
 * `{ id, tenantId }` pero sólo usaba el resultado para el tope de crédito. Si el
 * id era de otro tenant, `benef` venía `null`, el código seguía derecho y creaba
 * el adelanto con el id crudo del body. La FK del schema es de una sola columna
 * (sin `tenantId` compuesto), así que Postgres lo aceptaba, y a partir de ahí:
 *
 *   · el 201 y cada GET devolvían la ficha COMPLETA de esa persona ajena
 *     —documento, dirección, banco, CCI— porque la lectura incluye la relación;
 *   · el otro tenant no podía borrar a su propio beneficiario, porque la FK es
 *     `onDelete: Restrict` y había un adelanto invisible apuntándole.
 *
 * Estos tests fijan el corte temprano, en las dos puertas que lo permitían.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockBeneficiarioFindFirst = vi.fn();
const mockAdelantoCreate = vi.fn();
const mockAdelantoFindMany = vi.fn();
const mockAdelantoAggregate = vi.fn();
const mockRecurrenteCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adelantoBeneficiario: {
      findFirst: (...a: unknown[]) => mockBeneficiarioFindFirst(...a),
      updateMany: vi.fn(),
    },
    adelanto: {
      create: (...a: unknown[]) => mockAdelantoCreate(...a),
      findMany: (...a: unknown[]) => mockAdelantoFindMany(...a),
      aggregate: (...a: unknown[]) => mockAdelantoAggregate(...a),
    },
    adelantoRecurrente: {
      create: (...a: unknown[]) => mockRecurrenteCreate(...a),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { AdelantosDB } from "@/lib/db/adelantos.db";

const TENANT = "bodega-a";
/** Un id que existe, pero en el negocio de al lado. */
const BENEFICIARIO_AJENO = "benef-de-otro-tenant";

beforeEach(() => {
  vi.clearAllMocks();
  mockAdelantoFindMany.mockResolvedValue([]);
  mockAdelantoAggregate.mockResolvedValue({ _sum: { saldoPendiente: 0 } });
});

describe("AdelantosDB.create — la persona tiene que ser de este negocio", () => {
  it("no crea el adelanto si el beneficiario es de otro tenant", async () => {
    // Así responde Postgres cuando el id existe pero pertenece a otro tenant:
    // el `where` con tenantId no matchea nada.
    mockBeneficiarioFindFirst.mockResolvedValue(null);

    await expect(
      AdelantosDB.create(TENANT, { beneficiarioId: BENEFICIARIO_AJENO, montoAdelantado: 500 }),
    ).rejects.toThrow(/no existe en este negocio/i);

    // Lo que importa no es el mensaje: es que NUNCA se escribió la fila.
    expect(mockAdelantoCreate).not.toHaveBeenCalled();
  });

  it("con la persona del propio tenant, sigue creando normal", async () => {
    mockBeneficiarioFindFirst.mockResolvedValue({ nombre: "Don Juan", limiteCredito: null });
    mockAdelantoCreate.mockResolvedValue({
      id: "adl-1", tenantId: TENANT, beneficiarioId: "benef-propio",
      modalidad: "CUENTA_CORRIENTE", montoAdelantado: 500, moneda: "PEN",
      fechaAdelanto: new Date(), fechaVencimiento: null, status: "ABIERTO",
      saldoPendiente: 500, codigoOperacion: "ADL-2026-0001", notas: null,
      reciboManual: null, comprobanteUrl: null, createdAt: new Date(), updatedAt: new Date(),
      entregas: [], entregasPactadas: [],
    });

    const r = await AdelantosDB.create(TENANT, { beneficiarioId: "benef-propio", montoAdelantado: 500 });

    expect(mockAdelantoCreate).toHaveBeenCalledTimes(1);
    expect(r.id).toBe("adl-1");
  });

  it("el tope de crédito sigue avisando (no se rompió al agregar el corte)", async () => {
    mockBeneficiarioFindFirst.mockResolvedValue({ nombre: "Doña Rosa", limiteCredito: 1000 });
    mockAdelantoAggregate.mockResolvedValue({ _sum: { saldoPendiente: 800 } });

    await expect(
      AdelantosDB.create(TENANT, { beneficiarioId: "benef-propio", montoAdelantado: 500 }),
    ).rejects.toThrow(/límite de crédito de Doña Rosa/i);
    expect(mockAdelantoCreate).not.toHaveBeenCalled();
  });
});

describe("AdelantosDB.createRecurrente — la misma puerta, por el otro lado", () => {
  it("no programa un adelanto recurrente contra la persona de otro tenant", async () => {
    mockBeneficiarioFindFirst.mockResolvedValue(null);

    await expect(
      AdelantosDB.createRecurrente(TENANT, {
        beneficiarioId: BENEFICIARIO_AJENO, monto: 300, frecuencia: "mensual", diaMes: 5,
      }),
    ).rejects.toThrow(/no existe en este negocio/i);

    expect(mockRecurrenteCreate).not.toHaveBeenCalled();
  });
});
