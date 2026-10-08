// @vitest-environment node
/**
 * Tests — la dirección pública de los QR (contrato K4 (d), 08-10).
 *
 *   · `baseVerificacion`: dominio propio > negocio principal > subdominio >
 *     `/t/<slug>`; `localhost` e IP no sirven para subdominios.
 *   · Las direcciones de cada QR: la troza por línea lleva id + código.
 *   · La respuesta de la ruta se valida (Zod de salida).
 *   · `tenantIdPublico`: el `x-tenant-id` crudo (slug, `custom--`, CUID) →
 *     el id real; dominio desconocido o sin cabecera → null (nunca otro negocio).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RespuestaUrlPublicaSchema,
  baseVerificacion,
  urlVerificarCacao,
  urlVerificarDespacho,
  urlVerificarGuiaLoth,
  urlVerificarLote,
  urlVerificarTroza,
} from "@/lib/tenant-url-publica";

const BLAS = "inversiones-agroforestales-blas-sociedad-anonima";

describe("baseVerificacion", () => {
  it("dominio propio manda (sin esquema ni barra final)", () => {
    expect(
      baseVerificacion({ slug: BLAS, customDomain: "https://Madera.Blas.pe/", rootDomain: "buleje.pe", baseUrl: "https://buleje.pe" }),
    ).toEqual({ base: "https://madera.blas.pe", fuente: "dominio" });
  });

  it("el negocio por defecto usa la dirección principal", () => {
    expect(baseVerificacion({ slug: "main", customDomain: null, rootDomain: "buleje.pe", baseUrl: "https://buleje.pe/" })).toEqual({
      base: "https://buleje.pe",
      fuente: "principal",
    });
  });

  it("subdominio cuando el dominio raíz es real", () => {
    expect(baseVerificacion({ slug: BLAS, customDomain: null, rootDomain: "buleje.pe:443", baseUrl: "https://buleje.pe" })).toEqual({
      base: `https://${BLAS}.buleje.pe`,
      fuente: "subdominio",
    });
  });

  it("localhost, IP o sin raíz → `/t/<slug>` sobre la dirección principal", () => {
    for (const rootDomain of ["localhost", "127.0.0.1", null, ""]) {
      expect(baseVerificacion({ slug: BLAS, customDomain: null, rootDomain, baseUrl: "http://localhost:3000" })).toEqual({
        base: `http://localhost:3000/t/${BLAS}`,
        fuente: "ruta",
      });
    }
  });
});

describe("direcciones de los QR", () => {
  const base = `http://localhost:3000/t/${BLAS}/`;
  it("troza por línea: id limpio en la ruta, código (con «/» y espacios) en ?c=", () => {
    expect(urlVerificarTroza(base, { lineaId: "cmuxm8tq60003yvvznq98n0go", codigo: "12A-019/0001" })).toBe(
      `http://localhost:3000/t/${BLAS}/verificar/troza/cmuxm8tq60003yvvznq98n0go?c=12A-019%2F0001`,
    );
  });
  it("sin línea queda la forma vieja por código", () => {
    expect(urlVerificarTroza("https://x.pe", { codigo: "13/A (0000008)" })).toBe("https://x.pe/verificar/13%2FA%20(0000008)");
  });
  it("guía, despacho, lote y cacao", () => {
    expect(urlVerificarGuiaLoth("https://x.pe", "cm1")).toBe("https://x.pe/verificar/guia/cm1");
    expect(urlVerificarDespacho("https://x.pe/", "cm2")).toBe("https://x.pe/verificar/despacho/cm2");
    expect(urlVerificarLote("https://x.pe", "cm3")).toBe("https://x.pe/verificar/lote/cm3");
    expect(urlVerificarCacao("https://x.pe", "L 01")).toBe("https://x.pe/verificar-cacao/L%2001");
  });
});

describe("RespuestaUrlPublicaSchema (salida de GET /api/admin/tenant/url-publica)", () => {
  it("acepta la forma de la ruta y rechaza una base que no es URL", () => {
    expect(RespuestaUrlPublicaSchema.safeParse({ base: "http://localhost:3000/t/x", fuente: "ruta" }).success).toBe(true);
    expect(RespuestaUrlPublicaSchema.safeParse({ base: "/t/x", fuente: "ruta" }).success).toBe(false);
    expect(RespuestaUrlPublicaSchema.safeParse({ base: "https://x.pe", fuente: "navegador" }).success).toBe(false);
  });
});

describe("tenantIdPublico", () => {
  const findFirst = vi.fn();
  const findUnique = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    findFirst.mockReset();
    findUnique.mockReset();
    vi.doMock("@/lib/prisma", () => ({ prisma: { tenant: { findFirst, findUnique } } }));
    vi.doMock("@/lib/require-admin", () => ({ tryAdmin: async () => null }));
  });

  it("slug → CUID; el negocio por defecto y un CUID pasan tal cual", async () => {
    // Dos lecturas: slug → id, y si el negocio está activo (por id).
    findUnique.mockImplementation(async ({ where }: { where: { slug?: string; id?: string } }) => {
      if (where.id) return ["cmpxiv6p4000bohvzwl6bnfpv", "main"].includes(where.id) ? { active: true } : null;
      return where.slug === BLAS ? { id: "cmpxiv6p4000bohvzwl6bnfpv" } : where.slug === "main" ? { id: "main" } : null;
    });
    const { tenantIdPublico } = await import("@/lib/resolve-tenant");
    expect(await tenantIdPublico(BLAS)).toBe("cmpxiv6p4000bohvzwl6bnfpv");
    expect(await tenantIdPublico("main")).toBe("main");
    expect(await tenantIdPublico("cmpxiv6p4000bohvzwl6bnfpv")).toBe("cmpxiv6p4000bohvzwl6bnfpv");
  });

  it("dominio propio conocido → su id; desconocido o sin cabecera → null", async () => {
    findFirst.mockImplementation(async ({ where }: { where: { customDomain: string } }) =>
      where.customDomain === "madera.blas.pe" ? { slug: BLAS } : null,
    );
    findUnique.mockResolvedValue({ id: "cmpxiv6p4000bohvzwl6bnfpv", active: true });
    const { tenantIdPublico } = await import("@/lib/resolve-tenant");
    expect(await tenantIdPublico("custom--Madera.Blas.pe")).toBe("cmpxiv6p4000bohvzwl6bnfpv");
    expect(await tenantIdPublico("custom--otro.pe")).toBeNull();
    expect(await tenantIdPublico(null)).toBeNull();
    expect(await tenantIdPublico("  ")).toBeNull();
  });

  it("negocio dado de baja → null (por subdominio o /t/<slug> no sigue publicando)", async () => {
    findUnique.mockImplementation(async ({ where }: { where: { slug?: string; id?: string } }) =>
      where.id ? { active: false } : where.slug === BLAS ? { id: "cmpxiv6p4000bohvzwl6bnfpv" } : null,
    );
    const { tenantIdPublico } = await import("@/lib/resolve-tenant");
    expect(await tenantIdPublico(BLAS)).toBeNull();
  });
});
