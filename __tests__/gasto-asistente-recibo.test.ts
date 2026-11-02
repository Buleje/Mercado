/**
 * El recibo en el gasto dictado (ADR-528, carril 2): «tanqueé 12 gal de
 * petróleo para mi camión blanco N12, total 200 soles, recibo E242».
 *
 * Lo que queda fijado:
 *  - el total es el DICHO (200): el precio por galón se deriva y se dice que es
 *    calculado — nunca al revés (ADR-387);
 *  - el n.º de recibo y la foto salen en la tarjeta del ensayo y en las notas
 *    de los dos libros (máquina → Activos, sin máquina → Gastos);
 *  - una foto de OTRO negocio es un error, no una nota.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  getOne: vi.fn(),
  addExpense: vi.fn(),
  expensesAdd: vi.fn(),
  docGetById: vi.fn(),
  conRecibo: vi.fn(),
  gastoConRecibo: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/agents/context", () => ({
  scopedLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock("@/lib/db/assets.db", () => ({
  AssetsDB: { getOne: h.getOne, addExpense: h.addExpense, gastoConRecibo: h.gastoConRecibo },
}));
vi.mock("@/lib/db/expenses.db", () => ({ ExpensesDB: { conRecibo: h.conRecibo } }));
vi.mock("@/lib/db/finance.db", () => ({ ExpensesDB: { add: h.expensesAdd } }));
vi.mock("@/lib/db/documents.db", () => ({ DocumentsDB: { getById: h.docGetById } }));
vi.mock("@/lib/db/adelantos.db", () => ({ AdelantosDB: {} }));
vi.mock("@/lib/db/fiados.db", () => ({ FiadosDB: {} }));
vi.mock("@/lib/db/sales.db", () => ({ CashRegistersDB: {} }));
vi.mock("@/lib/db/purchases.db", () => ({ SuppliersDB: {}, PurchasesDB: {} }));
vi.mock("@/lib/db/products.db", () => ({ ProductsDB: {} }));
vi.mock("@/lib/db/treasury.db", () => ({ TreasuryDB: {} }));
vi.mock("@/lib/db/forest-flete.db", () => ({ ForestFleteDB: {} }));

const { registrarGasto, precioDerivado } = await import("@/lib/agents/domains/plata/escrituras");

const ctx = { tenantId: "tenant-a", traceId: "t", actorRole: "admin", actorId: "u1" };
const camion = { id: "maq-n12", name: "Camión blanco", plate: "N12" };
const foto = { id: "doc-foto", name: "recibo.jpg" };

/** Lo que el modelo arma de la frase de Brandon. */
const dictado = (extra: Record<string, unknown> = {}) => ({
  descripcion: "Petróleo camión blanco",
  categoria: "combustible",
  cantidad: 12,
  monto: 200,
  maquinaId: "maq-n12",
  comprobante: "E242",
  ...extra,
});

const tarea = (payload: Record<string, unknown>) => ({
  id: "t1",
  priority: "normal" as const,
  status: "pending" as const,
  createdAt: "2026-11-01T00:00:00.000Z",
  traceId: "t",
  domain: "plata" as const,
  action: "registrar-gasto",
  payload,
  tenantId: "tenant-a",
});

beforeEach(() => {
  vi.clearAllMocks();
  h.getOne.mockImplementation(async (t: string, id: string) => (t === "tenant-a" && id === camion.id ? camion : null));
  h.docGetById.mockImplementation(async (t: string, id: string) => (t === "tenant-a" && id === foto.id ? foto : null));
  h.addExpense.mockResolvedValue({ id: "gasto-1" });
  h.expensesAdd.mockResolvedValue({ id: "gasto-2" });
  h.conRecibo.mockResolvedValue(null);
  h.gastoConRecibo.mockResolvedValue(null);
});

