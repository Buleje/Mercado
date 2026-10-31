// @vitest-environment node
/**
 * ADR-513 — la huella del celular es una passkey de la persona del adelanto.
 *
 * - Origen y rpId salen de una lista; el Origin del pedido sólo elige dentro.
 * - Sin llave → «registrar»; con llave → «confirmar»; DNI distinto suma intento.
 * - Registro OK queda atado a la persona del token, en el negocio del token.
 * - Firmar con passkey → fila HUELLA metodo "passkey" + credentialId, sin subir
 *   imagen; el contador sube en la tx de la firma.
 * - Reto reusado → 400; contador que baja → 409; llave de otra persona → 403;
 *   token de otro negocio → 404.
 * - Revocar: sólo admin/dueño; cajero y manager 403.
 * - Revisión de seguridad 23-10: el enlace no suma un 2.º celular (ni en otro
 *   dominio, ni con `nueva`); tope de 3 bajo candado; la llave guarda enlace,
 *   IP y navegador, y la constancia dice si se registró con el mismo enlace;
 *   `dispositivo` del cliente no se acepta; texto «lo confirmó el aparato»;
 *   la constancia copia la llave pública; el reto se consume atómico.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

const H = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  vReg: vi.fn(),
  vAuth: vi.fn(),
  pkFindUnique: vi.fn(),
  pkFindMany: vi.fn(),
  pkUpdateMany: vi.fn(),
  pkFindFirst: vi.fn(),
  pkCount: vi.fn(),
  firmasFindMany: vi.fn(),
  borrarSiEs: vi.fn(),
  tx: {
    $queryRaw: vi.fn(),
    adelantoEnlaceFirma: { updateMany: vi.fn(), findFirst: vi.fn() },
    adelantoPasskey: { updateMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    adelantoFirma: { create: vi.fn() },
  },
  enlacePorToken: vi.fn(),
  firmarPorEnlace: vi.fn(),
  sumarIntentoFallido: vi.fn(),
  subir: vi.fn(),
  borrar: vi.fn(),
  auth: { role: "admin", tenantId: "t-del-jwt", username: "dueno" } as { role: string; tenantId: string; username: string },
}));

vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: async (o: { challenge: Uint8Array; rpID: string }) => ({ challenge: Buffer.from(o.challenge).toString("base64url"), rp: { id: o.rpID } }),
  generateAuthenticationOptions: async (o: { challenge: Uint8Array; rpID: string }) => ({ challenge: Buffer.from(o.challenge).toString("base64url"), rpId: o.rpID }),
  verifyRegistrationResponse: (...a: unknown[]) => H.vReg(...a),
  verifyAuthenticationResponse: (...a: unknown[]) => H.vAuth(...a),
}));
vi.mock("@/lib/camaras/kv-efimero.server", () => ({
  kvLeer: async (k: string) => H.kv.get(k) ?? null,
  kvEscribir: async (k: string, v: unknown) => {
    H.kv.set(k, v);
  },
  kvBorrar: async (k: string) => H.kv.delete(k),
  kvBorrarSiEs: (...a: [string, string]) => H.borrarSiEs(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (t: typeof H.tx) => unknown) => fn(H.tx),
    adelantoPasskey: {
      findUnique: (...a: unknown[]) => H.pkFindUnique(...a),
      findMany: (...a: unknown[]) => H.pkFindMany(...a),
      updateMany: (...a: unknown[]) => H.pkUpdateMany(...a),
      findFirst: (...a: unknown[]) => H.pkFindFirst(...a),
      count: (...a: unknown[]) => H.pkCount(...a),
    },
    adelantoFirma: { findMany: (...a: unknown[]) => H.firmasFindMany(...a) },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null, getClientIp: () => "203.0.113.7" }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: async () => H.auth }));

import { rpDelOrigen } from "@/lib/adelantos/passkey-rp";
import { AdelantoFirmasDB } from "@/lib/db/adelanto-firmas.db";
import { haySecretoEnRuta } from "@/lib/telemetry/secretos-en-url";
import { AdelantoPasskeysDB, type AltaPasskey } from "@/lib/db/adelanto-passkeys.db";
import { textoHuellaPasskey } from "@/lib/adelantos/comprobante";
import { METODO_PASSKEY, MAX_PASSKEYS_VIGENTES, VERSION_CONSENTIMIENTO_PASSKEY, sistemaQueDeclara, textoLlavePasskey } from "@/lib/adelantos/passkey-tipos";

const ORIGEN = "http://localhost:3000";
const TOKEN = "T".repeat(43);
const b64 = (s: string) => Buffer.from(s).toString("base64url");
const clientData = (challenge: string, type = "webauthn.get") => b64(JSON.stringify({ type, challenge, origin: ORIGEN }));

/** Una passkey guardada como la devuelve Prisma. */
const fila = (o: Partial<{ id: string; beneficiarioId: string; credentialId: string; counter: bigint; rpId: string; revokedAt: Date | null; enlaceId: string | null }> = {}) => ({
  id: "pk1",
  beneficiarioId: "b-juan",
  credentialId: "cred1",
  publicKey: new Uint8Array([1, 2, 3]),
  counter: BigInt(4),
  transports: ["internal"],
  rpId: "localhost",
  revokedAt: null,
  /* Registrada el 20/10 (Lima) con OTRO enlace que el del token de las pruebas («e1»). */
  enlaceId: "e-viejo",
  createdAt: new Date("2026-10-20T15:00:00Z"),
  ...o,
});

