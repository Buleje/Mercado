// @vitest-environment node
/**
 * Enlaces públicos con clave (23-10): la clave va UNA vez en el cuerpo de un
 * POST y los archivos se abren con la cookie de acceso que deja; `?password=`
 * en la URL ya no abre nada. Varias carpetas = UN pedido, sólo del negocio de
 * la primera viva.
 */
import { createHash } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  findByFolderShareToken: vi.fn(),
  getFolderShareRawPassword: vi.fn(),
  getFolderShareDocPath: vi.fn(),
  findByShareToken: vi.fn(),
  getShareRawPassword: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/documents/storage", () => ({
  downloadFromStorage: vi.fn(async () => Buffer.from("%PDF-1.4 hola")),
  esInlineSeguro: () => true,
  getSignedUrl: vi.fn(async () => "https://storage.example/firmada"),
}));
vi.mock("@/lib/db/documents.db", () => ({
  DocumentsDB: {
    ...H,
    incrementFolderShareAccess: vi.fn(async () => undefined),
    incrementShareAccess: vi.fn(async () => undefined),
  },
}));

import { POST as abrirVarias } from "@/app/api/public/folders/varias/route";
import { GET as listaCarpeta } from "@/app/api/public/folders/[token]/route";
import { GET as rawCarpeta } from "@/app/api/public/folders/[token]/docs/[docId]/raw/route";
import { GET as verDocumento, POST as abrirDocumento } from "@/app/api/public/documents/[token]/route";
import { GET as rawDocumento } from "@/app/api/public/documents/[token]/raw/route";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const T1 = "1".repeat(48);
const T2 = "2".repeat(48);
const AJENO = "3".repeat(48);
const SIN_CLAVE = "4".repeat(48);
const BASE = "http://localhost";

const carpeta = (nombre: string, tenantId: string, hasPassword = true) => ({
  folder: { id: `f-${nombre}`, name: nombre },
  docs: [{ id: `d-${nombre}`, name: `${nombre}.pdf`, mimeType: "application/pdf", size: 10, uploadedAt: "2026-10-23T00:00:00.000Z" }],
  expiresAt: "2026-10-24T00:00:00.000Z",
  hasPassword,
  tenantId,
});

const CARPETAS: Record<string, ReturnType<typeof carpeta>> = {
  [T1]: carpeta("Licencias", "main"),
  [T2]: carpeta("Contratos", "main"),
  [AJENO]: carpeta("De otro negocio", "otro-negocio"),
  [SIN_CLAVE]: carpeta("Abierta", "main", false),
};
const CLAVES: Record<string, string | null> = {
  [T1]: sha("qa-1234"),
  [T2]: sha("otra-clave"),
  [AJENO]: sha("qa-1234"),
  [SIN_CLAVE]: null,
};

