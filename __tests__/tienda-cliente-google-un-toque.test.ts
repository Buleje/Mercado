// @vitest-environment node
/**
 * Entrar con el globito de Google en las tiendas (17-10):
 *   · el ID token se revisa en casa (firma, alg, iss, aud, exp, nonce, correo
 *     verificado, foto sólo de Google) con un
 *     token falso firmado con una clave de prueba,
 *   · la ruta `/api/tienda-cliente/google` (GET nonce / POST canje) con las
 *     claves de Google simuladas por `fetch`,
 *   · la CSP abre los orígenes de GIS sólo en la tienda.
 */
import { generateKeyPairSync, createSign, type KeyObject } from "node:crypto";
import { NextRequest, type NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CLIENTE = "123-prueba.apps.googleusercontent.com";
const NONCE_CRUDO = "nonce-crudo-de-prueba-0123456789abcdef";

const { signInWithIdToken, settingsGet, limiteCheck } = vi.hoisted(() => ({
  signInWithIdToken: vi.fn(),
  settingsGet: vi.fn(),
  limiteCheck: vi.fn(async (_clave: string) => true),
}));

vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: () => null,
  createDistributedRateLimiter: () => ({ check: limiteCheck, windowMs: 600_000 }),
  getClientIp: () => "203.0.113.7",
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: async () => ({ auth: { signInWithIdToken } }),
  isSupabaseAuthConfiguredServer: () => true,
}));
vi.mock("@/lib/jsondb", () => ({ SettingsDB: { get: settingsGet } }));

import {
  __reiniciarClavesGoogle,
  clavePublicaGoogle,
  hashNonce,
  verificarIdTokenGoogle,
  type OpcionesVerificacion,
} from "@/lib/tienda-cliente/google-id-token";
import { buildCSP } from "@/lib/middleware-utils";
import { GET, POST } from "@/app/api/tienda-cliente/google/route";

const par = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otroPar = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "clave-prueba-1";
const AHORA = 1_800_000_000;

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

function firmar(
  reclamos: Record<string, unknown>,
  { clave = par.privateKey, alg = "RS256", kid = KID }: { clave?: KeyObject; alg?: string; kid?: string } = {},
): string {
  const cabeza = `${b64({ alg, kid, typ: "JWT" })}.${b64(reclamos)}`;
  const firma = createSign("RSA-SHA256").update(cabeza).sign(clave).toString("base64url");
  return `${cabeza}.${firma}`;
}

const reclamosBuenos = (cambios: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: CLIENTE,
  sub: "110248495921238986420",
  email: "brandon@gmail.com",
  email_verified: true,
  name: "Brandon Buleje",
  picture: "https://lh3.googleusercontent.com/a/foto",
  iat: AHORA - 10,
  exp: AHORA + 3590,
  nonce: hashNonce(NONCE_CRUDO),
  ...cambios,
});

const opciones = (cambios: Partial<OpcionesVerificacion> = {}): OpcionesVerificacion => ({
  audiencia: CLIENTE,
  nonceHash: hashNonce(NONCE_CRUDO),
  buscarClave: async (kid) => (kid === KID ? par.publicKey : null),
  ahoraS: AHORA,
  ...cambios,
});