/** Lo que el KV guarda de un reto: texto con el contexto (se borra comparando el texto entero). */
const valorDelReto = (reto: string) => `v1|${reto}|a1|b-juan|localhost|${ORIGEN}`;
const UA_ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36";

describe("passkey-rp: el origen sale de la lista", () => {
  const dev = { baseUrl: "http://localhost:3000", produccion: false };
  const prod = { baseUrl: "https://buleje.pe", origenes: "https://*.buleje.pe,https://bodega.com", produccion: true };
  it("dev: localhost en cualquier puerto y los túneles; http fuera de localhost no", () => {
    expect(rpDelOrigen("http://localhost:3001", dev)).toEqual({ origin: "http://localhost:3001", rpId: "localhost" });
    expect(rpDelOrigen("https://abc-def.trycloudflare.com", dev)?.rpId).toBe("abc-def.trycloudflare.com");
    expect(rpDelOrigen("http://abc.trycloudflare.com", dev)).toBeNull();
    expect(rpDelOrigen("https://evil.com", dev)).toBeNull();
    expect(rpDelOrigen(null, dev)).toBeNull();
  });
  it("producción: base + PASSKEY_ORIGENES con comodín; ni localhost ni túneles", () => {
    expect(rpDelOrigen("https://buleje.pe", prod)?.rpId).toBe("buleje.pe");
    expect(rpDelOrigen("https://musa.buleje.pe", prod)?.rpId).toBe("musa.buleje.pe");
    expect(rpDelOrigen("https://bodega.com", prod)?.rpId).toBe("bodega.com");
    expect(rpDelOrigen("https://buleje.pe.evil.com", prod)).toBeNull();
    expect(rpDelOrigen("http://localhost:3000", prod)).toBeNull();
    expect(rpDelOrigen("https://x.trycloudflare.com", prod)).toBeNull();
  });
  it("las rutas nuevas con token se tachan en la telemetría", () => {
    expect(haySecretoEnRuta(`/api/public/adelantos/${TOKEN}/passkey/opciones`)).toBe(true);
    expect(haySecretoEnRuta(`/api/public/adelantos/${TOKEN}/passkey/registrar`)).toBe(true);
  });
});

describe("firmarPorEnlace con passkey: el contador sube en la misma tx", () => {
  beforeEach(() => {
    H.tx.adelantoEnlaceFirma.updateMany.mockReset().mockResolvedValue({ count: 1 });
    H.tx.adelantoPasskey.updateMany.mockReset().mockResolvedValue({ count: 1 });
    H.tx.adelantoFirma.create.mockReset().mockResolvedValue({ id: "f1" });
  });
  const filas = [{ adelantoId: "a1", tipo: "HUELLA" as const, canal: "ENLACE" as const, firmanteNombre: "Juan", firmanteDocumento: "45678901", ruta: "x", sha256: "a".repeat(64), bytes: 1, montoFirmado: 120, monedaFirmada: "PEN" }];
  it("sube sólo si sigue valiendo lo leído (WHERE counter = anterior)", async () => {
    expect(await AdelantoFirmasDB.firmarPorEnlace("t1", "e1", filas, { passkeyId: "pk1", anterior: 4, nuevo: 5 })).toBe("ok");
    expect(H.tx.adelantoPasskey.updateMany.mock.calls[0][0]).toMatchObject({ where: { tenantId: "t1", id: "pk1", revokedAt: null, counter: BigInt(4) }, data: { counter: BigInt(5) } });
  });
  it("otro lo movió entre medio → «contador_bajo» y no anota nada", async () => {
    H.tx.adelantoPasskey.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await AdelantoFirmasDB.firmarPorEnlace("t1", "e1", filas, { passkeyId: "pk1", anterior: 4, nuevo: 5 })).toBe("contador_bajo");
    expect(H.tx.adelantoFirma.create).not.toHaveBeenCalled();
  });
});

