// @vitest-environment node
/**
 * Papeles por WhatsApp → Archivo (Brandon 2026-10-22).
 *
 * El dueño reenvía una foto o un PDF al número del negocio y queda guardado en
 * «Llegó por WhatsApp / <día de Lima>», con nombre, y el bot le dice dónde.
 *
 * Lo que se prueba acá es lo que, mal hecho, NO da error:
 *  - el nombre (pie > archivo > «Foto de …»), saneado y con la extensión del tipo;
 *  - qué tipos entran, mirando los BYTES y no sólo el mime que declara Meta;
 *  - que una re-entrega de Meta no deje dos copias;
 *  - que «guárdalo» no vaya al asistente de plata y un dictado sí.
 *
 * La bajada de Meta (`bajarMediaConTope`) está simulada: con un id falso la
 * Graph API real no entrega nada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const H = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  carpetas: [] as Array<{ id: string; name: string; parentId: string | null; allowedRoles: string[] }>,
  bajar: vi.fn(),
  subir: vi.fn(),
  mandarTexto: vi.fn(),
  conversar: vi.fn(),
  analizar: vi.fn(),
  updateFolder: vi.fn(),
  hardDelete: vi.fn(),
  borrarStorage: vi.fn(),
  createFalla: null as null | Error,
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/db/documents.db", () => {
  let n = 0;
  return {
    DocumentsDB: {
      getByIdIncludingDeleted: vi.fn(async (_t: string, id: string) => H.docs.get(id) ?? null),
      getById: vi.fn(async (_t: string, id: string) => H.docs.get(id) ?? null),
      createFolderTree: vi.fn(async (_t: string, input: { parentId: string | null; rutas: string[] }) => {
        const idPorRuta: Record<string, string> = {};
        let creadas = 0;
        for (const ruta of input.rutas) {
          let padre = input.parentId;
          for (const tramo of ruta.split("/")) {
            let f = H.carpetas.find((c) => c.parentId === padre && c.name === tramo);
            if (!f) {
              f = { id: `f${++n}`, name: tramo, parentId: padre, allowedRoles: [] };
              H.carpetas.push(f);
              creadas++;
            }
            padre = f.id;
          }
          idPorRuta[ruta] = padre as string;
        }
        return { idPorRuta, creadas };
      }),
      updateFolder: H.updateFolder,
      create: vi.fn(async (_t: string, input: Record<string, unknown>) => {
        if (H.createFalla) throw H.createFalla;
        const doc = { ...input, aiTags: [], ocrMetadata: null };
        H.docs.set(String(input.id), doc);
        return doc;
      }),
      update: vi.fn(async (_t: string, id: string, patch: Record<string, unknown>) => {
        const d = H.docs.get(id);
        if (!d) return null;
        Object.assign(d, patch);
        return d;
      }),
      hardDelete: H.hardDelete,
      log: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock("@/lib/documents/storage", async () => {
  const limites = await vi.importActual<typeof import("@/lib/documents/upload-limits")>("@/lib/documents/upload-limits");
  return {
    buildStoragePath: ({ documentId, originalName }: { documentId: string; originalName: string }) =>
      `tenants/t/${documentId}/v1__${originalName}`,
    uploadToStorage: H.subir,
    deleteFromStorage: H.borrarStorage,
    isMimeAllowed: limites.isMimeAllowed,
  };
});
vi.mock("@/lib/documents/precalcular-miniatura", () => ({ precalcularMiniatura: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/documents/cola-analisis", () => ({
  enColaDeAnalisis: (_e: string, tarea: () => Promise<unknown>) => tarea(),
}));
vi.mock("@/lib/documents/analyze-document", () => ({ analyzeDocumentContent: H.analizar }));

vi.mock("@/lib/whatsapp/bot-dueno", () => ({
  bajarMediaConTope: H.bajar,
  bajarMedia: vi.fn(),
  mandarTexto: H.mandarTexto,
  mandarBotones: vi.fn().mockResolvedValue(true),
}));

// Lo que `anotar.ts` usa para el dictado: sólo importa si se llamó y con qué.
vi.mock("@/lib/ai/transcribir", () => ({ transcribirAudio: vi.fn() }));
vi.mock("@/lib/asistente/conversar", () => ({ conversar: H.conversar }));
vi.mock("@/lib/asistente/memoria", () => ({ olvidar: vi.fn(), anotarHecho: vi.fn() }));
vi.mock("@/lib/asistente/negocio", () => ({ nombreDelNegocio: vi.fn().mockResolvedValue("Bodega") }));
vi.mock("@/lib/db/whatsapp-duenos.db", () => ({
  WhatsAppDuenosDB: { marcarUso: vi.fn().mockResolvedValue(undefined), desvincular: vi.fn() },
}));
vi.mock("@/lib/db/tenants.db", () => ({ TenantsDB: { getBasicById: vi.fn().mockResolvedValue({ name: "Bodega" }) } }));
vi.mock("@/lib/agents", () => ({ orchestrator: { executeSync: vi.fn() }, ensureAgentsRegistered: vi.fn() }));
vi.mock("@/lib/agents/pending-approvals", () => ({ getPendingApproval: vi.fn(), removePendingApproval: vi.fn() }));

const P = await import("@/lib/whatsapp/archivar-papel");
const { DocumentsDB } = await import("@/lib/db/documents.db");
const { canRoleSeeDoc, ROL_CANDADO_DUENO } = await import("@/lib/documents/doc-access");
const { manejarMensajeDeDueno } = await import("@/lib/whatsapp/anotar");

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]);
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(40, 1)]);
const HTML = Buffer.from("<html><script>alert(1)</script></html>");
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40, 1)]);
/** Lo mínimo de un zip de Office: la cabecera y los nombres de sus entradas. */
const zipCon = (...entradas: string[]) => Buffer.concat([ZIP, ...entradas.map((e) => Buffer.from(e, "latin1"))]);
const DOCX_BYTES = zipCon("[Content_Types].xml", "word/document.xml");
const XLSX_BYTES = zipCon("[Content_Types].xml", "xl/workbook.xml");
const caja = (marca: string) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(`ftyp${marca}`, "latin1"), Buffer.alloc(30)]);