describe("verificarIdTokenGoogle", () => {
  it("acepta un token bueno y devuelve sólo sub, correo, nombre y foto", async () => {
    const r = await verificarIdTokenGoogle(firmar(reclamosBuenos()), opciones());
    expect(r).toEqual({
      ok: true,
      reclamos: {
        sub: "110248495921238986420",
        email: "brandon@gmail.com",
        nombre: "Brandon Buleje",
        foto: "https://lh3.googleusercontent.com/a/foto",
      },
    });
  });

  it.each([
    ["aud de otro cliente", { aud: "otro.apps.googleusercontent.com" }, "aud"],
    ["iss falso", { iss: "https://accounts.google.com.evil.pe" }, "iss"],
    ["vencido (fuera de la holgura de 60 s)", { exp: AHORA - 61 }, "exp"],
    ["emitido en el futuro", { iat: AHORA + 120 }, "exp"],
    ["nonce de otra visita", { nonce: hashNonce("otro") }, "nonce"],
    ["sin nonce", { nonce: undefined }, "nonce"],
    ["correo sin verificar", { email_verified: false }, "correo"],
    ["sin email_verified", { email_verified: undefined }, "correo"],
    ["sin correo", { email: undefined }, "correo"],
  ])("rechaza %s", async (_caso, cambios, motivo) => {
    const r = await verificarIdTokenGoogle(firmar(reclamosBuenos(cambios)), opciones());
    expect(r).toEqual({ ok: false, motivo });
  });

  it("acepta aud en lista si incluye el nuestro", async () => {
    const r = await verificarIdTokenGoogle(firmar(reclamosBuenos({ aud: ["x", CLIENTE] })), opciones());
    expect(r.ok).toBe(true);
  });

  it("rechaza la firma de otra clave con el mismo kid", async () => {
    const r = await verificarIdTokenGoogle(firmar(reclamosBuenos(), { clave: otroPar.privateKey }), opciones());
    expect(r).toEqual({ ok: false, motivo: "firma" });
  });

  it("rechaza alg none y HS256 antes de buscar clave", async () => {
    const buscarClave = vi.fn(async () => par.publicKey);
    const sinFirma = `${b64({ alg: "none", kid: KID })}.${b64(reclamosBuenos())}.x`;
    expect(await verificarIdTokenGoogle(sinFirma, opciones({ buscarClave }))).toEqual({ ok: false, motivo: "alg" });
    const hs = `${b64({ alg: "HS256", kid: KID })}.${b64(reclamosBuenos())}.x`;
    expect(await verificarIdTokenGoogle(hs, opciones({ buscarClave }))).toEqual({ ok: false, motivo: "alg" });
    expect(buscarClave).not.toHaveBeenCalled();
  });

  it("kid desconocido y basura no tiran: devuelven el motivo", async () => {
    expect(await verificarIdTokenGoogle(firmar(reclamosBuenos(), { kid: "otro" }), opciones())).toEqual({ ok: false, motivo: "clave" });
    expect(await verificarIdTokenGoogle("a.b", opciones())).toEqual({ ok: false, motivo: "formato" });
    expect(await verificarIdTokenGoogle("e30.e30.e30", opciones())).toEqual({ ok: false, motivo: "formato" });
  });

  it.each(["http://lh3.googleusercontent.com/a/x", "https://evil.pe/y.png", "https://googleusercontent.com.evil.pe/a"])(
    "foto %s se descarta (sólo https de *.googleusercontent.com)",
    async (picture) => {
      const r = await verificarIdTokenGoogle(firmar(reclamosBuenos({ picture })), opciones());
      expect(r.ok && r.reclamos.foto).toBeNull();
    },
  );

  it("foto de Google se conserva", async () => {
    const r = await verificarIdTokenGoogle(firmar(reclamosBuenos()), opciones());
    expect(r.ok && r.reclamos.foto).toBe("https://lh3.googleusercontent.com/a/foto");
  });
});

/* ── La ruta, con las claves de Google simuladas ───────────────────────── */

const URL_RUTA = "http://localhost:3000/api/tienda-cliente/google";

function pedirPost(
  cuerpo: unknown,
  cookie: string | null = `tienda-gis-nonce=${NONCE_CRUDO}`,
  tenant: string | null = "musa",
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  if (tenant) headers["x-tenant-id"] = tenant;
  return new NextRequest(URL_RUTA, { method: "POST", headers, body: JSON.stringify(cuerpo) });
}