describe("rutas públicas de la passkey + firmar", () => {
  let PNG: Buffer;
  beforeAll(async () => {
    PNG = await sharp({ create: { width: 60, height: 30, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
  });
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/db/adelanto-firmas.db", () => ({
      AdelantoFirmasDB: {
        enlacePorToken: (...a: unknown[]) => H.enlacePorToken(...a),
        firmarPorEnlace: (...a: unknown[]) => H.firmarPorEnlace(...a),
        sumarIntentoFallido: (...a: unknown[]) => H.sumarIntentoFallido(...a),
      },
    }));
    vi.doMock("@/lib/adelantos/guardar-en-registro.server", () => ({
      subirParaRegistro: (...a: unknown[]) => H.subir(...a),
      borrarSubidas: (...a: unknown[]) => H.borrar(...a),
    }));
    H.kv.clear();
    H.enlacePorToken.mockReset().mockResolvedValue({
      enlaceId: "e1", tenantId: "t-del-token", adelantoId: "a1", beneficiarioId: "b-juan", estado: "pendiente", pideHuella: true, documentoEsperado: "45678901",
      firmanteNombre: "Juan", creadoPor: "dueno", montoAdelantado: 120, moneda: "PEN", codigoOperacion: "ADL-2026-0001",
    });
    H.firmarPorEnlace.mockReset().mockResolvedValue("ok");
    H.sumarIntentoFallido.mockReset().mockResolvedValue({ revocado: false });
    H.subir.mockReset().mockImplementation(async (_t: string, _a: string, tipo: string) => ({ ruta: `t-del-token/adelantos/a1/registro/1-${tipo}-0123456789abcdef.webp`, sha256: "a".repeat(64), bytes: 10 }));
    H.borrar.mockReset();
    H.pkFindMany.mockReset().mockResolvedValue([]);
    H.pkFindUnique.mockReset().mockResolvedValue(null);
    H.pkCount.mockReset().mockResolvedValue(0);
    H.borrarSiEs.mockReset().mockImplementation(async (k: string, v: string) => H.kv.get(k) === v && H.kv.delete(k));
    H.tx.$queryRaw.mockReset().mockResolvedValue([{ id: "b-juan" }]);
    H.tx.adelantoPasskey.count.mockReset().mockResolvedValue(0);
    H.tx.adelantoPasskey.create
      .mockReset()
      .mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
        fila({ counter: data.counter as bigint, credentialId: data.credentialId as string, enlaceId: data.enlaceId as string }),
      );
    H.vReg.mockReset();
    H.vAuth.mockReset();
  });

  const json = (body: unknown, origen = ORIGEN) =>
    ({ method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin: origen, "user-agent": UA_ANDROID } }) as const;
  const ctx = (token = TOKEN) => ({ params: Promise.resolve({ token }) });
  const opciones = async (body: unknown = { documento: "45678901" }, origen = ORIGEN, token = TOKEN) =>
    (await import("@/app/api/public/adelantos/[token]/passkey/opciones/route")).POST(new NextRequest(`${ORIGEN}/api/public/adelantos/${token}/passkey/opciones`, json(body, origen)), ctx(token));
  const registrar = async (body: unknown) =>
    (await import("@/app/api/public/adelantos/[token]/passkey/registrar/route")).POST(new NextRequest(`${ORIGEN}/api/public/adelantos/${TOKEN}/passkey/registrar`, json(body)), ctx());
  const firmar = async (passkey: unknown) => {
    const fd = new FormData();
    fd.append("datos", JSON.stringify({ firmante: { nombre: "Juan Pérez", documento: "45678901" } }));
    fd.append("firma", new Blob([new Uint8Array(PNG)], { type: "image/png" }), "firma.png");
    fd.append("passkey", JSON.stringify(passkey));
    const req = new NextRequest(`${ORIGEN}/api/public/adelantos/${TOKEN}/firmar`, { method: "POST", body: fd, headers: { origin: ORIGEN } });
    return (await import("@/app/api/public/adelantos/[token]/firmar/route")).POST(req, ctx());
  };
  const confirmacion = (challenge: string, id = "cred1") => ({
    respuesta: { id, rawId: id, type: "public-key", response: { clientDataJSON: clientData(challenge), authenticatorData: b64("auth"), signature: b64("firma") }, clientExtensionResults: {} },
    consentimiento: VERSION_CONSENTIMIENTO_PASSKEY,
  });
  const cuerpoRegistro = (challenge: string, extra: Record<string, unknown> = {}) => ({
    respuesta: { id: "cred1", rawId: "cred1", type: "public-key", response: { clientDataJSON: clientData(challenge, "webauthn.create"), attestationObject: b64("att") } },
    ...extra,
  });
  /** Pide opciones de confirmar con la llave guardada y devuelve el reto. */
  const retoDeConfirmar = async (llave = fila()) => {
    H.pkFindMany.mockResolvedValue([llave]);
    const r = await opciones();
    const body = (await r.json()) as { modo: string; opciones: { challenge: string } };
    expect(body.modo).toBe("confirmar");
    return body.opciones.challenge;
  };

  it("sin llave → «registrar», con el reto guardado y atado al monto", async () => {
    const r = await opciones();
    expect(r.status).toBe(200);
    const body = (await r.json()) as { modo: string; opciones: { challenge: string } };
    expect(body.modo).toBe("registrar");
    expect(Buffer.from(body.opciones.challenge, "base64url")).toHaveLength(48);
    expect(H.kv.has("adelanto-passkey:t-del-token:e1:registrar")).toBe(true);
    expect(H.pkFindMany.mock.calls[0][0]).toMatchObject({ where: { tenantId: "t-del-token", beneficiarioId: "b-juan", rpId: "localhost", revokedAt: null } });
    expect(JSON.stringify(body)).not.toMatch(/t-del-token|a1|b-juan/);
  });

  it("DNI distinto → 422 y suma intento; origen fuera de la lista → 403; token de otro negocio → 404", async () => {
    expect((await opciones({ documento: "11111111" })).status).toBe(422);
    expect(H.sumarIntentoFallido).toHaveBeenCalledWith("t-del-token", "e1");
    expect((await opciones({ documento: "45678901" }, "https://evil.com")).status).toBe(403);
    H.enlacePorToken.mockResolvedValueOnce(null);
    expect((await opciones()).status).toBe(404);
  });

  it("registro OK: verifica en el servidor y la llave queda en el negocio y la persona del token", async () => {
    const o = (await (await opciones()).json()) as { opciones: { challenge: string } };
    H.vReg.mockResolvedValue({ verified: true, registrationInfo: { userVerified: true, credential: { id: "cred1", publicKey: new Uint8Array([9]), counter: 0, transports: ["internal"] } } });
    H.pkFindMany.mockResolvedValue([fila({ counter: BigInt(0) })]);
    const r = await registrar(cuerpoRegistro(o.opciones.challenge));
    expect(r.status).toBe(200);
    expect(((await r.json()) as { modo: string }).modo).toBe("confirmar");
    expect(H.vReg.mock.calls[0][0]).toMatchObject({ expectedChallenge: o.opciones.challenge, expectedOrigin: ORIGEN, expectedRPID: "localhost", requireUserVerification: true });
    /* La persona se toma con FOR UPDATE, filtrada por el negocio del token. */
    const [sql, ...valores] = H.tx.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(sql.join("?")).toMatch(/"tenantId" = \? AND id = \? FOR UPDATE/);
    expect(valores).toEqual(["t-del-token", "b-juan"]);
    /* Rastro del registro: con qué enlace, IP y navegador; sin nombre puesto por el cliente. */
    const data = H.tx.adelantoPasskey.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({ tenantId: "t-del-token", beneficiarioId: "b-juan", credentialId: "cred1", rpId: "localhost", enlaceId: "e1", registroIp: "203.0.113.7", registroUserAgent: UA_ANDROID });
    expect(data.deviceName).toBeUndefined();
  });

  it("firmar con passkey: fila HUELLA metodo passkey sin imagen, y el contador sube 4 → 5", async () => {
    const reto = await retoDeConfirmar();
    H.pkFindUnique.mockResolvedValue(fila());
    H.vAuth.mockResolvedValue({ verified: true, authenticationInfo: { userVerified: true, newCounter: 5 } });
    const r = await firmar(confirmacion(reto));
    expect(r.status).toBe(200);
    expect(H.pkFindUnique.mock.calls[0][0]).toMatchObject({ where: { tenantId_credentialId: { tenantId: "t-del-token", credentialId: "cred1" } } });
    expect(H.subir).toHaveBeenCalledTimes(1);
    const [tenant, enlace, filas, contador] = H.firmarPorEnlace.mock.calls[0] as [string, string, Record<string, unknown>[], unknown];
    expect([tenant, enlace]).toEqual(["t-del-token", "e1"]);
    const huella = filas.find((f) => f.tipo === "HUELLA");
    expect(huella).toMatchObject({ metodo: METODO_PASSKEY, credentialId: "cred1", consentimiento: VERSION_CONSENTIMIENTO_PASSKEY, idempotencyKey: "enlace:e1:HUELLA" });
    expect(String(huella?.ruta)).toMatch(/^t-del-token\/adelantos\/a1\/registro\/.+\.passkey$/);
    expect(contador).toEqual({ passkeyId: "pk1", anterior: 4, nuevo: 5 });
  });

  it("el mismo reto otra vez → 400 «reto_usado», sin firmar", async () => {
    const reto = await retoDeConfirmar();
    H.pkFindUnique.mockResolvedValue(fila());
    H.vAuth.mockResolvedValue({ verified: true, authenticationInfo: { userVerified: true, newCounter: 5 } });
    expect((await firmar(confirmacion(reto))).status).toBe(200);
    const otra = await firmar(confirmacion(reto));
    expect(otra.status).toBe(400);
    expect(((await otra.json()) as { code: string }).code).toBe("reto_usado");
    expect(H.firmarPorEnlace).toHaveBeenCalledTimes(1);
  });

  it("contador que baja (clon) → 409, lo diga la librería o lo vea la ruta", async () => {
    H.pkFindUnique.mockResolvedValue(fila());
    H.vAuth.mockResolvedValue({ verified: true, authenticationInfo: { userVerified: true, newCounter: 3 } });
    const a = await firmar(confirmacion(await retoDeConfirmar()));
    expect(a.status).toBe(409);
    expect(((await a.json()) as { code: string }).code).toBe("contador_bajo");
    H.vAuth.mockRejectedValue(new Error("Response counter value 3 was lower than expected 4"));
    expect((await firmar(confirmacion(await retoDeConfirmar()))).status).toBe(409);
    expect(H.firmarPorEnlace).not.toHaveBeenCalled();
  });

  it("llave de otra persona del negocio → 403; de otro negocio no existe acá → 403", async () => {
    H.pkFindUnique.mockResolvedValue(fila({ beneficiarioId: "b-pedro" }));
    expect((await firmar(confirmacion(await retoDeConfirmar()))).status).toBe(403);
    H.pkFindUnique.mockResolvedValue(null);
    expect((await firmar(confirmacion(await retoDeConfirmar(), "cred-de-otro"))).status).toBe(403);
    expect(H.vAuth).not.toHaveBeenCalled();
  });

  /* ── Revisión de seguridad 23-10 ─────────────────────────────────────── */

  it("1 · con una llave vigente en OTRO dominio el enlace no registra otra: 409 «ya_registrada», sin reto", async () => {
    H.pkFindMany.mockResolvedValue([]); // ninguna para localhost…
    H.pkCount.mockResolvedValue(1); // …pero una vigente en otro subdominio
    const r = await opciones();
    expect(r.status).toBe(409);
    const body = (await r.json()) as { code: string; error: string };
    expect(body.code).toBe("ya_registrada");
    expect(body.error).toMatch(/revoque el anterior/);
    expect(H.pkCount.mock.calls[0][0]).toMatchObject({ where: { tenantId: "t-del-token", beneficiarioId: "b-juan", revokedAt: null } });
    expect(H.pkCount.mock.calls[0][0].where.rpId).toBeUndefined();
    expect(H.kv.size).toBe(0);
  });

  it("1 · «Cambié de celular» ya no existe: `nueva` → 400; y si otra llave entró entre opciones y registrar → 409, sin crear", async () => {
    const n = await opciones({ documento: "45678901", nueva: true });
    expect(n.status).toBe(400);
    const o = (await (await opciones()).json()) as { opciones: { challenge: string } };
    H.vReg.mockResolvedValue({ verified: true, registrationInfo: { userVerified: true, credential: { id: "cred-2", publicKey: new Uint8Array([9]), counter: 0, transports: ["internal"] } } });
    H.tx.adelantoPasskey.count.mockResolvedValue(1); // la cuenta bajo candado manda
    const r = await registrar(cuerpoRegistro(o.opciones.challenge));
    expect(r.status).toBe(409);
    expect(((await r.json()) as { code: string }).code).toBe("ya_registrada");
    expect(H.tx.adelantoPasskey.create).not.toHaveBeenCalled();
  });

  it("2 · la constancia dice si la llave se registró con este mismo enlace o con otro", async () => {
    H.vAuth.mockResolvedValue({ verified: true, authenticationInfo: { userVerified: true, newCounter: 5 } });
    const mismo = fila({ enlaceId: "e1" });
    H.pkFindUnique.mockResolvedValue(mismo);
    expect((await firmar(confirmacion(await retoDeConfirmar(mismo)))).status).toBe(200);
    H.pkFindUnique.mockResolvedValue(fila());
    expect((await firmar(confirmacion(await retoDeConfirmar()))).status).toBe(200);
    const registro = (n: number) => {
      const filas = H.firmarPorEnlace.mock.calls[n][2] as { tipo: string; constancia?: { registro: unknown } }[];
      return filas.find((f) => f.tipo === "HUELLA")?.constancia?.registro;
    };
    expect(registro(0)).toEqual({ passkeyId: "pk1", enlaceId: "e1", mismoEnlace: true, registradaEn: "2026-10-20T15:00:00.000Z" });
    expect(registro(1)).toMatchObject({ enlaceId: "e-viejo", mismoEnlace: false });
  });

  it("3 · el nombre del celular que manda el cliente no se acepta: `dispositivo` → 400 y no se verifica nada", async () => {
    const o = (await (await opciones()).json()) as { opciones: { challenge: string } };
    const r = await registrar(cuerpoRegistro(o.opciones.challenge, { dispositivo: "iPhone de Juan" }));
    expect(r.status).toBe(400);
    expect(H.vReg).not.toHaveBeenCalled();
  });

  it("4 · con 3 vigentes → 409 «tope_llaves» en opciones", async () => {
    H.pkCount.mockResolvedValue(MAX_PASSKEYS_VIGENTES);
    const r = await opciones();
    expect(r.status).toBe(409);
    expect(((await r.json()) as { code: string }).code).toBe("tope_llaves");
  });

  it("MEDIO · la constancia copia la llave pública y la credencial, y dice qué prueba", async () => {
    H.pkFindUnique.mockResolvedValue(fila());
    H.vAuth.mockResolvedValue({ verified: true, authenticationInfo: { userVerified: true, newCounter: 5 } });
    expect((await firmar(confirmacion(await retoDeConfirmar()))).status).toBe(200);
    const huella = (H.firmarPorEnlace.mock.calls[0][2] as { tipo: string; constancia?: Record<string, unknown> }[]).find((f) => f.tipo === "HUELLA");
    expect(huella?.constancia).toMatchObject({ v: 2, credentialId: "cred1", publicKey: Buffer.from([1, 2, 3]).toString("base64url") });
    expect(String(huella?.constancia?.significado)).toMatch(/^Lo confirmó el aparato registrado para esta persona.*No es la huella de la persona/);
  });

  it("reto atómico: se borra comparando el texto entero (reto + adelanto + persona + dominio + origen)", async () => {
    const reto = await retoDeConfirmar();
    H.pkFindUnique.mockResolvedValue(fila());
    H.vAuth.mockResolvedValue({ verified: true, authenticationInfo: { userVerified: true, newCounter: 5 } });
    expect(H.kv.get("adelanto-passkey:t-del-token:e1:confirmar")).toBe(valorDelReto(reto));
    expect((await firmar(confirmacion(reto))).status).toBe(200);
    expect(H.borrarSiEs).toHaveBeenCalledWith("adelanto-passkey:t-del-token:e1:confirmar", valorDelReto(reto));
  });

  it("reto atómico: dos firmas a la vez con el mismo reto → una sola anota", async () => {
    const reto = await retoDeConfirmar();
    H.pkFindUnique.mockResolvedValue(fila());
    H.vAuth.mockResolvedValue({ verified: true, authenticationInfo: { userVerified: true, newCounter: 5 } });
    const estados = (await Promise.all([firmar(confirmacion(reto)), firmar(confirmacion(reto))])).map((r) => r.status).sort();
    expect(estados).toEqual([200, 400]);
    expect(H.firmarPorEnlace).toHaveBeenCalledTimes(1);
  });

  it("reto atómico: pedir opciones de nuevo pisa el reto anterior → el viejo da «reto_vencido»", async () => {
    const viejo = await retoDeConfirmar();
    const nuevo = await retoDeConfirmar();
    expect(nuevo).not.toBe(viejo);
    H.pkFindUnique.mockResolvedValue(fila());
    const r = await firmar(confirmacion(viejo));
    expect(r.status).toBe(400);
    expect(((await r.json()) as { code: string }).code).toBe("reto_vencido");
    expect(H.vAuth).not.toHaveBeenCalled();
  });
});