/** 22-10-2026 a las 14:05 de Lima (19:05 UTC). */
const CUANDO = new Date("2026-10-22T19:05:00Z");
const cred = { phoneNumberId: "pn-main", token: "tok" };
const TEL = "51911111111";

const papel = (extra: Partial<Parameters<typeof P.archivarPapel>[2]> = {}) => ({
  waMessageId: "wamid.UNO",
  mediaId: "1234567890",
  tipo: "imagen" as const,
  mimeDeclarado: "image/jpeg",
  contacto: "Brandon",
  telefono: TEL,
  cuando: CUANDO,
  ...extra,
});

const textos = () => H.mandarTexto.mock.calls.map((c) => String(c[2]));

beforeEach(() => {
  vi.clearAllMocks();
  H.docs.clear();
  H.carpetas.length = 0;
  H.createFalla = null;
  P._olvidarTodasLasCarpetas();
  H.bajar.mockResolvedValue({ ok: true, bytes: JPEG, mime: "image/jpeg", nombre: "media.jpg" });
  H.subir.mockResolvedValue({ ok: true });
  H.updateFolder.mockImplementation(async (_t: string, id: string, patch: { allowedRoles: string[] }) => {
    const f = H.carpetas.find((c) => c.id === id);
    if (f) f.allowedRoles = patch.allowedRoles;
    return f ?? null;
  });
  H.hardDelete.mockImplementation(async (_t: string, id: string) => H.docs.delete(id));
  H.borrarStorage.mockResolvedValue(undefined);
  H.mandarTexto.mockResolvedValue(true);
  H.analizar.mockResolvedValue({ ok: false, error: "x", status: 500 });
  H.conversar.mockResolvedValue({ texto: "", pendientes: [], registradas: [] });
  process.env.NEXT_PUBLIC_BASE_URL = "https://panel.test";
});

