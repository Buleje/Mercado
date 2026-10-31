/**
 * __tests__/membrete-db.test.ts — ADR-514 (23-10): el membrete de los papeles.
 *
 * Manda Ajustes, `Tenant` es respaldo, nunca «Buleje»; el membrete se cachea y
 * guardar Ajustes lo olvida; el logo sale en PNG (el de Blas es WebP) y sólo se
 * baja de lugares propios (sin SSRF ni archivos privados de otro negocio).
 * Caché real (`lib/cache` en memoria) y `sharp` real; Prisma y Settings, falsos.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const { settingsGet, tenantFind, fetchSeguro, descargar, logger } = vi.hoisted(() => ({
  settingsGet: vi.fn(async (_t: string): Promise<Record<string, unknown>> => ({})),
  tenantFind: vi.fn(async (_a: { where: { id?: string; slug?: string } }): Promise<{ name: string | null; logoUrl: string | null } | null> => null),
  fetchSeguro: vi.fn(async (..._a: unknown[]): Promise<Response> => new Response(null, { status: 404 })),
  descargar: vi.fn(async (_ruta: string): Promise<{ data: Blob | null; error: Error | null }> => ({ data: null, error: new Error("no") })),
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: { get: settingsGet } }));
vi.mock("@/lib/prisma", () => ({ prisma: { tenant: { findUnique: tenantFind } } }));
vi.mock("@/lib/safe-fetch", () => ({ safeFetch: fetchSeguro }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ storage: { from: () => ({ download: descargar }) } }) }));
vi.mock("@/lib/logger", () => ({ logger }));

import { MembreteDB } from "@/lib/db/membrete.db";
import { invalidateByPrefix } from "@/lib/cache";
import { formatoPorFirma, origenDelLogo, validarLogoUrl } from "@/lib/admin/membrete-logo.server";

const SUPA = "https://proyecto.supabase.co";
const ENTORNO = { supabaseUrl: SUPA, baseUrl: "https://bulejesm.com" };
const PNG_FIRMA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let webpDataUrl = "";
let webpBytes: Buffer;
beforeAll(async () => {
  // Fixture chico: un WebP de 1200×300 (como el LOGO_UNICO.webp de Blas, apaisado).
  webpBytes = await sharp({ create: { width: 1200, height: 300, channels: 3, background: { r: 20, g: 120, b: 60 } } }).webp().toBuffer();
  webpDataUrl = `data:image/webp;base64,${webpBytes.toString("base64")}`;
});

let n = 0;
let tid = "";
beforeEach(() => {
  vi.clearAllMocks();
  tid = `t-membrete-${++n}`; // un negocio nuevo por caso: la caché real no se cruza
  settingsGet.mockResolvedValue({});
  tenantFind.mockResolvedValue(null);
});

describe("MembreteDB.del", () => {
  it("Ajustes manda sobre el registro del negocio (nombre comercial, logo, contacto)", async () => {
    settingsGet.mockResolvedValue({ businessName: "Aserradero Blas", razonSocial: "INVERSIONES BLAS SAC", ruc: "20605859438", logoUrl: `${SUPA}/a.webp`, businessEmail: "a@b.pe" });
    tenantFind.mockResolvedValue({ name: "Inversiones Agroforestales BLAS sac", logoUrl: `${SUPA}/t.png` });
    const m = await MembreteDB.del(tid);
    expect(m).toMatchObject({ nombre: "Aserradero Blas", razonSocial: "INVERSIONES BLAS SAC", ruc: "20605859438", logoUrl: `${SUPA}/a.webp`, fuenteLogo: "ajustes", correo: "a@b.pe" });
    expect(m.logoPngUrl).toMatch(/^\/api\/admin\/membrete\/logo\?v=/);
  });

  it("con Ajustes vacío cae al registro; sin nada, null — nunca «Buleje»", async () => {
    settingsGet.mockResolvedValue({ businessName: "", logoUrl: "" });
    tenantFind.mockResolvedValue({ name: "Inversiones Agroforestales BLAS sac", logoUrl: `${SUPA}/t.png` });
    expect(await MembreteDB.del(tid)).toMatchObject({ nombre: "Inversiones Agroforestales BLAS sac", fuenteLogo: "registro" });

    tenantFind.mockResolvedValue(null);
    const vacio = await MembreteDB.del(`${tid}-vacio`);
    expect(vacio.nombre).toBeNull();
    expect(JSON.stringify(vacio)).not.toMatch(/buleje/i);
  });

  it("se cachea por negocio y guardar Ajustes (prefijo settings:<id>) lo olvida", async () => {
    settingsGet.mockResolvedValue({ businessName: "Antes" });
    expect((await MembreteDB.del(tid)).nombre).toBe("Antes");
    expect((await MembreteDB.del(tid)).nombre).toBe("Antes");
    expect(settingsGet).toHaveBeenCalledTimes(1);

    settingsGet.mockResolvedValue({ businessName: "Después" });
    invalidateByPrefix(`settings:${tid}`); // lo que hace SettingsDB.set al guardar
    expect((await MembreteDB.del(tid)).nombre).toBe("Después");

    settingsGet.mockResolvedValue({ businessName: "Tercero" });
    MembreteDB.olvidar(tid); // lo que hace el superadmin al cambiar nombre/logo del Tenant
    expect((await MembreteDB.del(tid)).nombre).toBe("Tercero");
    expect(settingsGet).toHaveBeenCalledTimes(3);
  });

  it("otro negocio no comparte la caché", async () => {
    settingsGet.mockImplementation(async (t: string) => ({ businessName: t === tid ? "Uno" : "Dos" }));
    expect((await MembreteDB.del(tid)).nombre).toBe("Uno");
    expect((await MembreteDB.del(`${tid}-otro`)).nombre).toBe("Dos");
  });

  it("sin tenantId tira (nunca un negocio por defecto)", async () => {
    await expect(MembreteDB.del("")).rejects.toThrow(/tenantId/);
    await expect(MembreteDB.logoPng("")).rejects.toThrow(/tenantId/);
  });
});

describe("MembreteDB.logoPng", () => {
  it("un WebP (como el de Blas) sale PNG, con el lado mayor en 600 px y la proporción", async () => {
    settingsGet.mockResolvedValue({ logoUrl: webpDataUrl });
    const logo = await MembreteDB.logoPng(tid);
    expect(logo).not.toBeNull();
    expect(logo!.bytes.subarray(0, 8).equals(PNG_FIRMA)).toBe(true);
    expect([logo!.ancho, logo!.alto]).toEqual([600, 150]);
    expect((await sharp(logo!.bytes).metadata()).format).toBe("png");
    expect(logo!.etag).toMatch(/^"[0-9a-f]{20}"$/);
  });

  it("del bucket público lo baja por safeFetch al host del proyecto y lo cachea", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPA);
    fetchSeguro.mockImplementation(async () => new Response(new Uint8Array(webpBytes), { status: 200 }));
    settingsGet.mockResolvedValue({ logoUrl: `${SUPA}/storage/v1/object/public/media/${tid}/branding/LOGO_UNICO.webp` });
    const a = await MembreteDB.logoPng(tid);
    const b = await MembreteDB.logoPng(tid);
    expect(a?.ancho).toBe(600);
    expect(b).toBe(a);
    expect(fetchSeguro).toHaveBeenCalledTimes(1);
    expect(fetchSeguro.mock.calls[0][1]).toMatchObject({ allowedHosts: ["proyecto.supabase.co"] });
    vi.unstubAllEnvs();
  });

  it("un host ajeno no se pide (SSRF): null y sin fetch", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPA);
    const fetchGlobal = vi.spyOn(globalThis, "fetch");
    settingsGet.mockResolvedValue({ logoUrl: "http://169.254.169.254/latest/meta-data/logo.png" });
    expect(await MembreteDB.logoPng(tid)).toBeNull();
    expect(fetchSeguro).not.toHaveBeenCalled();
    expect(fetchGlobal).not.toHaveBeenCalled();
    fetchGlobal.mockRestore();
    vi.unstubAllEnvs();
  });

  it("sólo PNG/JPEG/WebP/GIF/AVIF por los primeros bytes: SVG y TIFF disfrazados de PNG = null; el PNG de public/ sí", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="red"/></svg>');
    settingsGet.mockResolvedValue({ logoUrl: `data:image/png;base64,${svg.toString("base64")}` });
    expect(await MembreteDB.logoPng(tid)).toBeNull();

    const tiff = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 0, g: 0, b: 0 } } }).tiff().toBuffer();
    settingsGet.mockResolvedValue({ logoUrl: `data:image/png;base64,${tiff.toString("base64")}` });
    expect(await MembreteDB.logoPng(`${tid}-tiff`)).toBeNull();

    settingsGet.mockResolvedValue({ logoUrl: "/musa/logo/musa-logo-color.svg" }); // el SVG de Musa ya no entra
    expect(await MembreteDB.logoPng(`${tid}-svg`)).toBeNull();

    settingsGet.mockResolvedValue({ logoUrl: "/musa/logo/musa-logo-color-2000px.png" });
    const musa = await MembreteDB.logoPng(`${tid}-musa`);
    expect(Math.max(musa?.ancho ?? 0, musa?.alto ?? 0)).toBe(600);
  });

  it("el ataque de la revisión (%252e%252e hacia el Drive de otro negocio) no llega a la llave de servicio", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPA);
    settingsGet.mockResolvedValue({ logoUrl: `${SUPA}/storage/v1/object/authenticated/documents/tenants/${tid}/%252e%252e/OTRO/doc/dni.jpg` });
    expect(await MembreteDB.logoPng(tid)).toBeNull();
    expect(descargar).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("del Drive del propio negocio sí lo baja (llave de servicio, carpeta tenants/<id>/)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPA);
    descargar.mockResolvedValue({ data: new Blob([new Uint8Array(webpBytes)]), error: null });
    settingsGet.mockResolvedValue({ logoUrl: `${SUPA}/storage/v1/object/sign/documents/tenants/${tid}/doc1/v1-ab__logo.webp?token=x` });
    expect((await MembreteDB.logoPng(tid))?.ancho).toBe(600);
    expect(descargar).toHaveBeenCalledWith(`tenants/${tid}/doc1/v1-ab__logo.webp`);
    vi.unstubAllEnvs();
  });

  it("sin logo, null sin bajar nada", async () => {
    expect(await MembreteDB.logoPng(tid)).toBeNull();
    expect(fetchSeguro).not.toHaveBeenCalled();
    expect(descargar).not.toHaveBeenCalled();
  });
});

const BLAS = "cmpxiv6p4000bohvzwl6bnfpv";
const SUPA_REAL = "https://sofkgguriggocouiuamx.supabase.co";
const LOGO_BLAS = `${SUPA_REAL}/storage/v1/object/public/media/${BLAS}/branding/1792786412871-LOGO_UNICO.webp`;

describe("origenDelLogo (sin SSRF)", () => {
  const o = (url: string, t = "t1") => origenDelLogo(t, url, ENTORNO);

  it("bloquea hosts ajenos, IPs, protocolos raros, /api/, `..` y URLs con usuario", () => {
    for (const url of [
      "https://evil.example/logo.png",
      "http://169.254.169.254/latest/meta-data",
      "http://127.0.0.1:3000/logo.png",
      "file:///etc/passwd",
      "ftp://proyecto.supabase.co/x.png",
      "/api/admin/membrete/logo",
      "/_next/static/x.png",
      "/../../etc/passwd",
      "/%2e%2e/%2e%2e/etc/passwd",
      "/%252e%252e/etc/passwd",
      "/img/..%5C..%5Cetc/passwd",
      "https://bulejesm.com/%2e%2e/.env",
      "https://bulejesm.com/.env",
      "https://bulejesm.com/img/./logo.png",
      "/robots.txt",
      "/musa/logo/musa-logo-color.svg",
      "//evil.example/logo.png",
      "https://user:pass@proyecto.supabase.co/storage/v1/object/public/media/t1/a.png",
      "https://proyecto.supabase.co/rest/v1/Settings",
      "https://proyecto.supabase.co.evil.example/storage/v1/object/public/media/a.png",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:text/html;base64,PHNjcmlwdD4=",
    ]) {
      expect(o(url).tipo, url).toBe("bloqueado");
    }
  });

  it("el CRÍTICO de la revisión: doble codificación, `..`, `\\`, buckets privados y carpeta ajena = bloqueado", () => {
    const D = `${SUPA}/storage/v1/object/authenticated/documents`;
    for (const url of [
      `${D}/tenants/t1/%252e%252e/t2/doc/dni.jpg`,
      `${D}/tenants/t1/%252E%252E/t2/doc/dni.jpg`,
      `${D}/tenants/t1/%252e%252e/%252e%252e/adelantos-privado/t2/firma.png`,
      `${D}/tenants/t1/%2e%2e/%2e%2e/tenants/t2/doc/dni.jpg`,
      `${D}/tenants/t1/../../tenants/t2/doc/dni.jpg`,
      `${D}/tenants/t1/..%2F..%2Ftenants%2Ft2/dni.jpg`,
      `${D}/tenants/t1/..%5C..%5Ctenants%5Ct2/dni.jpg`,
      `${D}/tenants/t1/..\\..\\tenants\\t2\\dni.jpg`,
      `${D}/tenants/t1/.%2Fdoc/dni.jpg`,
      `${D}/tenants/t1//doc/dni.jpg`,
      `${D}/tenants/t1/doc%3F/dni.jpg`,
      `${D}/tenants/t1/doc%23/dni.jpg`,
      `${D}/tenants/t1/doc%00/dni.jpg`,
      `${D}/tenants/t2/doc/dni.jpg`,
      `${D}/t1/logo.png`,
      `${SUPA}/storage/v1/object/authenticated/adelantos-privado/tenants/t1/firma.png`,
      `${SUPA}/storage/v1/object/sign/forestal-privado/tenants/t1/guia.png?token=x`,
      `${SUPA}/storage/v1/object/public/otro-bucket/t1/logo.png`,
      `${SUPA}/storage/v1/object/public/media/t1/%252e%252e/x.png`,
      `${SUPA}/storage/v1/object/public/__proto__/t1/x.png`,
    ]) {
      expect(o(url).tipo, url).toBe("bloqueado");
    }
  });

  it("el logo real de Blas sigue pasando; del Drive, sólo la carpeta del propio negocio", () => {
    expect(origenDelLogo(BLAS, LOGO_BLAS, { supabaseUrl: SUPA_REAL })).toEqual({
      tipo: "bucket",
      bucket: "media",
      ruta: `${BLAS}/branding/1792786412871-LOGO_UNICO.webp`,
      publico: true,
    });
    expect(o(`${SUPA}/storage/v1/object/sign/documents/tenants/t1/doc/v1__logo%20nuevo.png?token=x`)).toEqual({
      tipo: "bucket",
      bucket: "documents",
      ruta: "tenants/t1/doc/v1__logo nuevo.png",
      publico: false,
    });
  });

  it("permite data URL de imagen, public/ y el propio dominio", () => {
    expect(o(`${SUPA}/storage/v1/object/public/media/otro/branding/a.webp`)).toMatchObject({ tipo: "bucket", publico: true });
    expect(o("data:image/png;base64,iVBORw0KGgo=").tipo).toBe("data");
    expect(o("/musa/logo/musa-logo-color-2000px.png")).toEqual({ tipo: "archivo", ruta: "/musa/logo/musa-logo-color-2000px.png" });
    expect(o("https://bulejesm.com/logo.png?x=1")).toEqual({ tipo: "archivo", ruta: "/logo.png" });
  });
});

describe("validarLogoUrl (al guardar Ajustes)", () => {
  it("vacío o null = sin logo; el de Blas pasa recortado", () => {
    expect(validarLogoUrl("t1", null, ENTORNO)).toEqual({ ok: true, valor: null });
    expect(validarLogoUrl("t1", "", ENTORNO)).toEqual({ ok: true, valor: "" });
    expect(validarLogoUrl(BLAS, `  ${LOGO_BLAS} `, { supabaseUrl: SUPA_REAL })).toEqual({ ok: true, valor: LOGO_BLAS });
  });

  it("rechaza lo largo, lo que no es texto, hosts ajenos y el ataque al Drive ajeno", () => {
    for (const v of [
      `https://proyecto.supabase.co/storage/v1/object/public/media/t1/${"a".repeat(2100)}.png`,
      123,
      { url: "x" },
      "https://evil.example/logo.png",
      "javascript:alert(1)",
      `${SUPA}/storage/v1/object/authenticated/documents/tenants/t1/%252e%252e/t2/dni.jpg`,
    ]) {
      const r = validarLogoUrl("t1", v, ENTORNO);
      expect(r.ok, String(v).slice(0, 80)).toBe(false);
    }
  });
});

describe("formatoPorFirma", () => {
  it("reconoce PNG, JPEG, GIF, WebP y AVIF; SVG, TIFF y HEIC no", async () => {
    const hacer = (f: "png" | "jpeg" | "gif" | "webp" | "tiff") => sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 1, g: 2, b: 3 } } })[f]().toBuffer();
    expect(formatoPorFirma(await hacer("png"))).toBe("png");
    expect(formatoPorFirma(await hacer("jpeg"))).toBe("jpeg");
    expect(formatoPorFirma(await hacer("gif"))).toBe("gif");
    expect(formatoPorFirma(await hacer("webp"))).toBe("webp");
    expect(formatoPorFirma(await hacer("tiff"))).toBeNull();
    expect(formatoPorFirma(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(formatoPorFirma(Buffer.from("\0\0\0\x18ftypavif\0\0\0\0", "latin1"))).toBe("avif");
    expect(formatoPorFirma(Buffer.from("\0\0\0\x18ftypheic\0\0\0\0", "latin1"))).toBeNull();
  });
});
