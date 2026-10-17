/**
 * Adelantos «sin control» — la regla pura y la cuenta de la DB class.
 *
 * El caso real (Blas, 30-09-2026): S/ 17 000 dados el 03/08, sin vencimiento,
 * sin contrato, 0 entregas, saldo intacto — y ninguna pantalla lo marcaba.
 * Con HEAD fallan todos: ni `lib/adelantos/sin-control.ts` ni
 * `AdelantosDB.sinControl` existían.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  prisma: {
    adelanto: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/db/contrato-propio.db", () => ({ contratoPropio: async () => null, contratoVigente: async () => null }));
vi.mock("@/lib/db/forest-directorio.db", () => ({ ForestDirectorioDB: { getParte: vi.fn() } }));

import {
  DIAS_SIN_ENTREGA,
  motivosSinControl,
  resumirSinControl,
  type AdelantoParaControl,
} from "@/lib/adelantos/sin-control";
import { AdelantosDB } from "@/lib/db/adelantos.db";

/** 30/09/2026 10:00 en Lima. */
const HOY = new Date("2026-09-30T15:00:00.000Z");

/** Mediodía de Lima de un día: así guarda el alta las fechas (`aIsoLocal`). */
const dia = (clave: string) => `${clave}T17:00:00.000Z`;

const ad = (p: Partial<AdelantoParaControl> = {}): AdelantoParaControl => ({
  id: "a1",
  codigoOperacion: "ADL-2026-0005",
  beneficiarioId: "b1",
  nombre: "Juan",
  status: "ABIERTO",
  direccion: "DADO",
  saldoPendiente: 500,
  moneda: "PEN",
  fechaAdelanto: dia("2026-09-25"),
  fechaVencimiento: dia("2026-10-15"),
  entregas: [],
  entregasPactadas: [],
  ...p,
});

const codigos = (a: AdelantoParaControl, ahora = HOY) => motivosSinControl(a, ahora).map((m) => m.codigo);

describe("motivosSinControl — la regla", () => {
  it("el caso de Blas: S/ 17 000 del 03/08 sin entregas ni vencimiento → los dos motivos, con los días", () => {
    const m = motivosSinControl(
      ad({ codigoOperacion: null, saldoPendiente: 17000, fechaAdelanto: dia("2026-08-03"), fechaVencimiento: null }),
      HOY,
    );
    expect(m).toEqual([
      { codigo: "sin-entregas", texto: "Ninguna entrega en 58 días desde que se dio" },
      { codigo: "sin-vencimiento", texto: "Sin fecha de vencimiento" },
    ]);
  });

  it("uno reciente, con fecha a futuro, está bajo control", () => {
    expect(codigos(ad())).toEqual([]);
  });

  it("(a) los 30 días se cuentan en días de Lima, no de UTC", () => {
    const a = ad({ fechaAdelanto: dia("2026-08-31") });
    // 30/09 01:00 UTC = 29/09 20:00 en Lima → 29 días: todavía no.
    expect(codigos(a, new Date("2026-09-30T01:00:00.000Z"))).toEqual([]);
    // 30/09 10:00 en Lima → 30 días justos: ya.
    expect(codigos(a, HOY)).toEqual(["sin-entregas"]);
    expect(DIAS_SIN_ENTREGA).toBe(30);
  });

  it("(a) una entrega reciente lo saca; una anulada no cuenta", () => {
    const viejo = { fechaAdelanto: dia("2026-07-01") };
    expect(codigos(ad({ ...viejo, entregas: [{ fecha: dia("2026-09-20") }] }))).toEqual([]);
    expect(codigos(ad({ ...viejo, entregas: [{ fecha: dia("2026-09-20"), anuladaAt: dia("2026-09-21") }] }))).toEqual([
      "sin-entregas",
    ]);
  });

  it("(a) con entregas viejas se cuenta desde la ÚLTIMA y lo dice", () => {
    const m = motivosSinControl(
      ad({
        fechaAdelanto: dia("2026-06-01"),
        entregas: [{ fecha: dia("2026-07-10") }, { fecha: dia("2026-08-16") }, { fecha: dia("2026-06-20") }],
      }),
      HOY,
    );
    expect(m).toEqual([{ codigo: "sin-entregas", texto: "Sin entregas hace 45 días (la última el 16/08/2026)" }]);
  });

  it("(b) sin vencimiento pero con una cuota pactada pendiente con fecha: tiene fecha, no se marca", () => {
    expect(
      codigos(ad({ fechaVencimiento: null, entregasPactadas: [{ numero: 1, fechaEsperada: dia("2026-10-10"), cumplidaEn: null }] })),
    ).toEqual([]);
  });

  it("(b) con todas las cuotas cumplidas y saldo, vuelve a estar sin fecha", () => {
    expect(
      codigos(
        ad({ fechaVencimiento: null, entregasPactadas: [{ numero: 1, fechaEsperada: dia("2026-09-01"), cumplidaEn: dia("2026-09-01") }] }),
      ),
    ).toEqual(["sin-vencimiento"]);
  });

  it("(c) vencido: dice hace cuánto y qué día", () => {
    expect(motivosSinControl(ad({ fechaVencimiento: dia("2026-09-20") }), HOY)).toEqual([
      { codigo: "vencido", texto: "Vencido hace 10 días (el 20/09/2026)" },
    ]);
  });

  it("(c) vence HOY en Lima no es vencido, aunque en UTC la hora ya pasó", () => {
    // 30/09 18:30 en Lima; la fecha guardada es el 30/09 12:00 de Lima.
    expect(codigos(ad({ fechaVencimiento: dia("2026-09-30") }), new Date("2026-09-30T23:30:00.000Z"))).toEqual([]);
  });

  it("(c) una cuota pactada que pasó sin cumplirse también es vencido — la más vieja", () => {
    const m = motivosSinControl(
      ad({
        fechaVencimiento: null,
        entregasPactadas: [
          { numero: 1, fechaEsperada: dia("2026-09-25"), cumplidaEn: null },
          { numero: 2, fechaEsperada: dia("2026-09-28"), cumplidaEn: null },
        ],
      }),
      HOY,
    );
    expect(m).toEqual([{ codigo: "vencido", texto: "La cuota 1 venció hace 5 días sin cumplirse" }]);
  });

  it("no aplica a lo recibido, a lo cerrado ni a lo que no tiene saldo", () => {
    const suelto = { fechaAdelanto: dia("2026-06-01"), fechaVencimiento: null };
    expect(codigos(ad({ ...suelto, direccion: "RECIBIDO" }))).toEqual([]);
    expect(codigos(ad({ ...suelto, status: "LIQUIDADO" }))).toEqual([]);
    expect(codigos(ad({ ...suelto, status: "CANCELADO" }))).toEqual([]);
    expect(codigos(ad({ ...suelto, saldoPendiente: 0 }))).toEqual([]);
    // Sin dirección (filas de antes de ADR-448) = DADO: sí aplica.
    expect(codigos(ad({ ...suelto, direccion: null }))).toEqual(["sin-entregas", "sin-vencimiento"]);
  });
});

