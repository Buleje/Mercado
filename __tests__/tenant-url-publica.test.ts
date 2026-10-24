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
 *   · QR corto (ADR-486): código de 5 letras por negocio, base `…/v[/<código>]`,
 *     una letra por documento, ida y vuelta con la ruta larga, dueño del
 *     código = el negocio más viejo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RespuestaUrlPublicaSchema,
  baseQrCorta,
  baseVerificacion,
  codigoCortoNegocio,
  duenosDeCodigosCortos,
  esBaseCorta,
  leerRutaCorta,
  negocioDeCodigoEnHost,
  rutaLargaDeCorta,
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

describe("QR corto (ADR-486)", () => {
  const BLAS_ID = "cmpxiv6p4000bohvzwl6bnfpv";
  const LINEA = "cmuxm8tq60003yvvznq98n0go";

  it("el código del negocio sale de su id: 5 letras, siempre el mismo (está impreso: no cambiar)", () => {
    expect(codigoCortoNegocio(BLAS_ID)).toBe("il3g4");
    expect(codigoCortoNegocio("main")).toBe("30hzc");
    expect(codigoCortoNegocio("cmnegocio8079")).toBe(codigoCortoNegocio("cmnegocio11282"));
  });

  it("si dos negocios caen en el mismo código, es del más viejo aunque esté de baja", () => {
    const viejo = { id: "cmnegocio8079", active: false, createdAt: new Date("2026-01-01") };
    const nuevo = { id: "cmnegocio11282", active: true, createdAt: new Date("2026-05-01") };
    const mapa = duenosDeCodigosCortos([nuevo, viejo]);
    expect(mapa.get("inszj")).toEqual({ id: "cmnegocio8079", activo: false });
    expect(duenosDeCodigosCortos([{ id: BLAS_ID, active: true, createdAt: new Date() }]).get("il3g4")).toEqual({ id: BLAS_ID, activo: true });
  });

  it("base corta: el host que ya dice el negocio suma /v; /t/<slug> pasa a /v/<código>", () => {
    expect(baseQrCorta({ base: "https://madera.blas.pe", fuente: "dominio" }, { codigo: null, baseUrl: "https://www.buleje.pe" })).toEqual({
      base: "https://madera.blas.pe/v",
      fuente: "dominio",
    });
    expect(baseQrCorta({ base: "https://www.buleje.pe/", fuente: "principal" }, { codigo: null, baseUrl: "https://www.buleje.pe" }).base).toBe(
      "https://www.buleje.pe/v",
    );
    const larga = { base: `https://www.buleje.pe/t/${BLAS}`, fuente: "ruta" as const };
    expect(baseQrCorta(larga, { codigo: "il3g4", baseUrl: "https://www.buleje.pe/" }).base).toBe("https://www.buleje.pe/v/il3g4");
    // Sin código propio (choque con uno más viejo) se queda la larga.
    expect(baseQrCorta(larga, { codigo: null, baseUrl: "https://www.buleje.pe" })).toEqual(larga);
    expect(baseQrCorta(larga, { codigo: "IL3G4", baseUrl: "https://www.buleje.pe" })).toEqual(larga);
  });

  it("¿base corta? se mira la ruta anclada: un negocio con slug «v» es larga", () => {
    expect(esBaseCorta("https://x.pe/v")).toBe(true);
    expect(esBaseCorta("https://x.pe/v/il3g4/")).toBe(true);
    expect(esBaseCorta("https://x.pe/t/v")).toBe(false);
    expect(esBaseCorta("https://x.pe/t/il3g4")).toBe(false);
    expect(esBaseCorta("https://x.pe")).toBe(false);
    expect(esBaseCorta("/v/il3g4")).toBe(false);
  });

  it("con base corta cada QR usa su letra; con la larga, la ruta de siempre", () => {
    const b = "https://www.buleje.pe/v/il3g4";
    expect(urlVerificarTroza(b, { lineaId: LINEA, codigo: "12A-019/0001" })).toBe(`${b}/t/${LINEA}?c=12A-019%2F0001`);
    expect(urlVerificarTroza(b, { codigo: "13/A (0000008)" })).toBe(`${b}/c/13%2FA%20(0000008)`);
    expect(urlVerificarGuiaLoth(b, "cm1")).toBe(`${b}/g/cm1`);
    expect(urlVerificarDespacho(`${b}/`, "cm2")).toBe(`${b}/d/cm2`);
    expect(urlVerificarLote(b, "cm3")).toBe(`${b}/l/cm3`);
    expect(urlVerificarCacao(b, "L 01")).toBe(`${b}/k/L%2001`);
    expect(urlVerificarGuiaLoth("https://madera.blas.pe/v", "cm1")).toBe("https://madera.blas.pe/v/g/cm1");
  });

  it("ida y vuelta: la ruta corta se lee como la larga de cada documento", () => {
    const larga = "https://x.pe";
    for (const corta of ["https://x.pe/v", "https://x.pe/v/il3g4"]) {
      const pares: Array<[string, string]> = [
        [urlVerificarTroza(corta, { lineaId: LINEA, codigo: "111-A" }), urlVerificarTroza(larga, { lineaId: LINEA, codigo: "111-A" })],
        [urlVerificarTroza(corta, { codigo: "13/A" }), urlVerificarTroza(larga, { codigo: "13/A" })],
        [urlVerificarGuiaLoth(corta, LINEA), urlVerificarGuiaLoth(larga, LINEA)],
        [urlVerificarDespacho(corta, "cm2"), urlVerificarDespacho(larga, "cm2")],
        [urlVerificarLote(corta, "cm3"), urlVerificarLote(larga, "cm3")],
        [urlVerificarCacao(corta, "L 01"), urlVerificarCacao(larga, "L 01")],
      ];
      for (const [c, l] of pares) expect(rutaLargaDeCorta(new URL(c).pathname)).toBe(new URL(l).pathname);
    }
  });

  it("sólo las formas del QR: otra cosa no es ruta corta (404 sin pistas)", () => {
    expect(leerRutaCorta(["il3g4", "t", LINEA])).toEqual({ negocio: "il3g4", tipo: "t", valor: LINEA });
    expect(leerRutaCorta(["t", LINEA])).toEqual({ negocio: null, tipo: "t", valor: LINEA });
    expect(leerRutaCorta(["il3g4", "z", LINEA])).toBeNull();
    expect(leerRutaCorta(["IL3G4", "t", LINEA])).toBeNull();
    expect(leerRutaCorta(["il3g", "t", LINEA])).toBeNull();
    expect(leerRutaCorta(["il3g4", "t"])).toBeNull();
    expect(leerRutaCorta(["il3g4", "t", LINEA, "x"])).toBeNull();
    expect(leerRutaCorta(["toString", LINEA])).toBeNull();
    expect(rutaLargaDeCorta("/v/il3g4")).toBeNull();
    expect(rutaLargaDeCorta("/verificar/troza/cm1")).toBeNull();
  });
});