describe("el nombre del papel", () => {
  it("pie de foto > nombre del archivo > «Foto de <contacto> <hora de Lima>»", () => {
    const base = { tipo: "imagen" as const, mime: "image/jpeg", cuando: CUANDO, contacto: "Brandon" };
    expect(P.nombreDelPapel({ ...base, pie: "DNI de Juan", filename: "IMG-001.jpg" })).toBe("DNI de Juan.jpg");
    expect(P.nombreDelPapel({ ...base, filename: "contrato.pdf", mime: "application/pdf", tipo: "documento" })).toBe(
      "contrato.pdf",
    );
    expect(P.nombreDelPapel(base)).toBe("Foto de Brandon 14h05.jpg");
    expect(P.nombreDelPapel({ ...base, contacto: "alguien", tipo: "documento", mime: "application/pdf" })).toBe(
      "Documento de WhatsApp 14h05.pdf",
    );
  });

  it("la extensión la decide el TIPO, no el nombre", () => {
    const base = { tipo: "documento" as const, cuando: CUANDO };
    // Un «.exe» en el nombre de un PDF queda como texto: el archivo es .pdf.
    expect(P.nombreDelPapel({ ...base, mime: "application/pdf", filename: "factura.exe" })).toBe("factura.exe.pdf");
    expect(P.nombreDelPapel({ ...base, mime: "image/jpeg", filename: "foto.JPEG" })).toBe("foto.jpeg");
    expect(P.nombreDelPapel({ ...base, mime: XLSX_MIME, filename: "Planilla octubre.xlsx" })).toBe(
      "Planilla octubre.xlsx",
    );
  });

  it("sanea separadores de ruta, lo que Windows prohíbe y los invisibles de dirección", () => {
    const base = { tipo: "documento" as const, mime: "application/pdf", cuando: CUANDO };
    expect(P.nombreDelPapel({ ...base, filename: "../../etc/passwd" })).toBe("etc passwd.pdf");
    expect(P.nombreDelPapel({ ...base, pie: 'Boleta: "grifo" <El Sol>' })).toBe("Boleta grifo El Sol.pdf");
    // U+202E da vuelta el texto: «gpj.exe» se vería «exe.jpg».
    expect(P.nombreDelPapel({ ...base, filename: "factura\u202Efdp.exe" })).toBe("factura fdp.exe.pdf");
    expect(P.nombreDelPapel({ ...base, pie: "x".repeat(300) }).length).toBeLessThanOrEqual(104);
  });
});

describe("qué tipos entran", () => {
  it("fotos, PDF, Word y Excel sí; audio, HTML y ejecutables no", () => {
    for (const m of ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf", DOCX_MIME, XLSX_MIME]) {
      expect(P.esMimeDePapel(m), m).toBe(true);
    }
    for (const m of ["audio/ogg", "text/html", "application/x-msdownload", "video/mp4", "application/zip"]) {
      expect(P.esMimeDePapel(m), m).toBe(false);
    }
  });

  it("Meta mandó «octet-stream»: manda la extensión del archivo", () => {
    expect(P.mimeDelPapel("application/octet-stream", "contrato.pdf")).toBe("application/pdf");
    expect(P.mimeDelPapel("image/jpeg; charset=binary")).toBe("image/jpeg");
  });

  it("HEIC por su marca: un MP4 o un MOV también tienen «ftyp» y no son fotos", () => {
    for (const marca of ["heic", "heix", "mif1", "msf1"]) expect(P.contenidoCoincide("image/heic", caja(marca)), marca).toBe(true);
    for (const marca of ["isom", "mp42", "qt  "]) expect(P.contenidoCoincide("image/heic", caja(marca)), marca).toBe(false);
  });

  it("Word/Excel: un zip cualquiera no entra, y un Excel no pasa por Word", () => {
    expect(P.contenidoCoincide(DOCX_MIME, ZIP)).toBe(false);
    expect(P.contenidoCoincide(DOCX_MIME, zipCon("word/document.xml"))).toBe(false);
    expect(P.contenidoCoincide(DOCX_MIME, XLSX_BYTES)).toBe(false);
    expect(P.contenidoCoincide(XLSX_MIME, DOCX_BYTES)).toBe(false);
  });

  it("los bytes tienen que ser lo que dice el mime", () => {
    expect(P.contenidoCoincide("image/jpeg", JPEG)).toBe(true);
    expect(P.contenidoCoincide("application/pdf", PDF)).toBe(true);
    expect(P.contenidoCoincide(DOCX_MIME, DOCX_BYTES)).toBe(true);
    expect(P.contenidoCoincide(XLSX_MIME, XLSX_BYTES)).toBe(true);
    expect(P.contenidoCoincide("image/jpeg", HTML)).toBe(false);
    expect(P.contenidoCoincide("application/pdf", JPEG)).toBe(false);
  });
});