describe("resumirSinControl — la cuenta del aviso", () => {
  it("cuenta, suma por moneda sin cruzar y ordena por saldo", () => {
    const r = resumirSinControl(
      [
        ad({ id: "chico", saldoPendiente: 300, fechaVencimiento: null }),
        ad({ id: "bien" }),
        ad({ id: "grande", saldoPendiente: 17000, fechaAdelanto: dia("2026-08-03"), fechaVencimiento: null, nombre: "  " }),
        ad({ id: "dolares", saldoPendiente: 200, moneda: "USD", fechaVencimiento: dia("2026-09-01") }),
      ],
      HOY,
    );
    expect(r.cantidad).toBe(3);
    expect(r.porMoneda).toEqual({ PEN: 17300, USD: 200 });
    expect(r.adelantos.map((a) => a.id)).toEqual(["grande", "chico", "dolares"]);
    expect(r.adelantos[0].nombre).toBe("—");
  });

  it("sin nada suelto: cero y sin monedas", () => {
    expect(resumirSinControl([ad()], HOY)).toEqual({ cantidad: 0, porMoneda: {}, adelantos: [] });
  });
});

describe("AdelantosDB.sinControl — la cuenta en el servidor", () => {
  beforeEach(() => {
    H.prisma.adelanto.findMany.mockReset();
  });

  it("filtra por el tenant pedido, sólo DADO ABIERTO con saldo, y sólo entregas vivas", async () => {
    H.prisma.adelanto.findMany.mockResolvedValue([]);
    await AdelantosDB.sinControl("t2", HOY);
    const arg = H.prisma.adelanto.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ tenantId: "t2", status: "ABIERTO", saldoPendiente: { gt: 0 }, direccion: "DADO" });
    expect(arg.select.entregas.where).toEqual({ anuladaAt: null });
    expect(arg.select.entregasPactadas.where).toEqual({ cumplidaEn: null, fechaEsperada: { not: null } });
    // Sin tope de filas: un aviso que cuenta de menos miente.
    expect(arg.take).toBeUndefined();
  });

  it("sin tenant no consulta nada", async () => {
    await expect(AdelantosDB.sinControl("", HOY)).rejects.toThrow("tenantId is required");
    expect(H.prisma.adelanto.findMany).not.toHaveBeenCalled();
  });

  it("mapea las filas de la base (Decimal como número) y aplica la regla", async () => {
    H.prisma.adelanto.findMany.mockResolvedValue([
      {
        id: "a17",
        codigoOperacion: null,
        beneficiarioId: "b9",
        status: "ABIERTO",
        direccion: "DADO",
        saldoPendiente: { toString: () => "17000.00", valueOf: () => 17000 },
        moneda: "PEN",
        fechaAdelanto: new Date(dia("2026-08-03")),
        fechaVencimiento: null,
        beneficiario: { nombre: "Maderera del Ucayali" },
        entregas: [],
        entregasPactadas: [],
      },
      {
        id: "ok",
        codigoOperacion: "ADL-2026-0006",
        beneficiarioId: "b1",
        status: "ABIERTO",
        direccion: "DADO",
        saldoPendiente: 800,
        moneda: "PEN",
        fechaAdelanto: new Date(dia("2026-09-20")),
        fechaVencimiento: new Date(dia("2026-10-20")),
        beneficiario: { nombre: "Juan" },
        entregas: [],
        entregasPactadas: [],
      },
    ]);
    const r = await AdelantosDB.sinControl("t1", HOY);
    expect(r.cantidad).toBe(1);
    expect(r.porMoneda).toEqual({ PEN: 17000 });
    expect(r.adelantos[0]).toMatchObject({
      id: "a17",
      codigoOperacion: null,
      nombre: "Maderera del Ucayali",
      saldoPendiente: 17000,
      motivos: [{ codigo: "sin-entregas" }, { codigo: "sin-vencimiento" }],
    });
  });
});
