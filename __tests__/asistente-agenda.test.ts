/**
 * El dominio `agenda`: actividades, citas y recordatorios dictados.
 *
 * Lo que se fija acá es el bug que este dominio podía tener y ninguno de los
 * otros: la fecha va AL REVÉS que en plata. `fechaValida()` de `plata/comun.ts`
 * rechaza fechas futuras a propósito (un gasto se anota cuando ya salió la
 * plata); una cita sin futuro no es una cita. Reusar aquél habría hecho que
 * «recordame mañana» fallara con «esa fecha es futura».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockCreate, mockList, mockUpdate, mockMarkOverdue } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockList: vi.fn(),
  mockUpdate: vi.fn(),
  mockMarkOverdue: vi.fn(),
}));

vi.mock("@/lib/db/reminders.db", () => ({
  RemindersDB: {
    create: mockCreate,
    list: mockList,
    updateForTenant: mockUpdate,
    markOverdue: mockMarkOverdue,
  },
}));

const { agendaAgent } = await import("@/lib/agents/domains/agenda.agent");

const ctx = { tenantId: "t1", traceId: "tr" };
const tarea = (action: string, payload: Record<string, unknown> = {}) =>
  ({
    id: "t", domain: "agenda", action, payload, priority: "normal", status: "running",
    tenantId: "t1", createdAt: "2026-09-05T00:00:00.000Z", traceId: "tr",
  }) as never;

/** Una fecha siempre futura, para que el test no venza con el calendario. */
const enDias = (n: number) => new Date(Date.now() + n * 86_400_000);
const iso = (d: Date) => d.toISOString().slice(0, 10);

beforeEach(() => vi.clearAllMocks());