describe("el caso de Brandon: 12 gal, total 200, recibo E242", () => {
  it("el ensayo muestra el recibo, el total dicho y el precio por galón calculado", async () => {
    const r = await registrarGasto(tarea({ ...dictado({ documentoId: foto.id }), __validar: true }), ctx);
    expect(r.success).toBe(true);
    const d = r.data as Record<string, unknown>;
    expect(d.monto).toBe(200);
    expect(d.precioUnitarioCalculado).toBe(16.67);
    expect(d.comprobante).toBe("E242");
    expect(d.documentoId).toBe(foto.id);
    expect(d.resumen).toContain("Recibo E242");
    expect(d.resumen).toContain("foto: Documentos doc-foto");
    expect(d.resumen).toMatch(/16[.,]67 por gal \(calculado\)/);
    expect(d.destino).toBe("activos");
    // El ensayo no escribe.
    expect(h.addExpense).not.toHaveBeenCalled();
  });

  it("al confirmar va al libro de la máquina con el total dicho y el recibo en las notas", async () => {
    const r = await registrarGasto(tarea(dictado({ documentoId: foto.id })), ctx);
    expect(r.success).toBe(true);
    expect(h.expensesAdd).not.toHaveBeenCalled();
    const fila = h.addExpense.mock.calls[0][1];
    expect(fila.amount).toBe(200);
    expect(fila.gallons).toBe(12);
    expect(fila.unitPrice).toBe(16.67);
    expect(fila.notes).toContain("Recibo E242 · foto: Documentos doc-foto");
  });

  it("sin máquina va a Gastos, también con el recibo en las notas", async () => {
    const r = await registrarGasto(tarea(dictado({ maquinaId: undefined, categoria: "transporte" })), ctx);
    expect(r.success).toBe(true);
    expect(h.addExpense).not.toHaveBeenCalled();
    const fila = h.expensesAdd.mock.calls[0][1];
    expect(fila.amount).toBe(200);
    expect(fila.notes).toContain("Recibo E242");
  });
});

describe("la foto tiene que ser de este negocio", () => {
  it("un documentoId ajeno es un error, ya en el ensayo, y no se escribe nada", async () => {
    const r = await registrarGasto(tarea({ ...dictado({ documentoId: "doc-de-otro" }), __validar: true }), ctx);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/No existe un documento/);
    expect(h.docGetById).toHaveBeenCalledWith("tenant-a", "doc-de-otro", "admin");
    expect(h.addExpense).not.toHaveBeenCalled();
    expect(h.expensesAdd).not.toHaveBeenCalled();
  });
});

describe("la regla del total no cambia (ADR-387)", () => {
  it("con precio dictado no se deriva nada: el cálculo es cantidad × precio", async () => {
    const r = await registrarGasto(
      tarea({ ...dictado({ monto: undefined, precioUnitario: 16.5 }), __validar: true }),
      ctx,
    );
    const d = r.data as Record<string, unknown>;
    expect(d.monto).toBe(198);
    expect(d.precioUnitarioCalculado).toBeNull();
  });

  it("si total y cantidad × precio no cuadran, sigue preguntando", async () => {
    const r = await registrarGasto(tarea({ ...dictado({ precioUnitario: 15 }), __validar: true }), ctx);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/No cuadra/);
  });

  it("precioDerivado solo actúa con total y cantidad, sin precio", () => {
    expect(precioDerivado(200, 12, null, "gal")?.valor).toBe(16.67);
    expect(precioDerivado(200, 12, 16, "gal")).toBeNull();
    expect(precioDerivado(null, 12, null, "gal")).toBeNull();
    expect(precioDerivado(200, 0, null, "gal")).toBeNull();
  });
});