describe("/api/tienda-cliente/google", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", CLIENTE);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AHORA * 1000);
    __reiniciarClavesGoogle();
    const jwk = { ...par.publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { "cache-control": "public, max-age=3600" } })),
    );
    signInWithIdToken.mockReset();
    settingsGet.mockReset();
    settingsGet.mockResolvedValue({ storeTheme: {} });
    limiteCheck.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("GET: nonce = sha256 del crudo, y el crudo en cookie httpOnly Strict de la ruta", async () => {
    const res = (await GET(new NextRequest(URL_RUTA, { headers: { "x-tenant-id": "musa" } }))) as NextResponse;
    expect(res.status).toBe(200);
    const { nonce } = (await res.json()) as { nonce: string };
    const cookie = res.cookies.get("tienda-gis-nonce");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("strict");
    expect(cookie?.path).toBe("/api/tienda-cliente/google");
    expect(hashNonce(cookie?.value ?? "")).toBe(nonce);
    expect(settingsGet).toHaveBeenCalledWith("musa");
  });

  it("GET: negocio con «Entrar con Google» apagado → 404 y sin cookie", async () => {
    settingsGet.mockResolvedValue({ storeTheme: { pedidosCliente: { loginGoogle: false } } });
    const res = (await GET(new NextRequest(URL_RUTA, { headers: { "x-tenant-id": "musa" } }))) as NextResponse;
    expect(res.status).toBe(404);
    expect(res.cookies.get("tienda-gis-nonce")).toBeUndefined();
  });

  it("GET: sin negocio no cae a main → 400", async () => {
    const res = await GET(new NextRequest(URL_RUTA));
    expect(res.status).toBe(400);
    expect(settingsGet).not.toHaveBeenCalled();
  });

  it("GET sin client id → 503 (la tienda queda con el botón de siempre)", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    const res = await GET(new NextRequest(URL_RUTA, { headers: { "x-tenant-id": "musa" } }));
    expect(res.status).toBe(503);
  });

  it("POST sin la cookie del nonce → 400 y Supabase ni se entera", async () => {
    const res = await POST(pedirPost({ credential: firmar(reclamosBuenos()) }, null));
    expect(res.status).toBe(400);
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });

  it("POST con token de otra audiencia → 401, nonce gastado, sin llamar a Supabase", async () => {
    const res = await POST(pedirPost({ credential: firmar(reclamosBuenos({ aud: "otro" })) }));
    expect(res.status).toBe(401);
    expect(res.cookies.get("tienda-gis-nonce")?.value).toBe("");
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });

  it("POST con cuerpo raro → 400", async () => {
    const res = await POST(pedirPost({ credential: "<script>" }));
    expect(res.status).toBe(400);
  });

  it("POST bueno → canjea con el nonce CRUDO, devuelve cliente + pista y gasta el nonce", async () => {
    signInWithIdToken.mockResolvedValue({
      data: { user: { email: "brandon@gmail.com", user_metadata: { full_name: "Brandon Buleje" } } },
      error: null,
    });
    const token = firmar(reclamosBuenos());
    const res = await POST(pedirPost({ credential: token }));
    expect(res.status).toBe(200);
    expect(signInWithIdToken).toHaveBeenCalledWith({ provider: "google", token, nonce: NONCE_CRUDO });
    const cuerpo = (await res.json()) as { cliente: { nombre: string }; pista: string };
    expect(cuerpo.cliente.nombre).toBe("Brandon Buleje");
    expect(cuerpo.pista).toBe("110248495921238986420");
    expect(res.cookies.get("tienda-gis-nonce")?.value).toBe("");
  });

  it("POST: negocio con «Entrar con Google» apagado → 404, nonce gastado, sin Supabase", async () => {
    settingsGet.mockResolvedValue({ storeTheme: { pedidosCliente: { loginGoogle: false } } });
    const res = await POST(pedirPost({ credential: firmar(reclamosBuenos()) }));
    expect(res.status).toBe(404);
    expect(res.cookies.get("tienda-gis-nonce")?.value).toBe("");
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });

  it("POST sin negocio → 400 sin tocar el límite ni Supabase", async () => {
    const res = await POST(pedirPost({ credential: firmar(reclamosBuenos()) }, undefined, null));
    expect(res.status).toBe(400);
    expect(limiteCheck).not.toHaveBeenCalled();
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });

  it("POST: el límite cuenta por IP + negocio (un CGNAT no gasta los intentos de otra tienda)", async () => {
    signInWithIdToken.mockResolvedValue({ data: { user: { email: "b@gmail.com", user_metadata: {} } }, error: null });
    await POST(pedirPost({ credential: firmar(reclamosBuenos()) }));
    expect(limiteCheck).toHaveBeenCalledWith("203.0.113.7:musa");
  });

  it("POST: correo sin verificar → 401 sin llamar a Supabase", async () => {
    const res = await POST(pedirPost({ credential: firmar(reclamosBuenos({ email_verified: false })) }));
    expect(res.status).toBe(401);
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });

  it("claves de Google: pedidos juntos comparten UNA bajada", async () => {
    const [a, b] = await Promise.all([clavePublicaGoogle(KID), clavePublicaGoogle(KID)]);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("claves de Google: si Google no responde, 30 s sin volver a pedir", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("caída"));
    expect(await clavePublicaGoogle(KID)).toBeNull();
    expect(await clavePublicaGoogle(KID)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.setSystemTime((AHORA + 31) * 1000);
    expect(await clavePublicaGoogle(KID)).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("POST: Supabase rechaza → 401", async () => {
    signInWithIdToken.mockResolvedValue({ data: { user: null }, error: { message: "Bad ID token" } });
    const res = await POST(pedirPost({ credential: firmar(reclamosBuenos()) }));
    expect(res.status).toBe(401);
  });
});

/* ── CSP ──────────────────────────────────────────────────────────────── */

const directiva = (csp: string, nombre: string) => csp.split("; ").find((d) => d.startsWith(`${nombre} `)) ?? "";

describe("CSP de Google Identity Services", () => {
  it.each(["/t/musa/tienda", "/tienda", "/t/musa", "/"])("%s abre sólo /gsi/ de accounts.google.com", (ruta) => {
    const csp = buildCSP(ruta, "n0nce");
    expect(directiva(csp, "script-src")).toContain("https://accounts.google.com/gsi/client");
    expect(directiva(csp, "frame-src")).toContain("https://accounts.google.com/gsi/");
    expect(directiva(csp, "connect-src")).toContain("https://accounts.google.com/gsi/");
    expect(directiva(csp, "style-src")).toContain("https://accounts.google.com/gsi/style");
    expect(csp).not.toMatch(/https:\/\/accounts\.google\.com(?!\/gsi\/)/);
  });

  it.each(["/admin", "/superadmin", "/tv", "/t/musa/admin"])("%s queda sin Google", (ruta) => {
    expect(buildCSP(ruta, "n0nce")).not.toContain("accounts.google.com");
  });
});
