/**
 * «Preguntarle al Archivo por WhatsApp» (22-10).
 *
 * Lo que, mal hecho, no da error y se descubre tarde:
 *  1. El ruteo: una pregunta por papeles NO puede llevarse un dictado de plata
 *     o de agenda (sería una operación que no se anotó). Y al revés: plata y
 *     agenda siguen yendo a `conversar` exactamente como antes.
 *  2. La respuesta: hasta 5 papeles con carpeta, vencimiento y enlace; «y N
 *     más» con el enlace a la búsqueda; con 0, qué entendió y una pista.
 *  3. «mándame…» con un papel claro manda EL ARCHIVO, con dos pregunta cuál.
 *  4. Permisos: busca en el negocio del número que recibió el mensaje, con el
 *     rol de quien vinculó el teléfono.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const H = vi.hoisted(() => ({
  list: vi.fn(),
  carpetas: vi.fn(),
  log: vi.fn(),
  bajarDelStorage: vi.fn(),
  mandarTexto: vi.fn(),
  mandarArchivo: vi.fn(),
  conversar: vi.fn(),
  rolActual: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/db/documents.db", () => ({
  DocumentsDB: { list: H.list, carpetasParaBuscar: H.carpetas, log: H.log },
}));
vi.mock("@/lib/documents/storage", () => ({
  downloadFromStorage: H.bajarDelStorage,
  buildStoragePath: vi.fn(),
  uploadToStorage: vi.fn(),
  deleteFromStorage: vi.fn(),
  isMimeAllowed: vi.fn(),
}));
vi.mock("@/lib/documents/precalcular-miniatura", () => ({ precalcularMiniatura: vi.fn() }));
vi.mock("@/lib/documents/cola-analisis", () => ({ enColaDeAnalisis: vi.fn() }));
vi.mock("@/lib/documents/analyze-document", () => ({ analyzeDocumentContent: vi.fn() }));
vi.mock("@/lib/whatsapp/bot-dueno", () => ({
  bajarMedia: vi.fn(),
  bajarMediaConTope: vi.fn(),
  mandarTexto: H.mandarTexto,
  mandarBotones: vi.fn().mockResolvedValue(true),
  mandarArchivo: H.mandarArchivo,
}));
vi.mock("@/lib/ai/transcribir", () => ({ transcribirAudio: vi.fn() }));
vi.mock("@/lib/asistente/conversar", () => ({ conversar: H.conversar }));
vi.mock("@/lib/asistente/memoria", () => ({ olvidar: vi.fn(), anotarHecho: vi.fn() }));
vi.mock("@/lib/asistente/negocio", () => ({ nombreDelNegocio: vi.fn().mockResolvedValue("Bodega") }));
vi.mock("@/lib/db/whatsapp-duenos.db", () => ({
  WhatsAppDuenosDB: { marcarUso: vi.fn().mockResolvedValue(undefined), desvincular: vi.fn(), rolActual: H.rolActual },
}));
vi.mock("@/lib/db/tenants.db", () => ({ TenantsDB: { getBasicById: vi.fn().mockResolvedValue({ name: "Bodega" }) } }));
vi.mock("@/lib/agents", () => ({ orchestrator: { executeSync: vi.fn() }, ensureAgentsRegistered: vi.fn() }));
vi.mock("@/lib/agents/pending-approvals", () => ({ getPendingApproval: vi.fn(), removePendingApproval: vi.fn() }));

const A = await import("@/lib/whatsapp/preguntar-archivo");
const { interpretarBusqueda } = await import("@/lib/documentos/busqueda-natural");
const { manejarMensajeDeDueno } = await import("@/lib/whatsapp/anotar");
const { crearCodigo, canjearCodigo } = await import("@/lib/asistente/vinculacion");

const BASE = "https://panel.test";
const HOY = "2026-10-22";
const cred = { phoneNumberId: "pn-a", token: "tok" };
const TEL = "51911111111";

const CARPETAS = [
  { id: "f-jefe", name: "Jefe - representante", parentId: null },
  { id: "f-demo", name: "Prueba demo", parentId: null },
];
const doc = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  folderId: "f-demo",
  expiresAt: null as string | null,
  mimeType: "application/pdf",
  size: 2048,
  storagePath: `tenants/t/${id}/v1__${name}`,
  tags: [],
  ...extra,
});

const textos = () => H.mandarTexto.mock.calls.map((c) => String(c[2]));

// ── 1. Ruteo ────────────────────────────────────────────────────────────────

describe("qué es una pregunta por papeles", () => {
  it.each([
    ["¿qué vence este año?", false],
    ["¿qué está vencido?", false],
    ["vencidos", false],
    ["¿dónde está el DNI del jefe?", false],
    ["DNI del jefe", false],
    ["¿tienes la licencia de funcionamiento?", false],
    ["¿cuándo vence el SOAT?", false],
    ["¿qué papeles caducan en noviembre?", false],
    ["¿qué llegó por WhatsApp ayer?", false],
    ["mándame el contrato del local", true],
    ["pasame la factura de Sodimac", true],
    ["mándame la GTF escaneada", true],
    ["mándame la licencia", true],
    // Números que NO son montos: plazo, día, año, cantidad, número de papel, DNI.
    ["¿qué vence en los próximos 30 días?", false],
    ["¿qué vence el 15?", false],
    ["¿qué vence antes del 15 de noviembre?", false],
    ["¿qué papeles vencieron en 2025?", false],
    ["¿dónde están las 3 facturas de Sodimac?", false],
    ["mándame la guía 123", true],
    ["¿dónde está el DNI 45678912?", false],
    ["papeles que vencen este mes", false],
    ["licencia de conducir de Pedro", false],
  ])("«%s» → al Archivo (mandar=%s)", (frase, mandar) => {
    const r = A.leerPreguntaDePapeles(frase);
    expect(r, frase).not.toBeNull();
    expect(r?.mandar).toBe(mandar);
  });

  it.each([
    "¿cuánto gasté este mes?",
    "¿quién me debe?",
    "¿cómo viene la caja?",
    "recordame el lunes a las 8 llamar al ingeniero",
    "recuérdame renovar el SOAT el lunes",
    "agendame una reunion con el contador",
    "25 galones de petróleo para el camión N12 a 27 el galón",
    "le adelanté 300 soles en efectivo a Juan Pérez",
    "anotame la factura de 300 soles de Sodimac",
    "pagué la factura de luz",
    "cobré 300 de la boleta 45",
    "¿qué cuotas vencen esta semana?",
    "¿qué fiados vencen?",
    "¿cuánto debe Juan del contrato?",
    "mándame el resumen de caja",
    "¿dónde está la guía 001-234?",
    "¿qué tengo pendiente mañana?",
    // Un pedido con plata adentro es plata: el atajo no se lo queda.
    "mándame el contrato de Juan y anótale 50",
    "mándame la factura de Sodimac, fueron 120",
    "pasame la boleta y apúntalo",
    // Afirmar una fecha es para la agenda, no una búsqueda.
    "el SOAT vence mañana",
    "la licencia de funcionamiento vence el 15",
    "mi DNI caduca en marzo",
    // «licencia» sola es la del personal, no un papel.
    "¿cuántos días de licencia le quedan a Juan?",
    "¿Juan tiene licencia mañana?",
    "hola",
    "",
  ])("«%s» → NO (sigue al asistente)", (frase) => {
    expect(A.leerPreguntaDePapeles(frase)).toBeNull();
  });

  it("saca el envoltorio y traduce «caduca» a «vence» antes de buscar", () => {
    expect(A.leerPreguntaDePapeles("mándame el contrato del local")?.frase).toBe("el contrato del local");
    expect(A.leerPreguntaDePapeles("¿qué papeles caducan en noviembre?")?.frase).toBe("qué papeles vencen en noviembre");
  });
});

// ── 2. La respuesta ─────────────────────────────────────────────────────────

describe("cómo contesta", () => {
  const ahora = new Date("2026-10-22T19:05:00Z");
  const pregunta = { frase: "qué está vencido", mandar: false };
  const interp = interpretarBusqueda(pregunta.frase, { ahora });

  it("cada papel: nombre, carpeta, vencimiento y el enlace que lo abre", () => {
    const txt = A.armarRespuesta({
      pregunta,
      interp,
      docs: [doc("d1", "DNI jefe Shinshiguani", { folderId: "f-jefe", expiresAt: "2026-10-20T00:00:00.000Z" })],
      carpetas: CARPETAS,
      base: BASE,
      hoy: HOY,
    });
    expect(txt).toContain("🗂️ Encontré 1 papel · vencidos");
    expect(txt).toContain("📄 *DNI jefe Shinshiguani* · Jefe - representante · venció 20/10/2026");
    expect(txt).toContain(`${BASE}/admin?tab=documentos&vista=drive&doc=d1`);
    expect(txt).not.toContain("más:");
  });

  it("lo que todavía no venció dice «vence», el de hoy «vence hoy»", () => {
    expect(A.textoDelVencimiento("2030-01-31T12:00:00.000Z", HOY)).toBe("vence 31/01/2030");
    expect(A.textoDelVencimiento("2026-10-22T00:00:00.000Z", HOY)).toBe("vence hoy");
    expect(A.textoDelVencimiento(null, HOY)).toBeNull();
  });

  it("más de 5 → lista 5 y «y N más» con el enlace a la búsqueda", () => {
    const docs = Array.from({ length: 7 }, (_, i) => doc(`d${i}`, `Papel ${i}`, { expiresAt: "2026-01-0" + (i + 1) }));
    const txt = A.armarRespuesta({ pregunta, interp, docs, carpetas: CARPETAS, base: BASE, hoy: HOY });
    expect(txt).toContain("Encontré 7 papeles");
    expect(txt.match(/📄/g)?.length).toBe(5);
    expect(txt).toContain(`…y 2 más: ${BASE}/admin?tab=documentos&vista=drive&q=qu%C3%A9%20est%C3%A1%20vencido`);
  });

  it("0 resultados → dice qué buscó y da una pista (los ya vencidos, si los hay)", () => {
    const p = { frase: "qué vence este año", mandar: false };
    const i = interpretarBusqueda(p.frase, { ahora });
    const txt = A.armarRespuesta({ pregunta: p, interp: i, docs: [], carpetas: CARPETAS, base: BASE, hoy: HOY, vencidosAparte: 5 });
    expect(txt).toContain("🔎 Busqué: vence este año → nada.");
    expect(txt).toContain("Ojo: tienes 5 papeles ya vencidos");
  });

  it("0 resultados buscando texto → pista con el enlace a la búsqueda", () => {
    const p = { frase: "el contrato del galpón", mandar: false };
    const i = interpretarBusqueda(p.frase, { ahora });
    const txt = A.armarRespuesta({ pregunta: p, interp: i, docs: [], carpetas: CARPETAS, base: BASE, hoy: HOY });
    expect(txt).toMatch(/Busqué: contrato · «galpón» → nada/);
    expect(txt).toContain("&q=");
  });

  it("vencidos: el más reciente primero; lo que viene, lo más próximo primero", () => {
    const docs = [doc("a", "A", { expiresAt: "2026-04-11T12:00:00Z" }), doc("b", "B", { expiresAt: "2026-10-20T00:00:00Z" })];
    expect(A.ordenarParaResponder(docs, interp, HOY).map((d) => d.id)).toEqual(["b", "a"]);
    const futuro = interpretarBusqueda("vence este año", { ahora });
    const docsF = [doc("c", "C", { expiresAt: "2026-12-30T00:00:00Z" }), doc("d", "D", { expiresAt: "2026-11-01T00:00:00Z" })];
    expect(A.ordenarParaResponder(docsF, futuro, HOY).map((d) => d.id)).toEqual(["d", "c"]);
  });

  it("para mandar: uno solo, o el único que lo dice en el nombre; con dos dudosos, ninguno", () => {
    const i = interpretarBusqueda("el contrato del local", { ahora });
    const local = doc("l", "contrato-local-2026.docx");
    const borrador = doc("b", "03 Contrato borrador.docx");
    expect(A.papelParaMandar([local], i)?.id).toBe("l");
    expect(A.papelParaMandar([borrador, local], i)?.id).toBe("l");
    expect(A.papelParaMandar([doc("x", "contrato local A"), doc("y", "contrato local B")], i)).toBeNull();
  });
});

// ── 3 y 4. El flujo del dueño ───────────────────────────────────────────────

describe("el flujo del dueño por WhatsApp", () => {
  const base = { tenantId: "t-a", telefono: TEL, nombre: "Brandon", cred, waMessageId: "wamid.X" };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: new Date("2026-10-22T19:05:00Z"), toFake: ["Date"] });
    process.env.NEXT_PUBLIC_BASE_URL = BASE;
    H.carpetas.mockResolvedValue(CARPETAS);
    H.list.mockResolvedValue([]);
    H.log.mockResolvedValue(undefined);
    H.mandarTexto.mockResolvedValue(true);
    H.mandarArchivo.mockResolvedValue({ ok: true });
    H.bajarDelStorage.mockResolvedValue(Buffer.from("%PDF-1.7"));
    H.conversar.mockResolvedValue({ texto: "ok", pendientes: [], registradas: [] });
    H.rolActual.mockResolvedValue({ rol: "manager" });
  });
  afterEach(() => vi.useRealTimers());

  it("«¿qué está vencido?» → busca en el Archivo, NO llama al modelo", async () => {
    H.list.mockResolvedValueOnce([doc("d1", "qa-ui-dni-jefe.jpg", { folderId: "f-jefe", expiresAt: "2026-10-20T00:00:00.000Z" })]);
    await manejarMensajeDeDueno({ ...base, texto: "¿qué está vencido?" });
    expect(H.conversar).not.toHaveBeenCalled();
    const [tenant, filtros, rol] = H.list.mock.calls[0];
    expect(tenant).toBe("t-a");
    expect(rol).toBe("manager");
    expect(filtros.vence).toEqual({ hasta: "2026-10-22T00:00:00.000Z" });
    // Las fotos de las cámaras no se mezclan con los papeles.
    expect(filtros.sinTags).toEqual(expect.arrayContaining(["personas"]));
    expect(textos()[0]).toContain("📄 *qa-ui-dni-jefe.jpg* · Jefe - representante · venció 20/10/2026");
  });

  it.each([
    "¿cuánto gasté este mes?",
    "recordame el lunes a las 8 llamar al ingeniero",
    "le adelanté 300 soles en efectivo a Juan Pérez",
  ])("«%s» sigue yendo a conversar, sin tocar el Archivo", async (frase) => {
    await manejarMensajeDeDueno({ ...base, texto: frase });
    expect(H.conversar).toHaveBeenCalledTimes(1);
    expect(H.conversar.mock.calls[0][0]).toMatchObject({ tenantId: "t-a", texto: frase, canal: "whatsapp" });
    expect(H.list).not.toHaveBeenCalled();
  });

  it("«mándame el contrato del local» con un resultado → manda EL ARCHIVO y lo deja en la bitácora", async () => {
    H.list.mockResolvedValueOnce([
      doc("c1", "contrato-local-2026.docx", {
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        expiresAt: "2026-07-30T12:00:00.000Z",
      }),
    ]);
    await manejarMensajeDeDueno({ ...base, texto: "mándame el contrato del local" });
    expect(H.mandarArchivo).toHaveBeenCalledTimes(1);
    const [c, tel, archivo] = H.mandarArchivo.mock.calls[0];
    expect(c).toBe(cred);
    expect(tel).toBe(TEL);
    expect(archivo.nombre).toBe("contrato-local-2026.docx");
    expect(archivo.pie).toBe("📄 contrato-local-2026.docx · Prueba demo · venció 30/07/2026");
    expect(H.bajarDelStorage).toHaveBeenCalledWith("tenants/t/c1/v1__contrato-local-2026.docx");
    expect(H.log).toHaveBeenCalledWith("t-a", expect.objectContaining({ documentId: "c1", action: "whatsapp_send" }));
    expect(H.mandarTexto).not.toHaveBeenCalled();
    expect(H.conversar).not.toHaveBeenCalled();
  });

  it("«mándame…» con dos que podrían ser → lista y pregunta cuál, no adivina", async () => {
    H.list.mockResolvedValueOnce([doc("x", "contrato local A"), doc("y", "contrato local B")]);
    await manejarMensajeDeDueno({ ...base, texto: "mándame el contrato del local" });
    expect(H.mandarArchivo).not.toHaveBeenCalled();
    expect(textos()[0]).toContain("¿Cuál te mando?");
  });

  it("si WhatsApp no recibe el archivo → lo dice y deja el enlace", async () => {
    H.list.mockResolvedValueOnce([doc("c1", "contrato-local-2026.pdf")]);
    H.mandarArchivo.mockResolvedValueOnce({ ok: false, motivo: "conexion" });
    await manejarMensajeDeDueno({ ...base, texto: "mándame el contrato del local" });
    expect(textos()[0]).toContain("no te lo pude mandar: la conexión del número con WhatsApp venció");
    expect(textos()[0]).toContain(`${BASE}/admin?tab=documentos&vista=drive&doc=c1`);
    expect(H.log).not.toHaveBeenCalled();
  });

  it("0 en «¿qué vence este año?» → dice qué buscó y cuenta los ya vencidos", async () => {
    H.list.mockResolvedValueOnce([]).mockResolvedValueOnce([doc("v1", "a"), doc("v2", "b")]);
    await manejarMensajeDeDueno({ ...base, texto: "¿qué vence este año?" });
    expect(textos()[0]).toContain("🔎 Busqué: vence este año → nada.");
    expect(textos()[0]).toContain("Ojo: tienes 2 papeles ya vencidos");
    expect(H.list.mock.calls[1][0]).toBe("t-a");
  });

  it("busca SOLO en el negocio del número que recibió el mensaje", async () => {
    await manejarMensajeDeDueno({ ...base, tenantId: "t-b", texto: "¿dónde está el DNI del jefe?" });
    expect(H.carpetas).toHaveBeenCalledWith("t-b", "manager");
    expect(H.list.mock.calls.every((c) => c[0] === "t-b")).toBe(true);
    expect(H.rolActual).toHaveBeenCalledWith("t-b", TEL);
  });

  it("quien vinculó el teléfono ya no está activo → pide volver a vincular y no hace NADA más", async () => {
    H.rolActual.mockResolvedValue({ revocado: true });
    for (const texto of ["vencidos", "¿cuánto gasté este mes?"]) {
      await manejarMensajeDeDueno({ ...base, texto });
    }
    await manejarMensajeDeDueno({ ...base, texto: "", botonId: "anotar-ok:x" });
    expect(textos()).toEqual(Array(3).fill(expect.stringContaining("necesita volver a vincularse")));
    expect(H.list).not.toHaveBeenCalled();
    expect(H.conversar).not.toHaveBeenCalled();
  });

  it("el rol ACTUAL también va a conversar (que tiene herramientas del Archivo)", async () => {
    await manejarMensajeDeDueno({ ...base, texto: "¿dónde está la planilla de sueldos de octubre?" });
    expect(H.list).not.toHaveBeenCalled();
    expect(H.conversar.mock.calls[0][0].actorRole).toBe("manager");
  });

  it("el tope se mide en los bytes bajados, no en el tamaño que dice la fila", async () => {
    H.list.mockResolvedValueOnce([doc("c1", "contrato-local-2026.pdf", { size: 2048 })]);
    H.bajarDelStorage.mockResolvedValueOnce(Buffer.alloc(17 * 1024 * 1024));
    await manejarMensajeDeDueno({ ...base, texto: "mándame el contrato del local" });
    expect(H.mandarArchivo).not.toHaveBeenCalled();
    expect(textos()[0]).toContain("pesa demasiado para mandarlo por acá");
    expect(textos()[0]).toContain("&doc=c1");
  });

  it("el pie de una foto es su nombre, no una pregunta: con adjunto no se busca", async () => {
    // El guardado falla a propósito (el mock no sabe crear): lo que importa es que no se busca.
    await manejarMensajeDeDueno({
      ...base,
      texto: "DNI del jefe",
      archivo: { id: "998877", mime: "image/jpeg", tipo: "imagen" },
    }).catch(() => undefined);
    expect(H.list).not.toHaveBeenCalled();
  });
});

describe("el código de vinculación lleva el rol de quien lo pidió", () => {
  it("crear con rol → canjear devuelve ese rol; sin rol, no inventa uno", () => {
    const { codigo } = crearCodigo("t-rol", "qamanager", "whatsapp", "manager");
    expect(canjearCodigo(codigo, "whatsapp")).toEqual({ tenantId: "t-rol", pedidoPor: "qamanager", rol: "manager" });
    const sinRol = crearCodigo("t-rol2", "bot", "whatsapp");
    expect(canjearCodigo(sinRol.codigo, "whatsapp")).toEqual({ tenantId: "t-rol2", pedidoPor: "bot" });
  });
});
