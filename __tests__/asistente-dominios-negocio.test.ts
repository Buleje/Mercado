/**
 * Los dominios que el asistente aprendió a leer: caja, cobranzas y documentos.
 *
 * Cada `it` fija una decisión de negocio que, mal hecha, produce un número que
 * suena bien y está mal: sumar un adelanto cancelado, contar Yape como plata
 * del cajón, o llamar "por vencer" a un contrato que venció hace dos años.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockGetOpen, mockFiadosList, mockAdelantosList, mockDocsList, mockDocsExpiring } = vi.hoisted(() => ({
  mockGetOpen: vi.fn(),
  mockFiadosList: vi.fn(),
  mockAdelantosList: vi.fn(),
  mockDocsList: vi.fn(),
  mockDocsExpiring: vi.fn(),
}));

vi.mock("@/lib/db/sales.db", () => ({ CashRegistersDB: { getOpen: mockGetOpen } }));
vi.mock("@/lib/db/fiados.db", () => ({ FiadosDB: { list: mockFiadosList } }));
vi.mock("@/lib/db/adelantos.db", () => ({ AdelantosDB: { list: mockAdelantosList } }));
vi.mock("@/lib/db/documents.db", () => ({
  DocumentsDB: { list: mockDocsList, listExpiring: mockDocsExpiring },
}));

const { cajaAgent } = await import("@/lib/agents/domains/caja.agent");
const { cobranzasAgent } = await import("@/lib/agents/domains/cobranzas.agent");
const { documentosAgent } = await import("@/lib/agents/domains/documentos.agent");

const ctx = { tenantId: "t1", traceId: "tr" };
const tarea = (domain: string, action: string, payload: Record<string, unknown> = {}) =>
  ({
    id: "t", domain, action, payload, priority: "normal", status: "running",
    tenantId: "t1", createdAt: "2026-08-12T00:00:00.000Z", traceId: "tr",
  }) as never;

beforeEach(() => vi.clearAllMocks());

describe("caja — el efectivo esperado", () => {
  it("suma apertura + efectivo que entró − salidas; Yape NO cuenta como plata del cajón", async () => {
    mockGetOpen.mockResolvedValue({
      openedAt: "2026-08-12T08:00:00.000Z",
      openingAmount: 100,
      movements: [
        { type: "ingreso", amount: 30, method: "efectivo" },
        { type: "ingreso", amount: 200, method: "yape" },
        { type: "egreso", amount: 15 },
      ],
    });
    const r = await cajaAgent.execute(tarea("caja", "estado"), ctx);
    const d = r.data as { efectivoEsperado: number; entradas: { total: number; porMetodo: Record<string, number> } };
    // 100 + 30 − 15 = 115. Los 200 de Yape entran al total pero NO al cajón.
    expect(d.efectivoEsperado).toBe(115);
    expect(d.entradas.total).toBe(230);
    expect(d.entradas.porMetodo).toEqual({ efectivo: 30, yape: 200 });
  });

  it("sin caja abierta lo dice, no devuelve ceros que parezcan un cierre", async () => {
    mockGetOpen.mockResolvedValue(null);
    const d = (await cajaAgent.execute(tarea("caja", "estado"), ctx)).data as { abierta: boolean };
    expect(d.abierta).toBe(false);
  });

  it("aclara que el esperado es un cálculo, no un conteo", async () => {
    mockGetOpen.mockResolvedValue({ openingAmount: 0, movements: [] });
    const d = (await cajaAgent.execute(tarea("caja", "estado"), ctx)).data as { aclaracion: string };
    expect(d.aclaracion).toContain("contando");
  });
});

describe("cobranzas — fiados", () => {
  it("sólo ACTIVO y VENCIDO son deuda: PAGADO y CANCELADO quedan afuera", async () => {
    mockFiadosList.mockResolvedValue([
      { customerId: "999", customerName: "Ana", saldo: 50, total: 50, status: "ACTIVO", createdAt: "2026-08-01" },
      { customerId: "888", customerName: "Luis", saldo: 80, total: 80, status: "PAGADO", createdAt: "2026-08-01" },
      { customerId: "777", customerName: "Eva", saldo: 20, total: 20, status: "CANCELADO", createdAt: "2026-08-01" },
      { customerId: "666", customerName: "Juan", saldo: 30, total: 30, status: "VENCIDO", createdAt: "2026-08-01" },
    ]);
    const d = (await cobranzasAgent.execute(tarea("cobranzas", "fiados"), ctx)).data as {
      totalPorCobrar: number; deudores: number;
    };
    expect(d.totalPorCobrar).toBe(80); // 50 + 30
    expect(d.deudores).toBe(2);
  });

  it("separa lo que lleva más de 30 días — es lo que no se cobra solo", async () => {
    const viejo = new Date(Date.now() - 60 * 86_400_000).toISOString();
    mockFiadosList.mockResolvedValue([
      { customerId: "1", saldo: 100, total: 100, status: "ACTIVO", createdAt: viejo },
      { customerId: "2", saldo: 40, total: 40, status: "ACTIVO", createdAt: new Date().toISOString() },
    ]);
    const d = (await cobranzasAgent.execute(tarea("cobranzas", "fiados"), ctx)).data as {
      masDe30Dias: { cantidad: number; monto: number };
    };
    expect(d.masDe30Dias).toEqual({ cantidad: 1, monto: 100 });
  });
});

describe("cobranzas — adelantos", () => {
  it("un adelanto CANCELADO no es deuda (el bug que infló el saldo del módulo)", async () => {
    mockAdelantosList.mockResolvedValue([
      { beneficiarioId: "b1", beneficiario: { nombre: "Victor" }, montoAdelantado: 17000, saldoPendiente: 17000, status: "ABIERTO", fechaAdelanto: "2026-08-03" },
      { beneficiarioId: "b2", beneficiario: { nombre: "Rosa" }, montoAdelantado: 500, saldoPendiente: 500, status: "CANCELADO", fechaAdelanto: "2026-08-03" },
    ]);
    const d = (await cobranzasAgent.execute(tarea("cobranzas", "adelantos"), ctx)).data as {
      totalPendiente: number; personas: number;
    };
    expect(d.totalPendiente).toBe(17000);
    expect(d.personas).toBe(1);
  });

  it("un adelanto ya liquidado (saldo 0) tampoco aparece", async () => {
    mockAdelantosList.mockResolvedValue([
      { beneficiarioId: "b1", beneficiario: { nombre: "Victor" }, montoAdelantado: 900, saldoPendiente: 0, status: "LIQUIDADO", fechaAdelanto: "2026-07-01" },
    ]);
    const d = (await cobranzasAgent.execute(tarea("cobranzas", "adelantos"), ctx)).data as { personas: number };
    expect(d.personas).toBe(0);
  });
});

describe("documentos — vencidos ≠ por vencer", () => {
  it("un contrato que venció hace años NO se reporta como 'por vencer'", async () => {
    const ayer = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
    const enUnaSemana = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    mockDocsExpiring.mockResolvedValue([
      { name: "CONTRATO VIEJO.pdf", category: "contratos", expiresAt: "2024-01-27" },
      { name: "Seguro.pdf", category: "contratos", expiresAt: ayer },
      { name: "Licencia.pdf", category: "legal", expiresAt: enUnaSemana },
    ]);
    const d = (await documentosAgent.execute(tarea("documentos", "por-vencer", { dias: 30 }), ctx)).data as {
      vencidos: { cantidad: number; documentos: { dias: number }[] };
      porVencer: { cantidad: number };
    };
    expect(d.vencidos.cantidad).toBe(2);
    expect(d.porVencer.cantidad).toBe(1);
    expect(d.vencidos.documentos[0].dias).toBeLessThan(-300);
  });

  it("la búsqueda sin resultados lo dice y explica dónde buscó", async () => {
    mockDocsList.mockResolvedValue([]);
    const d = (await documentosAgent.execute(tarea("documentos", "buscar", { texto: "zzz" }), ctx)).data as {
      total: number; mensaje?: string;
    };
    expect(d.total).toBe(0);
    expect(d.mensaje).toContain("texto reconocido");
  });

  it("sin texto no busca: pide qué buscar", async () => {
    const r = await documentosAgent.execute(tarea("documentos", "buscar", {}), ctx);
    expect(r.success).toBe(false);
    expect(mockDocsList).not.toHaveBeenCalled();
  });
});