describe("total, cantidad Y precio dictados que cuadran: va lo DICHO", () => {
  // 25 × 7,999 = 199,98: dentro de los S/ 0,05, pero lo que salió del bolsillo fue 200.
  const tresNumeros = (extra: Record<string, unknown> = {}) => dictado({ cantidad: 25, precioUnitario: 7.999, ...extra });

  it("máquina: el ensayo y la fila guardan 200,00, no 199,98; el precio queda como dato", async () => {
    const e = await registrarGasto(tarea({ ...tresNumeros(), __validar: true }), ctx);
    expect((e.data as Record<string, unknown>).monto).toBe(200);
    await registrarGasto(tarea(tresNumeros()), ctx);
    const fila = h.addExpense.mock.calls[0][1];
    expect(fila.amount).toBe(200);
    expect(fila.unitPrice).toBe(7.999);
    expect(fila.gallons).toBe(25);
  });

  it("sin máquina: Gastos guarda 200,00 y la multiplicación en las notas", async () => {
    await registrarGasto(tarea(tresNumeros({ maquinaId: undefined, categoria: "transporte" })), ctx);
    const fila = h.expensesAdd.mock.calls[0][1];
    expect(fila.amount).toBe(200);
    expect(fila.notes).toMatch(/25 × S\/ 8[.,]00 = S\/ 199[.,]98 \(cuadra con el total dicho\)/);
  });

  it("la regla de frenar si no cuadra por más de S/ 0,05 sigue", async () => {
    const r = await registrarGasto(tarea({ ...dictado({ cantidad: 25, precioUnitario: 7.99 }), __validar: true }), ctx);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/No cuadra/);
  });
});

describe("recibo ya anotado: la tarjeta avisa, no frena", () => {
  it("en Gastos: el resumen dice la fecha y el monto del anterior", async () => {
    h.conRecibo.mockResolvedValue({ id: "g-viejo", date: "2026-10-30T05:00:00.000Z", amount: 150 });
    const r = await registrarGasto(tarea({ ...dictado({ maquinaId: undefined, categoria: "transporte" }), __validar: true }), ctx);
    expect(r.success).toBe(true);
    const d = r.data as Record<string, unknown>;
    expect(d.resumen).toMatch(/^⚠️ El recibo E242 ya está anotado el 30\/10\/2026 \(S\/\s?150/);
    expect(h.conRecibo).toHaveBeenCalledWith("tenant-a", "E242");
    expect(h.gastoConRecibo).toHaveBeenCalledWith("tenant-a", "E242");
  });

  it("en el libro de la máquina también avisa", async () => {
    h.gastoConRecibo.mockResolvedValue({ id: "a-viejo", date: "2026-10-29T05:00:00.000Z", amount: 200, maquina: "Camión blanco" });
    const r = await registrarGasto(tarea({ ...dictado(), __validar: true }), ctx);
    expect(r.success).toBe(true);
    expect((r.data as Record<string, unknown>).resumen).toContain("⚠️ El recibo E242 ya está anotado el 29/10/2026");
  });

  it("recibo nuevo: sin aviso; sin recibo: ni se busca", async () => {
    const r = await registrarGasto(tarea({ ...dictado(), __validar: true }), ctx);
    expect((r.data as Record<string, unknown>).resumen).not.toContain("⚠️");
    await registrarGasto(tarea({ ...dictado({ comprobante: undefined }), __validar: true }), ctx);
    expect(h.conRecibo).toHaveBeenCalledTimes(1);
  });
});

describe("tolerancia de 5 céntimos, contada en céntimos (no en float)", () => {
  it("25 × 7,998 = 199,95 contra 200 dicho: diferencia de 5 céntimos justos → cuadra y va lo dicho", async () => {
    const { resolverMonto } = await import("@/lib/agents/domains/plata/escrituras");
    const r = resolverMonto(200, 25, 7.998);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.monto).toBe(200);
  });
  it("6 céntimos ya no cuadra y pregunta", async () => {
    const { resolverMonto } = await import("@/lib/agents/domains/plata/escrituras");
    const r = resolverMonto(200, 25, 7.9976);
    expect(r.ok).toBe(false);
  });
});