describe("alta de la llave bajo candado de la persona (tope y «ya tiene»)", () => {
  const alta: AltaPasskey = {
    beneficiarioId: "b-juan",
    credentialId: "cred-n",
    publicKey: new Uint8Array([7]),
    counter: 0,
    transports: ["internal"],
    rpId: "localhost",
    enlaceId: "e1",
    registroIp: "203.0.113.7",
    registroUserAgent: UA_ANDROID,
  };
  beforeEach(() => {
    H.tx.$queryRaw.mockReset().mockResolvedValue([{ id: "b-juan" }]);
    H.tx.adelantoPasskey.count.mockReset();
    H.tx.adelantoPasskey.create.mockReset().mockResolvedValue(fila({ credentialId: "cred-n", enlaceId: "e1" }));
  });

  it("4 · con 3 vigentes → «tope» aunque quien llama permita más; con 2 entra la tercera", async () => {
    H.tx.adelantoPasskey.count.mockResolvedValueOnce(3);
    expect(await AdelantoPasskeysDB.crear("t1", alta, 10)).toEqual({ ok: false, motivo: "tope" });
    H.tx.adelantoPasskey.count.mockResolvedValueOnce(2);
    expect((await AdelantoPasskeysDB.crear("t1", alta)).ok).toBe(true);
    expect(H.tx.adelantoPasskey.create).toHaveBeenCalledTimes(1);
  });

  it("1 · el enlace (maxVigentes 0) con una vigente → «ya-tiene»; la misma credencial a la vez (P2002) → «ya-tiene»", async () => {
    H.tx.adelantoPasskey.count.mockResolvedValueOnce(1);
    expect(await AdelantoPasskeysDB.crear("t1", alta, 0)).toEqual({ ok: false, motivo: "ya-tiene" });
    H.tx.adelantoPasskey.count.mockResolvedValueOnce(0);
    H.tx.adelantoPasskey.create.mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    expect(await AdelantoPasskeysDB.crear("t1", alta, 0)).toEqual({ ok: false, motivo: "ya-tiene" });
  });

  it("persona de otro negocio → no crea (el candado la busca con el tenant)", async () => {
    H.tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(AdelantoPasskeysDB.crear("t-ajeno", alta, 0)).rejects.toThrow(/no es de este negocio/);
    expect(H.tx.adelantoPasskey.count).not.toHaveBeenCalled();
    expect(H.tx.adelantoPasskey.create).not.toHaveBeenCalled();
  });
});