function post(url: string, body: unknown) {
  return new NextRequest(`${BASE}${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
function get(url: string, cookie?: string) {
  return new NextRequest(`${BASE}${url}`, cookie ? { headers: { cookie } } : undefined);
}
/** `bsm_enlace_clave=<valor>` de la Set-Cookie cuya ruta es la del token. */
function cookieDe(res: Response, ruta: string): string | undefined {
  const linea = res.headers.getSetCookie().find((c) => c.includes(`Path=${ruta};`));
  return linea?.split(";")[0];
}

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "secreto-de-prueba-de-32-caracteres!!");
  H.findByFolderShareToken.mockImplementation(async (t: string) => CARPETAS[t] ?? null);
  H.getFolderShareRawPassword.mockImplementation(async (t: string) => CLAVES[t] ?? null);
  H.getFolderShareDocPath.mockImplementation(async () => ({ storagePath: "x/y.pdf", mimeType: "application/pdf", name: "y.pdf" }));
  H.findByShareToken.mockImplementation(async (t: string) =>
    t === T1 ? { doc: { id: "doc1", name: "Contrato.pdf", mimeType: "application/pdf", size: 10, uploadedAt: "2026-10-23", storagePath: "x/c.pdf" }, share: { id: "s1", hasPassword: true, expiresAt: "2026-10-24", accessCount: 0 } } : null,
  );
  H.getShareRawPassword.mockImplementation(async (t: string) => (t === T1 ? sha("qa-1234") : null));
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/public/folders/varias", () => {
  it("clave correcta: las listas en UNA respuesta y una cookie por carpeta que la acepta", async () => {
    const res = await abrirVarias(post("/api/public/folders/varias", { tokens: [T1, T2, SIN_CLAVE], password: "qa-1234" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.carpetas.map((c: { token: string; estado: string }) => [c.token, c.estado])).toEqual([
      [T1, "abierta"], [T2, "rechazada"], [SIN_CLAVE, "abierta"],
    ]);
    expect(data.carpetas[0].docs).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain("tenantId");
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]).toContain(`Path=/api/public/folders/${T1};`);
    expect(setCookies[0]).toContain("HttpOnly");
    expect(setCookies[0]).toContain("SameSite=Strict");
  });

  it("dos carpetas con la misma clave: dos cookies (no la pisa la última)", async () => {
    CLAVES[T2] = sha("qa-1234");
    try {
      const res = await abrirVarias(post("/api/public/folders/varias", { tokens: [T1, T2], password: "qa-1234" }));
      expect(res.headers.getSetCookie()).toHaveLength(2);
      expect(cookieDe(res, `/api/public/folders/${T1}`)).toBeTruthy();
      expect(cookieDe(res, `/api/public/folders/${T2}`)).toBeTruthy();
    } finally {
      CLAVES[T2] = sha("otra-clave");
    }
  });

  it("clave incorrecta en todas: 401 y ninguna cookie", async () => {
    const res = await abrirVarias(post("/api/public/folders/varias", { tokens: [T1, T2], password: "nop" }));
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("una carpeta de OTRO negocio en el mismo pedido no se abre ni deja cookie", async () => {
    const res = await abrirVarias(post("/api/public/folders/varias", { tokens: [T1, AJENO], password: "qa-1234" }));
    const data = await res.json();
    expect(data.carpetas.map((c: { token: string }) => c.token)).toEqual([T1]);
    expect(res.headers.getSetCookie().some((c) => c.includes(AJENO))).toBe(false);
  });

  it("tokens con otro formato o más de 10: 400", async () => {
    expect((await abrirVarias(post("/api/public/folders/varias", { tokens: ["../x"], password: "qa-1234" }))).status).toBe(400);
    const once = Array.from({ length: 11 }, (_, i) => i.toString(16).padStart(48, "0"));
    expect((await abrirVarias(post("/api/public/folders/varias", { tokens: once, password: "qa-1234" }))).status).toBe(400);
  });
});

describe("archivos y lista de una carpeta con clave", () => {
  it("abre con la cookie del POST; sin cookie o con ?password= en la URL, 401", async () => {
    const abierto = await abrirVarias(post("/api/public/folders/varias", { tokens: [T1], password: "qa-1234" }));
    const cookie = cookieDe(abierto, `/api/public/folders/${T1}`);
    const ctx = { params: Promise.resolve({ token: T1, docId: "d-Licencias" }) };

    const conCookie = await rawCarpeta(get(`/api/public/folders/${T1}/docs/d-Licencias/raw`, cookie), ctx);
    expect(conCookie.status).toBe(200);
    expect(conCookie.headers.get("Cache-Control")).toBe("private, no-store");

    expect((await rawCarpeta(get(`/api/public/folders/${T1}/docs/d-Licencias/raw`), ctx)).status).toBe(401);
    expect((await rawCarpeta(get(`/api/public/folders/${T1}/docs/d-Licencias/raw?password=qa-1234`), ctx)).status).toBe(401);

    const lista = await listaCarpeta(get(`/api/public/folders/${T1}`, cookie), { params: Promise.resolve({ token: T1 }) });
    expect(lista.status).toBe(200);
    expect((await listaCarpeta(get(`/api/public/folders/${T1}?password=qa-1234`), { params: Promise.resolve({ token: T1 }) })).status).toBe(401);
  });

  it("la cookie de una carpeta no abre otra", async () => {
    const abierto = await abrirVarias(post("/api/public/folders/varias", { tokens: [T1], password: "qa-1234" }));
    const cookie = cookieDe(abierto, `/api/public/folders/${T1}`);
    const res = await rawCarpeta(get(`/api/public/folders/${T2}/docs/d-Contratos/raw`, cookie), { params: Promise.resolve({ token: T2, docId: "d-Contratos" }) });
    expect(res.status).toBe(401);
  });
});

describe("enlace de UN documento con clave", () => {
  const ctx = { params: Promise.resolve({ token: T1 }) };

  it("POST con la clave correcta: el documento + cookie; con eso abren GET y /raw", async () => {
    const res = await abrirDocumento(post(`/api/public/documents/${T1}`, { password: "qa-1234" }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).signedUrl).toBe("https://storage.example/firmada");
    const cookie = cookieDe(res, `/api/public/documents/${T1}`);
    expect(cookie).toBeTruthy();
    expect((await verDocumento(get(`/api/public/documents/${T1}`, cookie), ctx)).status).toBe(200);
    const raw = await rawDocumento(get(`/api/public/documents/${T1}/raw`, cookie), ctx);
    expect(raw.status).toBe(200);
    expect(raw.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("clave incorrecta: 401 sin cookie; ?password= en la URL ya no abre", async () => {
    const res = await abrirDocumento(post(`/api/public/documents/${T1}`, { password: "nop" }), ctx);
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie()).toHaveLength(0);
    expect((await verDocumento(get(`/api/public/documents/${T1}?password=qa-1234`), ctx)).status).toBe(401);
    expect((await rawDocumento(get(`/api/public/documents/${T1}/raw?password=qa-1234`), ctx)).status).toBe(401);
  });

  it("la cookie de una CARPETA con el mismo token no abre el documento", async () => {
    const abierto = await abrirVarias(post("/api/public/folders/varias", { tokens: [T1], password: "qa-1234" }));
    const cookie = cookieDe(abierto, `/api/public/folders/${T1}`);
    expect((await rawDocumento(get(`/api/public/documents/${T1}/raw`, cookie), ctx)).status).toBe(401);
  });
});