describe("«guárdalo» es una orden; un dictado no", () => {
  it("reconoce la orden y el nombre pedido", () => {
    expect(P.ordenDeGuardar("guárdalo")).toEqual({ nombre: "" });
    expect(P.ordenDeGuardar("Archívalo")).toEqual({ nombre: "" });
    expect(P.ordenDeGuardar("por favor guardalo en el archivo")).toEqual({ nombre: "" });
    expect(P.ordenDeGuardar("guárdalo como DNI de Juan")).toEqual({ nombre: "DNI de Juan" });
    expect(P.ordenDeGuardar("archívalo: contrato Pérez")).toEqual({ nombre: "contrato Pérez" });
    expect(P.ordenDeGuardar("súbelo al archivo como «Licencia 2026»")).toEqual({ nombre: "Licencia 2026" });
  });

  it("un dictado o una pregunta NO es una orden", () => {
    for (const t of ["180 soles de combustible", "¿cuánto gasté?", "guardado ayer", "el guardia cobró 50", ""]) {
      expect(P.ordenDeGuardar(t), t).toBeNull();
    }
  });
});

describe("guardar en el Archivo", () => {
  it("queda en «Llegó por WhatsApp / 2026-10-22» con tag, autor y la carpeta nueva cerrada", async () => {
    const r = await P.archivarPapel("t-main", cred, papel({ pie: "DNI de Juan" }));
    expect(r).toMatchObject({ ok: true, nombre: "DNI de Juan.jpg", carpetaNombre: "2026-10-22", mime: "image/jpeg" });
    if (!r.ok) return;

    const raiz = H.carpetas.find((c) => c.name === P.CARPETA_WHATSAPP);
    const dia = H.carpetas.find((c) => c.name === "2026-10-22");
    expect(dia?.parentId).toBe(raiz?.id);
    expect(r.carpetaId).toBe(dia?.id);
    // Raíz y día, con el candado de dueño (manager/tienda_owner tampoco).
    expect(raiz?.allowedRoles).toEqual(["admin", "owner", ROL_CANDADO_DUENO]);
    expect(dia?.allowedRoles).toEqual(["admin", "owner", ROL_CANDADO_DUENO]);

    const doc = H.docs.get(r.documentId);
    expect(r.documentId).toBe(P.idDelPapel("t-main", "wamid.UNO"));
    expect(doc).toMatchObject({
      folderId: dia?.id,
      tags: ["whatsapp"],
      allowedRoles: ["admin", "owner", ROL_CANDADO_DUENO],
      uploadedById: `whatsapp:${TEL}`,
      mimeType: "image/jpeg",
      storagePath: expect.stringContaining(r.documentId),
    });
    expect(H.bajar).toHaveBeenCalledWith("1234567890", "tok", P.MAX_BYTES_PAPEL);
  });

  it("una «Llegó por WhatsApp» que un cajero creó abierta se cierra igual", async () => {
    H.carpetas.push({ id: "raiz-vieja", name: P.CARPETA_WHATSAPP, parentId: null, allowedRoles: [] });
    const r = await P.archivarPapel("t-main", cred, papel());
    expect(r.ok).toBe(true);
    expect(H.carpetas.find((c) => c.id === "raiz-vieja")?.allowedRoles).toContain(ROL_CANDADO_DUENO);
  });

  it("si cerrar la carpeta falla, el papel entra con su candado y el siguiente vuelve a cerrarla", async () => {
    H.updateFolder.mockRejectedValueOnce(new Error("db caída"));
    const r = await P.archivarPapel("t-main", cred, papel());
    expect(r.ok).toBe(true);
    if (r.ok) expect(H.docs.get(r.documentId)?.allowedRoles).toContain(ROL_CANDADO_DUENO);
    const raiz = H.carpetas.find((c) => c.name === P.CARPETA_WHATSAPP);
    expect(raiz?.allowedRoles).toEqual([]);
    // No quedó recordada: el próximo papel la cierra (antes quedaba abierta para siempre).
    await P.archivarPapel("t-main", cred, papel({ waMessageId: "wamid.DOS" }));
    expect(raiz?.allowedRoles).toEqual(["admin", "owner", ROL_CANDADO_DUENO]);
  });

  it("el id depende del negocio Y del mensaje", () => {
    expect(P.idDelPapel("a", "m1")).toBe(P.idDelPapel("a", "m1"));
    expect(P.idDelPapel("a", "m1")).not.toBe(P.idDelPapel("b", "m1"));
    expect(P.idDelPapel("a", "m1")).toMatch(/^wa[0-9a-f]{23}$/);
  });

  it("re-entrega de Meta: el segundo no baja nada ni crea otro", async () => {
    const primero = await P.archivarPapel("t-main", cred, papel());
    const segundo = await P.archivarPapel("t-main", cred, papel());
    expect(primero.ok).toBe(true);
    expect(segundo).toEqual({ ok: false, motivo: "duplicado" });
    expect(H.bajar).toHaveBeenCalledTimes(1);
    expect(H.docs.size).toBe(1);
  });

  it("dos entregas en carrera: el choque de id (P2002) es «duplicado», no error", async () => {
    H.createFalla = Object.assign(new Error("Unique constraint"), { code: "P2002" });
    expect(await P.archivarPapel("t-main", cred, papel())).toEqual({ ok: false, motivo: "duplicado" });
  });

  it("tipo declarado que no entra: ni se baja", async () => {
    const r = await P.archivarPapel("t-main", cred, papel({ mimeDeclarado: "audio/ogg", tipo: "documento" }));
    expect(r).toEqual({ ok: false, motivo: "tipo" });
    expect(H.bajar).not.toHaveBeenCalled();
  });

  it("dice ser JPEG pero es HTML: no entra", async () => {
    H.bajar.mockResolvedValue({ ok: true, bytes: HTML, mime: "image/jpeg", nombre: "media.jpg" });
    expect(await P.archivarPapel("t-main", cred, papel())).toEqual({ ok: false, motivo: "tipo" });
    expect(H.docs.size).toBe(0);
  });

  it("pesa de más / no se pudo bajar: motivos distintos", async () => {
    H.bajar.mockResolvedValueOnce({ ok: false, motivo: "grande" });
    expect(await P.archivarPapel("t-main", cred, papel())).toEqual({ ok: false, motivo: "grande" });
    H.bajar.mockResolvedValueOnce({ ok: false, motivo: "fallo" });
    expect(await P.archivarPapel("t-main", cred, papel({ waMessageId: "otro" }))).toEqual({
      ok: false,
      motivo: "descarga",
    });
  });

  it("borrador «pending» reciente = otra entrega lo está subiendo: duplicado, sin bajar", async () => {
    const id = P.idDelPapel("t-main", "wamid.UNO");
    H.docs.set(id, { id, storagePath: "pending", uploadedAt: new Date(Date.now() - 20_000).toISOString() });
    expect(await P.archivarPapel("t-main", cred, papel())).toEqual({ ok: false, motivo: "duplicado" });
    expect(H.bajar).not.toHaveBeenCalled();
  });

  it("borrador «pending» abandonado (proceso muerto) se descarta y se vuelve a guardar", async () => {
    const id = P.idDelPapel("t-main", "wamid.UNO");
    H.docs.set(id, { id, storagePath: "pending", uploadedAt: new Date(Date.now() - 10 * 60_000).toISOString() });
    const r = await P.archivarPapel("t-main", cred, papel());
    expect(r).toMatchObject({ ok: true, documentId: id });
    expect(H.hardDelete).toHaveBeenCalledWith("t-main", id);
    expect(H.docs.get(id)?.storagePath).not.toBe("pending");
  });

  it("si falla anotar la ruta tras subir, no queda ni el archivo huérfano ni el borrador", async () => {
    vi.mocked(DocumentsDB.update).mockRejectedValueOnce(new Error("db"));
    const r = await P.archivarPapel("t-main", cred, papel());
    expect(r).toEqual({ ok: false, motivo: "error" });
    expect(H.borrarStorage).toHaveBeenCalledWith([expect.stringContaining(P.idDelPapel("t-main", "wamid.UNO"))]);
    expect(H.docs.size).toBe(0);
  });

  it("si el storage falla, se borra la fila (el reintento de Meta puede volver a probar)", async () => {
    H.subir.mockResolvedValue({ ok: false, error: "bucket" });
    const r = await P.archivarPapel("t-main", cred, papel());
    expect(r).toEqual({ ok: false, motivo: "storage" });
    expect(H.hardDelete).toHaveBeenCalledWith("t-main", P.idDelPapel("t-main", "wamid.UNO"));
  });
});