describe("el código corto sólo vale en el host principal (revisión ADR-486)", () => {
  const BLAS_ID = "cmpxiv6p4000bohvzwl6bnfpv";
  const OTRO = "cmotronegocio0001";

  it("host principal (neutro): manda el código", () => {
    expect(negocioDeCodigoEnHost(BLAS_ID, { concreto: false, tenantId: null })).toBe(BLAS_ID);
  });

  it("/t/<slug>, subdominio o dominio propio de OTRO negocio → no encontrado", () => {
    expect(negocioDeCodigoEnHost(BLAS_ID, { concreto: true, tenantId: OTRO })).toBeNull();
    expect(negocioDeCodigoEnHost(BLAS_ID, { concreto: true, tenantId: null })).toBeNull();
  });

  it("el mismo negocio en host y código → abre; código desconocido → no encontrado", () => {
    expect(negocioDeCodigoEnHost(BLAS_ID, { concreto: true, tenantId: BLAS_ID })).toBe(BLAS_ID);
    expect(negocioDeCodigoEnHost(null, { concreto: false, tenantId: null })).toBeNull();
    expect(negocioDeCodigoEnHost(null, { concreto: true, tenantId: null })).toBeNull();
  });
});

describe("código corto → negocio (resolve-tenant)", () => {
  const findMany = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    findMany.mockReset();
    vi.doMock("@/lib/prisma", () => ({ prisma: { tenant: { findMany, findFirst: vi.fn(), findUnique: vi.fn() } } }));
    vi.doMock("@/lib/require-admin", () => ({ tryAdmin: async () => null }));
  });

  it("el código de un negocio activo da su id; desconocido, mal formado o de baja → null", async () => {
    findMany.mockResolvedValue([
      { id: "cmpxiv6p4000bohvzwl6bnfpv", active: true, createdAt: new Date("2026-03-01") },
      { id: "main", active: false, createdAt: new Date("2025-01-01") },
    ]);
    const { tenantIdPorCodigoCorto } = await import("@/lib/resolve-tenant");
    expect(await tenantIdPorCodigoCorto("il3g4")).toBe("cmpxiv6p4000bohvzwl6bnfpv");
    expect(await tenantIdPorCodigoCorto(" IL3G4 ")).toBe("cmpxiv6p4000bohvzwl6bnfpv");
    expect(await tenantIdPorCodigoCorto("30hzc")).toBeNull();
    expect(await tenantIdPorCodigoCorto("zzzzz")).toBeNull();
    expect(await tenantIdPorCodigoCorto("il3g4/../x")).toBeNull();
    // Una sola lectura de la base: el mapa queda en caché y un desconocido no relee antes del minuto.
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("el negocio más nuevo de un choque no recibe código: sus QR quedan largos", async () => {
    findMany.mockResolvedValue([
      { id: "cmnegocio8079", active: true, createdAt: new Date("2026-01-01") },
      { id: "cmnegocio11282", active: true, createdAt: new Date("2026-05-01") },
    ]);
    const { codigoCortoPublicable, tenantIdPorCodigoCorto } = await import("@/lib/resolve-tenant");
    expect(await codigoCortoPublicable("cmnegocio8079")).toBe("inszj");
    expect(await codigoCortoPublicable("cmnegocio11282")).toBeNull();
    expect(await tenantIdPorCodigoCorto("inszj")).toBe("cmnegocio8079");
  });

  it("si la base falla, ningún código abre nada (y no revienta)", async () => {
    findMany.mockRejectedValue(new Error("pooler caído"));
    const { tenantIdPorCodigoCorto, codigoCortoPublicable } = await import("@/lib/resolve-tenant");
    expect(await tenantIdPorCodigoCorto("il3g4")).toBeNull();
    expect(await codigoCortoPublicable("cmpxiv6p4000bohvzwl6bnfpv")).toBeNull();
  });
});
