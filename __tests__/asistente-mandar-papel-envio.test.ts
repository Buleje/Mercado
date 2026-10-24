/**
 * Mandar un papel por WhatsApp desde el asistente: el ensayo (la pregunta
 * «¿Mando X a Alex?») y el envío tras el «Sí».
 *
 * NUNCA sale un WhatsApp real: `enviarWhatsAppDelNegocio` está simulado (el
 * `.env.local` tiene credenciales de verdad). Lo que se cuida acá:
 * - el ensayo no crea enlaces ni manda nada;
 * - el papel se busca CON el rol (lo que su Archivo no le muestra no existe);
 * - los colaboradores sólo entran para quien ve sus datos en RR.HH.;
 * - un número fuera de los contactos se avisa en la pregunta y no sale sin ese «Sí»;
 * - si el WhatsApp no sale, el enlace se anula; si no queda auditado, no sale;
 * - el log del servidor no lleva el número entero (Ley 29733).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const m = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  createShare: vi.fn(),
  revokeShare: vi.fn(),
  logMany: vi.fn(),
  log: vi.fn(),
  membrete: vi.fn(),
  addLog: vi.fn(),
  listarColab: vi.fn(),
  check: vi.fn(),
  enviar: vi.fn(),
  contactos: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/db/documents.db", () => ({
  DocumentsDB: {
    list: m.list,
    getById: m.getById,
    createShare: m.createShare,
    revokeShare: m.revokeShare,
    logMany: m.logMany,
    log: m.log,
  },
}));
vi.mock("@/lib/db/membrete.db", () => ({ MembreteDB: { del: m.membrete } }));
vi.mock("@/lib/db/notifications.db", () => ({ NotificationLogsDB: { add: m.addLog } }));
vi.mock("@/lib/db/rrhh-colaboradores.db", () => ({ ColaboradoresDB: { listar: m.listarColab } }));
vi.mock("@/lib/rate-limit", () => ({ createDistributedRateLimiter: () => ({ check: m.check }) }));
vi.mock("@/lib/whatsapp-tenant", () => ({ enviarWhatsAppDelNegocio: m.enviar }));
vi.mock("@/lib/forestal/contactos-envio.server", () => ({ contactosDelNegocio: m.contactos }));
vi.mock("@/lib/documents/fotos-de-maquina", () => ({ TAGS_FOTOS_DE_MAQUINA: ["foto-maquina"] }));
vi.mock("@/lib/logger", () => ({
  logger: { info: m.logInfo, warn: m.logWarn, error: m.logError, debug: vi.fn() },
}));

const { prepararEnvio, mandarPapel, TIPO_LOG_PAPEL } = await import("@/lib/asistente/mandar-papel.server");
const { documentosAgent } = await import("@/lib/agents/domains/documentos.agent");

const RESOLUCION = { id: "doc-1", name: "Resolución de plantación.pdf", tags: [] };
const ALEX = { nombre: "Alex Ríos", telefono: "51987654123", fuente: "directorio" };
const ALEX_M = { nombre: "Alex Mendoza", telefono: "51911222333", fuente: "adelantos" };
const ctx = (actorRole?: string) => ({ tenantId: "t1", traceId: "tr", actorRole, actorId: "qaadmin" });

beforeEach(() => {
  vi.clearAllMocks();
  m.list.mockResolvedValue([RESOLUCION]);
  m.getById.mockResolvedValue(RESOLUCION);
  m.contactos.mockResolvedValue([ALEX]);
  m.listarColab.mockResolvedValue([]);
  m.check.mockResolvedValue(true);
  m.membrete.mockResolvedValue({ nombre: "Inversiones Blas" });
  m.createShare.mockResolvedValue({ id: "sh-1", token: "tok1234567890", expiresAt: "2026-10-31T05:00:00.000Z" });
  m.revokeShare.mockResolvedValue(true);
  m.logMany.mockResolvedValue(undefined);
  m.log.mockResolvedValue(undefined);
  m.addLog.mockResolvedValue({ id: 1 });
  m.enviar.mockResolvedValue({ ok: true, via: "meta", modo: "plantilla", wamid: "wamid.X", puedeNoLlegar: false });
});

/** Nada de esto puede pasar antes del «Sí». */
function noSalioNada() {
  expect(m.createShare).not.toHaveBeenCalled();
  expect(m.enviar).not.toHaveBeenCalled();
  expect(m.logMany).not.toHaveBeenCalled();
  expect(m.addLog).not.toHaveBeenCalled();
}