describe("mover a la carpeta que sugirió el análisis", () => {
  it("movido a una carpeta abierta, el papel sigue sólo para dueños", async () => {
    const r = await P.archivarPapel("t-main", cred, papel());
    if (!r.ok) throw new Error("no guardó");
    (H.docs.get(r.documentId) as Record<string, unknown>).ocrMetadata = {
      sugerencias: { folderId: "f-abierta", folderName: "Clientes" },
    };
    expect(await P.moverASugerida("t-main", r.documentId, r.carpetaId, "x")).not.toBeNull();
    const doc = H.docs.get(r.documentId) as { folderId: string; allowedRoles: string[] };
    expect(doc.folderId).toBe("f-abierta");
    // La carpeta destino no tiene roles: lo que protege es el candado del papel.
    for (const rol of ["cajero", "almacenero", "manager", "tienda_owner"]) {
      expect(canRoleSeeDoc(rol, doc.allowedRoles, []), rol).toBe(false);
    }
    expect(canRoleSeeDoc("admin", doc.allowedRoles, [])).toBe(true);
    expect(canRoleSeeDoc("owner", doc.allowedRoles, [])).toBe(true);
  });

  async function guardado() {
    const r = await P.archivarPapel("t-main", cred, papel());
    if (!r.ok) throw new Error("no guardó");
    return r;
  }
  const sugerir = (id: string, folderId: string, folderName: string) => {
    const d = H.docs.get(id) as Record<string, unknown>;
    d.ocrMetadata = { sugerencias: { folderId, folderName } };
  };

  it("lo mueve si sigue en la carpeta del día", async () => {
    const r = await guardado();
    sugerir(r.documentId, "f-dni", "DNI");
    expect(await P.moverASugerida("t-main", r.documentId, r.carpetaId, "whatsapp:1")).toEqual({
      folderId: "f-dni",
      folderName: "DNI",
    });
    expect(H.docs.get(r.documentId)?.folderId).toBe("f-dni");
  });

  it("no lo toca si el dueño ya lo movió, o si la sugerida es otra carpeta de días", async () => {
    const r = await guardado();
    sugerir(r.documentId, "f-2026", "2026-10-21");
    expect(await P.moverASugerida("t-main", r.documentId, r.carpetaId, "x")).toBeNull();
    sugerir(r.documentId, "f-dni", "DNI");
    expect(await P.moverASugerida("t-main", r.documentId, "otra-carpeta", "x")).toBeNull();
  });
});