describe("agendar — la fecha es futura, al revés que un gasto", () => {
  it("acepta una fecha futura (lo que plata rechazaría)", async () => {
    mockCreate.mockResolvedValue({ id: "r1" });
    const r = await agendaAgent.execute(
      tarea("agendar", { titulo: "llamar al ingeniero", cuando: iso(enDias(3)) }),
      ctx as never,
    );
    expect(r.success).toBe(true);
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("rechaza una fecha que ya pasó, explicando qué hacer", async () => {
    const r = await agendaAgent.execute(
      tarea("agendar", { titulo: "algo", cuando: iso(enDias(-10)) }),
      ctx as never,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/ya pasó/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("tolera el mismo día: «recordame hoy a las 8» dictado a las 9 sigue valiendo", async () => {
    mockCreate.mockResolvedValue({ id: "r1" });
    const hace2h = new Date(Date.now() - 2 * 3600_000).toISOString();
    const r = await agendaAgent.execute(tarea("agendar", { titulo: "x", cuando: hace2h }), ctx as never);
    expect(r.success).toBe(true);
  });

  it("sin fecha NO asume hoy: pide el dato en vez de inventarlo", async () => {
    const r = await agendaAgent.execute(tarea("agendar", { titulo: "llamar" }), ctx as never);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/CUÁNDO/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("sin título tampoco escribe", async () => {
    const r = await agendaAgent.execute(tarea("agendar", { cuando: iso(enDias(1)) }), ctx as never);
    expect(r.success).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("un año delirante se frena", async () => {
    const r = await agendaAgent.execute(
      tarea("agendar", { titulo: "x", cuando: "2999-01-01" }),
      ctx as never,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/año/i);
  });
});

describe("agendar — el ensayo no escribe", () => {
  it("`__validar` devuelve el resumen y NO toca la base", async () => {
    const r = await agendaAgent.execute(
      tarea("agendar", { titulo: "llamar al ingeniero", cuando: iso(enDias(2)), __validar: true }),
      ctx as never,
    );
    expect(r.success).toBe(true);
    expect((r.data as { resumen: string }).resumen).toMatch(/llamar al ingeniero/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("el resumen nombra al responsable cuando lo hay", async () => {
    const r = await agendaAgent.execute(
      tarea("agendar", { titulo: "revisar el tractor", cuando: iso(enDias(2)), responsable: "Juan", __validar: true }),
      ctx as never,
    );
    expect((r.data as { resumen: string }).resumen).toMatch(/Juan/);
  });
});

describe("agendar — se queda dentro de lo que la pantalla entiende", () => {
  it("un tipo inventado cae en `tarea`, no se guarda tal cual", async () => {
    mockCreate.mockResolvedValue({ id: "r1" });
    await agendaAgent.execute(
      tarea("agendar", { titulo: "x", cuando: iso(enDias(1)), tipo: "cosa-rara" }),
      ctx as never,
    );
    expect(mockCreate.mock.calls[0][1].type).toBe("tarea");
  });

  it("una prioridad inventada cae en `media`", async () => {
    mockCreate.mockResolvedValue({ id: "r1" });
    await agendaAgent.execute(
      tarea("agendar", { titulo: "x", cuando: iso(enDias(1)), prioridad: "urgentísima" }),
      ctx as never,
    );
    expect(mockCreate.mock.calls[0][1].priority).toBe("media");
  });

  it("el responsable viaja en la descripción, porque Reminder no tiene ese campo", async () => {
    mockCreate.mockResolvedValue({ id: "r1" });
    await agendaAgent.execute(
      tarea("agendar", { titulo: "x", cuando: iso(enDias(1)), responsable: "Rosa" }),
      ctx as never,
    );
    expect(mockCreate.mock.calls[0][1].description).toMatch(/Responsable: Rosa/);
  });

  it("no lo generó el sistema: `autoGenerated` va en false", async () => {
    mockCreate.mockResolvedValue({ id: "r1" });
    await agendaAgent.execute(tarea("agendar", { titulo: "x", cuando: iso(enDias(1)) }), ctx as never);
    expect(mockCreate.mock.calls[0][1].autoGenerated).toBe(false);
  });
});

describe("ver — lo que viene", () => {
  it("marca los vencidos ANTES de listar: si no, algo de ayer se ve «pendiente»", async () => {
    mockList.mockResolvedValue([]);
    await agendaAgent.execute(tarea("ver"), ctx as never);
    expect(mockMarkOverdue).toHaveBeenCalledBefore(mockList);
  });

  it("deja fuera lo ya completado y lo que cae después de la ventana", async () => {
    mockList.mockResolvedValue([
      { id: "a", title: "viene", description: "", status: "pendiente", priority: "media", dueDate: enDias(2) },
      { id: "b", title: "hecho", description: "", status: "completado", priority: "media", dueDate: enDias(2) },
      { id: "c", title: "lejos", description: "", status: "pendiente", priority: "media", dueDate: enDias(40) },
    ]);
    const r = await agendaAgent.execute(tarea("ver", { dias: 7 }), ctx as never);
    const agenda = (r.data as { agenda: Array<{ que: string }> }).agenda;
    expect(agenda.map((x) => x.que)).toEqual(["viene"]);
  });

  it("da su VEREDICTO, no sólo la lista", async () => {
    mockList.mockResolvedValue([]);
    const r = await agendaAgent.execute(tarea("ver"), ctx as never);
    expect((r.data as { resumen: string }).resumen).toMatch(/No hay nada agendado/);
  });
});

describe("completar", () => {
  it("no inventa: un id que no existe se rechaza", async () => {
    mockList.mockResolvedValue([]);
    const r = await agendaAgent.execute(tarea("completar", { id: "no-existe" }), ctx as never);
    expect(r.success).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("sin id pide buscarlo primero", async () => {
    const r = await agendaAgent.execute(tarea("completar", {}), ctx as never);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/agenda_ver/);
  });

  it("marcar dos veces no falla: la segunda avisa que ya estaba", async () => {
    mockList.mockResolvedValue([
      { id: "a", title: "x", description: "", status: "completado", priority: "media", dueDate: enDias(1) },
    ]);
    const r = await agendaAgent.execute(tarea("completar", { id: "a" }), ctx as never);
    expect(r.success).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