/** El número entero no aparece en ningún log del servidor. */
function logsSinNumero(numero: string) {
  const todo = JSON.stringify([...m.logInfo.mock.calls, ...m.logWarn.mock.calls, ...m.logError.mock.calls]);
  expect(todo).not.toContain(numero);
  expect(todo).not.toContain(numero.slice(2));
}

describe("el ensayo: pregunta y NO manda", () => {
  it("arma la pregunta con el papel, el nombre y el número tapado", async () => {
    const r = await prepararEnvio("t1", { papel: "resolución de plantación", persona: "Alex" }, ctx("admin"));
    expect(r.success).toBe(true);
    const data = r.data as { resumen: string; payloadConfirmado: Record<string, unknown>; mostrar: Record<string, unknown> };
    expect(data.resumen).toBe('¿Mando "Resolución de plantación.pdf" a Alex Ríos (+51 9•• ••• 123)?');
    expect(data.payloadConfirmado).toEqual({ documentoId: "doc-1", telefono: "51987654123", nombre: "Alex Ríos" });
    // La tarjeta (que cualquier admin puede listar) no lleva el número entero.
    expect(JSON.stringify(data.mostrar)).not.toContain("987654123");
    noSalioNada();
    logsSinNumero("51987654123");
  });

  it("busca el papel CON el rol: lo que su Archivo no le muestra, no existe", async () => {
    await prepararEnvio("t1", { papel: "resolución", persona: "Alex" }, ctx("manager"));
    expect(m.list).toHaveBeenCalledWith("t1", expect.objectContaining({ q: "resolución" }), "manager");
    expect(m.contactos).toHaveBeenCalledWith("t1", "manager");
  });

  it("sin rol no hace nada (el tenant y el rol salen de la sesión, nunca del pedido)", async () => {
    const r = await prepararEnvio("t1", { papel: "resolución", persona: "Alex" }, ctx(undefined));
    expect(r.success).toBe(false);
    expect(m.list).not.toHaveBeenCalled();
  });

  it("no encuentra el papel: lo dice y sugiere parecidos", async () => {
    m.list.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "d9", name: "Resolución de aprovechamiento.pdf" }]);
    const r = await prepararEnvio("t1", { papel: "resolución de plantación", persona: "Alex" }, ctx("admin"));
    expect(r.success).toBe(false);
    expect(r.error).toContain("Resolución de aprovechamiento.pdf");
    noSalioNada();
  });

  it("dos papeles parecidos: pregunta cuál, con una frase que se puede repetir", async () => {
    m.list.mockResolvedValue([
      { id: "a", name: "Resolución de plantación 2024.pdf" },
      { id: "b", name: "Resolución de plantación 2025.pdf" },
    ]);
    const r = await prepararEnvio("t1", { papel: "resolución de plantación", persona: "Alex" }, ctx("admin"));
    expect(r.success).toBe(false);
    expect(r.error).toContain("¿Cuál mando?");
    expect(r.error).toMatch(/«manda Resolución de plantación 202[45] a Alex»/);
    noSalioNada();
  });

  it("dos «Alex»: pregunta a cuál, con los números tapados", async () => {
    m.contactos.mockResolvedValue([ALEX, ALEX_M]);
    const r = await prepararEnvio("t1", { papel: "resolución de plantación", persona: "Alex" }, ctx("admin"));
    expect(r.success).toBe(false);
    expect(r.error).toContain("¿A cuál?");
    expect(r.error).toContain("+51 9•• ••• 123");
    expect(r.error).not.toContain("987654123");
    noSalioNada();
  });

  it("nadie se llama así: pide el número, no inventa un contacto", async () => {
    const r = await prepararEnvio("t1", { papel: "resolución", persona: "Rosa" }, ctx("admin"));
    expect(r.success).toBe(false);
    expect(r.error).toContain("«manda resolución a Rosa 987 654 321»");
    noSalioNada();
  });

  it("un número fuera de los contactos se avisa en la pregunta y queda marcado", async () => {
    const r = await prepararEnvio("t1", { papel: "resolución", persona: "Rosa", telefono: "51955000111" }, ctx("admin"));
    expect(r.success).toBe(true);
    const data = r.data as { resumen: string; payloadConfirmado: Record<string, unknown> };
    expect(data.resumen).toContain("no está en tus contactos");
    expect(data.payloadConfirmado.numeroNuevo).toBe(true);
    noSalioNada();
  });

  it("una colaboradora con el mismo celular que un proveedor se encuentra por SU nombre (24-10)", async () => {
    m.contactos.mockResolvedValue([{ nombre: "Distribuidora Ucayali", telefono: "51961000222", fuente: "proveedor" }]);
    m.listarColab.mockResolvedValue([{ nombre: "Rosa Huamán Vela", apodo: null, celular: "961000222" }]);
    const r = await prepararEnvio("t1", { papel: "resolución", persona: "Rosa" }, ctx("admin"));
    expect(r.success).toBe(true);
    expect((r.data as { resumen: string }).resumen).toContain("a Rosa Huamán Vela (+51 9•• ••• 222)");
    noSalioNada();
  });

  it("dos nombres con el mismo número son una persona: no pregunta «¿a cuál?»", async () => {
    m.contactos.mockResolvedValue([{ nombre: "Alex Ríos", telefono: "51987654123", fuente: "envio" }, ALEX]);
    m.listarColab.mockResolvedValue([{ nombre: "Alex Ríos", apodo: null, celular: "987654123" }]);
    const r = await prepararEnvio("t1", { papel: "resolución", persona: "Alex" }, ctx("admin"));
    expect(r.success).toBe(true);
    noSalioNada();
  });

  it("colaboradores sólo para quien ve sus datos en RR.HH.", async () => {
    m.listarColab.mockResolvedValue([{ nombre: "Julio Paredes", apodo: "Don Julio", celular: "966555444" }]);
    const conGestion = await prepararEnvio("t1", { papel: "resolución", persona: "don Julio" }, ctx("admin"));
    expect(conGestion.success).toBe(true);
    expect(m.listarColab).toHaveBeenCalledWith("t1");

    m.listarColab.mockClear();
    const cajero = await prepararEnvio("t1", { papel: "resolución", persona: "don Julio" }, ctx("cajero"));
    expect(m.listarColab).not.toHaveBeenCalled();
    expect(cajero.success).toBe(false);
  });

  it("el agente manda el ensayo (`__validar`) a la pregunta, nunca al envío", async () => {
    const r = await documentosAgent.execute(
      {
        id: "task",
        domain: "documentos",
        action: "mandar-papel",
        payload: { papel: "resolución", persona: "Alex", __validar: true },
        priority: "normal",
        status: "running",
        tenantId: "t1",
        createdAt: new Date().toISOString(),
        traceId: "tr",
      },
      ctx("admin"),
    );
    expect(r.success).toBe(true);
    expect((r.data as { resumen: string }).resumen).toContain("¿Mando");
    noSalioNada();
  });
});