describe("el flujo del dueño por WhatsApp", () => {
  const base = { tenantId: "t-main", telefono: TEL, nombre: "Brandon", cred, waMessageId: "wamid.FLUJO" };
  const foto = { id: "998877", mime: "image/jpeg", tipo: "imagen" as const };

  it("foto sin texto → guardada, y le dice dónde con el enlace a la carpeta", async () => {
    await manejarMensajeDeDueno({ ...base, texto: "", archivo: foto });
    const [msj] = textos();
    expect(msj).toMatch(/^📁 Guardado en tu Archivo › Llegó por WhatsApp › 2026-10-\d\d como «Foto de Brandon \d\dh\d\d\.jpg»/);
    expect(msj).toContain("https://panel.test/admin?tab=documentos&vista=drive&sub=folder&carpeta=");
    expect(H.conversar).not.toHaveBeenCalled();
    // Ya no dice que «todavía no puede leer boletas».
    expect(textos().join(" ")).not.toContain("todavía no puedo");
  });

  it("«guárdalo como DNI de Juan» → ese nombre, y NO va al asistente de plata", async () => {
    await manejarMensajeDeDueno({ ...base, texto: "guárdalo como DNI de Juan", archivo: foto });
    expect(textos()[0]).toContain("como «DNI de Juan.jpg»");
    expect(H.conversar).not.toHaveBeenCalled();
  });

  it("foto + dictado de plata → se guarda Y el dictado se procesa como siempre", async () => {
    await manejarMensajeDeDueno({ ...base, texto: "180 soles de combustible", archivo: foto });
    expect(textos()[0]).toContain("📁 Guardado");
    expect(H.conversar).toHaveBeenCalledWith(
      expect.objectContaining({ texto: "180 soles de combustible", tenantId: "t-main", canal: "whatsapp" }),
    );
  });

  it("PDF reenviado con su nombre de archivo", async () => {
    H.bajar.mockResolvedValue({ ok: true, bytes: PDF, mime: "application/pdf", nombre: "media.pdf" });
    await manejarMensajeDeDueno({
      ...base,
      texto: "",
      archivo: { id: "5544", mime: "application/pdf", filename: "Contrato Pérez.pdf", tipo: "documento" },
    });
    expect(textos()[0]).toContain("como «Contrato Pérez.pdf»");
  });

  it("re-entrega del mismo mensaje: ni otra respuesta ni otro dictado", async () => {
    await manejarMensajeDeDueno({ ...base, texto: "180 soles de combustible", archivo: foto });
    await manejarMensajeDeDueno({ ...base, texto: "180 soles de combustible", archivo: foto });
    expect(textos().filter((t) => t.startsWith("📁"))).toHaveLength(1);
    expect(H.conversar).toHaveBeenCalledTimes(1);
  });

  it("un tipo que no entra se explica, y el dictado igual sigue", async () => {
    await manejarMensajeDeDueno({
      ...base,
      texto: "180 soles de combustible",
      archivo: { id: "77", mime: "audio/ogg", filename: "nota.ogg", tipo: "documento" },
    });
    expect(textos()[0]).toContain("Ese tipo de archivo no lo guardo");
    expect(H.conversar).toHaveBeenCalledTimes(1);
  });

  it("el análisis sugiere una carpeta existente → lo mueve y avisa", async () => {
    H.analizar.mockImplementation(async (_t: string, id: string) => {
      (H.docs.get(id) as Record<string, unknown>).ocrMetadata = {
        sugerencias: { folderId: "f-dni", folderName: "DNI y documentos" },
      };
      return { ok: true };
    });
    await manejarMensajeDeDueno({ ...base, texto: "", archivo: foto });
    await vi.waitFor(() => expect(textos()).toHaveLength(2));
    expect(textos()[1]).toContain("Lo pasé a la carpeta «DNI y documentos»");
    expect(textos()[1]).toContain("carpeta=f-dni");
    expect(H.analizar).toHaveBeenCalledWith("t-main", expect.stringMatching(/^wa/), `whatsapp:${TEL}`, "admin");
  });
});