describe("lo que ve el panel y el papel (textos honestos)", () => {
  it("3 · la ficha muestra el sistema según el navegador y el nombre viejo rotulado, nunca el user-agent entero", async () => {
    H.pkFindMany.mockReset().mockResolvedValue([
      { id: "pk1", rpId: "localhost", deviceName: "Mi celu", registroUserAgent: UA_ANDROID, createdAt: new Date("2026-10-20T15:00:00Z"), lastUsedAt: null, revokedAt: null },
    ]);
    const [p] = await AdelantoPasskeysDB.listarDeLaPersona("t1", "b-juan");
    expect(p).toMatchObject({ navegador: "Android", nombrePuesto: "Mi celu" });
    expect(JSON.stringify(p)).not.toContain("Mozilla");
    expect(sistemaQueDeclara("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("iPhone");
    expect(sistemaQueDeclara(null)).toBeNull();
  });

  it("2 · el origen de la llave: mismo enlace (prueba más débil) / otro enlace con el día de Lima", () => {
    expect(textoLlavePasskey({ mismoEnlace: true, registradaEn: "2026-10-20T15:00:00Z" })).toBe("llave registrada con este mismo enlace");
    /* 03:00 UTC del 20 = 22:00 del 19 en Lima. */
    expect(textoLlavePasskey({ mismoEnlace: false, registradaEn: "2026-10-20T03:00:00Z" })).toBe("llave registrada el 19/10 con otro enlace");
    expect(textoLlavePasskey({ mismoEnlace: false, registradaEn: null })).toBe("llave registrada con otro enlace");
  });

  it("2 · el registro del panel saca de la constancia sólo el origen de la llave (v1 y foto → sin nota) y nunca la constancia", async () => {
    const base = { adelantoId: "a1", tipo: "HUELLA", canal: "ENLACE", firmanteNombre: "Juan", firmanteDocumento: null, montoFirmado: 120, monedaFirmada: "PEN", codigoOperacion: null, pedidoPor: null, sha256: "a".repeat(64) };
    H.firmasFindMany.mockReset().mockResolvedValue([
      { ...base, id: "f3", metodo: METODO_PASSKEY, constancia: { v: 2, publicKey: "AQID", registro: { mismoEnlace: true, registradaEn: "2026-10-23T19:00:00.000Z" } }, createdAt: new Date("2026-10-23T19:05:00Z") },
      { ...base, id: "f2", metodo: METODO_PASSKEY, constancia: { v: 1 }, createdAt: new Date("2026-10-22T19:05:00Z") },
      { ...base, id: "f1", metodo: null, constancia: null, createdAt: new Date("2026-10-21T19:05:00Z") },
    ]);
    const filas = await AdelantoFirmasDB.listar("t1", "a1");
    expect(filas.map((f) => f.llave)).toEqual([{ mismoEnlace: true, registradaEn: "2026-10-23T19:00:00.000Z" }, null, null]);
    expect(JSON.stringify(filas)).not.toMatch(/constancia|AQID/);
  });

  it("5 · el papel dice «lo confirmó el aparato registrado para esta persona», nunca «su huella»", () => {
    const t = textoHuellaPasskey("23/10 14:05");
    expect(t).toBe("Lo confirmó el aparato registrado para esta persona (passkey) el 23/10 14:05");
    expect(t).not.toMatch(/su huella|Huella confirmada/i);
  });
});

describe("revocar la passkey desde la ficha", () => {
  beforeEach(() => {
    H.pkUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    H.pkFindFirst.mockReset().mockResolvedValue(null);
    H.pkFindMany.mockReset().mockResolvedValue([]);
  });
  const ctx = { params: Promise.resolve({ id: "b-juan", passkeyId: "pk1" }) };
  const revocar = async () =>
    (await import("@/app/api/adelantos/beneficiarios/[id]/passkeys/[passkeyId]/route")).DELETE(new NextRequest("http://localhost/x", { method: "DELETE" }), ctx);

  it.each(["cajero", "manager", "almacenero"])("%s → 403 y no toca la base", async (role) => {
    H.auth = { role, tenantId: "t-del-jwt", username: "x" };
    const r = await revocar();
    expect(r).toBeInstanceOf(NextResponse);
    expect(r.status).toBe(403);
    expect(H.pkUpdateMany).not.toHaveBeenCalled();
  });

  it("admin revoca con la condición en el WHERE (negocio del JWT, la persona, vigente)", async () => {
    H.auth = { role: "admin", tenantId: "t-del-jwt", username: "dueno" };
    expect((await revocar()).status).toBe(200);
    expect(H.pkUpdateMany.mock.calls[0][0]).toMatchObject({ where: { tenantId: "t-del-jwt", beneficiarioId: "b-juan", id: "pk1", revokedAt: null } });
  });

  it("de otro negocio → 404 (no la encuentra con el tenant del JWT)", async () => {
    H.auth = { role: "owner", tenantId: "t-del-jwt", username: "dueno" };
    H.pkUpdateMany.mockResolvedValueOnce({ count: 0 });
    expect((await revocar()).status).toBe(404);
  });

  it("listar: cajero 403; manager lee con el tenant del JWT y sin la llave", async () => {
    const { GET } = await import("@/app/api/adelantos/beneficiarios/[id]/passkeys/route");
    const listar = () => GET(new NextRequest("http://localhost/x"), { params: Promise.resolve({ id: "b-juan" }) });
    H.auth = { role: "cajero", tenantId: "t-del-jwt", username: "x" };
    expect((await listar()).status).toBe(403);
    H.auth = { role: "manager", tenantId: "t-del-jwt", username: "x" };
    expect((await listar()).status).toBe(200);
    const q = H.pkFindMany.mock.calls[0][0] as { where: unknown; select: Record<string, unknown> };
    expect(q.where).toMatchObject({ tenantId: "t-del-jwt", beneficiarioId: "b-juan" });
    expect(q.select.publicKey).toBeUndefined();
    expect(q.select.credentialId).toBeUndefined();
  });
});