describe("el envío tras el «Sí»", () => {
  const confirmado = { documentoId: "doc-1", telefono: "51987654123", nombre: "Alex Ríos" };

  it("audita, crea el enlace de 7 días, manda el WhatsApp y lo anota en NotificationLog", async () => {
    const r = await mandarPapel("t1", confirmado, ctx("admin"));
    expect(r.success).toBe(true);
    expect((r.data as { confirmacion: string }).confirmacion).toContain('Listo: le mandé "Resolución de plantación.pdf" a Alex Ríos');

    expect(m.getById).toHaveBeenCalledWith("t1", "doc-1", "admin");
    expect(m.createShare).toHaveBeenCalledWith("t1", "doc-1", { createdById: "qaadmin", expiresInDays: 7, viewerRole: "admin" });
    // La auditoría ANTES del envío, y estricta.
    expect(m.logMany.mock.invocationCallOrder[0]).toBeLessThan(m.enviar.mock.invocationCallOrder[0]);
    const [, ids, entrada, opciones] = m.logMany.mock.calls[0];
    expect(ids).toEqual(["doc-1"]);
    expect(entrada).toMatchObject({ action: "share", metadata: { canal: "asistente-whatsapp", detalle: expect.stringContaining("Compartido por WhatsApp a Alex Ríos") } });
    expect(opciones).toEqual({ estricto: true });

    const [tenant, tel, texto] = m.enviar.mock.calls[0];
    expect(tenant).toBe("t1");
    expect(tel).toBe("51987654123");
    expect(texto).toContain("/d/tok1234567890");
    expect(texto).toContain("Inversiones Blas te comparte");

    expect(m.addLog).toHaveBeenCalledWith(expect.objectContaining({ type: TIPO_LOG_PAPEL, status: "sent", recipient: "51987654123" }), "t1");
    expect(m.revokeShare).not.toHaveBeenCalled();
    logsSinNumero("51987654123");
  });

  it("si el WhatsApp no sale, anula el enlace y lo anota como fallido", async () => {
    m.enviar.mockResolvedValue({ ok: false, error: "Meta: (#131047) Re-engagement message", via: "meta" });
    const r = await mandarPapel("t1", confirmado, ctx("admin"));
    expect(r.success).toBe(false);
    expect(r.error).toContain("Anulé el enlace");
    expect(m.revokeShare).toHaveBeenCalledWith("t1", "sh-1", "admin");
    expect(m.addLog).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }), "t1");
    logsSinNumero("51987654123");
  });

  it("si la auditoría falla, no manda nada y anula el enlace", async () => {
    m.logMany.mockRejectedValue(new Error("db caída"));
    const r = await mandarPapel("t1", confirmado, ctx("admin"));
    expect(r.success).toBe(false);
    expect(m.enviar).not.toHaveBeenCalled();
    expect(m.revokeShare).toHaveBeenCalledWith("t1", "sh-1", "admin");
  });

  it("un número que no está en sus contactos no sale sin el «Sí» que lo mostró entero", async () => {
    const r = await mandarPapel("t1", { ...confirmado, telefono: "51955000111" }, ctx("admin"));
    expect(r.success).toBe(false);
    expect(m.createShare).not.toHaveBeenCalled();
    expect(m.enviar).not.toHaveBeenCalled();

    const conSi = await mandarPapel("t1", { ...confirmado, telefono: "51955000111", numeroNuevo: true }, ctx("admin"));
    expect(conSi.success).toBe(true);
    expect(m.enviar).toHaveBeenCalledTimes(1);
  });

  it("el papel se vuelve a mirar con el rol: si ya no lo ve, no sale", async () => {
    m.getById.mockResolvedValue(null);
    const r = await mandarPapel("t1", confirmado, ctx("manager"));
    expect(r.success).toBe(false);
    expect(m.createShare).not.toHaveBeenCalled();
  });

  it("con el tope por hora lleno, no crea enlace ni manda", async () => {
    m.check.mockResolvedValue(false);
    const r = await mandarPapel("t1", confirmado, ctx("admin"));
    expect(r.success).toBe(false);
    expect(r.error).toContain("última hora");
    expect(m.check).toHaveBeenCalledWith("t1");
    expect(m.createShare).not.toHaveBeenCalled();
    expect(m.enviar).not.toHaveBeenCalled();
  });
});
