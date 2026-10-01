/**
 * Fotos de la carga (ADR-434, 2026-09-26): la forma única de leerlas, cómo se
 * arma el `src`, el candado del path privado por tenant, el Zod del PATCH que
 * acepta las dos formas, y el sello del servidor sobre `por`/`subidaEn`.
 */
import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  esFotoPrivada,
  esPathDeCargaDelTenant,
  normalizarFotos,
  pathDeFoto,
  srcDeFoto,
  tieneFotos,
  urlPrivada,
  type FotoCarga,
} from "@/lib/forestal/fotos-carga";
import { exigirFotosPropias, fotosDelTenantSchema } from "@/lib/storage-url";
import { firmaValida, firmarFoto, FotoNoValidaError, resolverFotosEntrantes } from "@/lib/forestal/fotos-carga-firma";
import { pendientesDelLibro, type DatosPendientes } from "@/lib/forestal/ctp-pendientes";

const T = "cmt_este_tenant";
const OTRO = "cmt_otro_tenant";
const BASE = "https://sofkgguriggocouiuamx.supabase.co";
const legado = (t = T) => `${BASE}/storage/v1/object/public/media/${t}/forestal/1790000000000-foto.webp`;
const priv = (t = T, archivo = "3f2a9c1e-0000-4000-8000-000000000001.webp") => urlPrivada(`${t}/forestal-carga/${archivo}`);

let previo: string | undefined;
beforeEach(() => {
  previo = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = BASE;
});
afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = previo;
});

describe("normalizarFotos", () => {
  it("acepta el array viejo de strings y lo vuelve objetos", () => {
    expect(normalizarFotos([legado()])).toEqual([{ url: legado() }]);
  });

  it("acepta objetos y mezcla, conserva los metadatos válidos", () => {
    const r = normalizarFotos([
      legado(),
      { url: priv(), tomadaEn: "2026-09-26T10:00:00.000Z", por: "ana", lat: -8.38, lng: -74.55, precisionM: 12, sellada: true },
    ]);
    expect(r).toHaveLength(2);
    expect(r[1]).toMatchObject({ url: priv(), por: "ana", lat: -8.38, sellada: true });
  });

  it("descarta basura: null, números, javascript:, objetos sin url, lat fuera de rango", () => {
    const r = normalizarFotos([null, 3, "javascript:alert(1)", { foo: 1 }, "", { url: priv(), lat: 200 }]);
    expect(r).toEqual([{ url: priv() }]);
  });

  it("no revienta con lo que no es array", () => {
    expect(normalizarFotos(null)).toEqual([]);
    expect(normalizarFotos("x")).toEqual([]);
    expect(normalizarFotos({ url: priv() })).toEqual([]);
  });

  it("saca las repetidas por URL", () => {
    expect(normalizarFotos([legado(), { url: legado() }])).toHaveLength(1);
  });

  it("rechaza un priv: con `..`", () => {
    expect(normalizarFotos([`priv:${T}/forestal-carga/../x.webp`])).toEqual([]);
  });
});

describe("srcDeFoto / esFotoPrivada / pathDeFoto", () => {
  it("privada → la ruta que firma, con el path codificado", () => {
    const f: FotoCarga = { url: priv() };
    expect(esFotoPrivada(f)).toBe(true);
    expect(pathDeFoto(f)).toBe(`${T}/forestal-carga/3f2a9c1e-0000-4000-8000-000000000001.webp`);
    expect(srcDeFoto(f)).toBe(
      `/api/admin/forestal/fotos/ver?p=${encodeURIComponent(`${T}/forestal-carga/3f2a9c1e-0000-4000-8000-000000000001.webp`)}`,
    );
  });

  it("legado → la misma URL, como string o como objeto", () => {
    expect(srcDeFoto(legado())).toBe(legado());
    expect(srcDeFoto({ url: legado() })).toBe(legado());
    expect(esFotoPrivada(legado())).toBe(false);
  });
});

describe("esPathDeCargaDelTenant (candado de /fotos/ver)", () => {
  it("acepta el path que arma el POST", () => {
    expect(esPathDeCargaDelTenant(`${T}/forestal-carga/3f2a9c1e-0000-4000-8000-000000000001.webp`, T)).toBe(true);
  });
  it("rechaza otro tenant", () => {
    expect(esPathDeCargaDelTenant(`${OTRO}/forestal-carga/a.webp`, T)).toBe(false);
  });
  it("rechaza escaparse de la carpeta", () => {
    expect(esPathDeCargaDelTenant(`${T}/forestal-carga/../../${OTRO}/forestal-carga/a.webp`, T)).toBe(false);
    expect(esPathDeCargaDelTenant(`${T}/forestal-carga/sub/a.webp`, T)).toBe(false);
    expect(esPathDeCargaDelTenant(`${T}/forestal-carga/..`, T)).toBe(false);
    expect(esPathDeCargaDelTenant(`${T}/forestal-carga/a\\b.webp`, T)).toBe(false);
  });
  it("rechaza otra carpeta del mismo tenant y el tenant vacío", () => {
    expect(esPathDeCargaDelTenant(`${T}/rrhh/a.webp`, T)).toBe(false);
    expect(esPathDeCargaDelTenant(`/forestal-carga/a.webp`, "")).toBe(false);
  });
  it("un tenant que es PREFIJO de otro no entra a la carpeta del otro", () => {
    expect(esPathDeCargaDelTenant(`${T}x/forestal-carga/a.webp`, T)).toBe(false);
  });
});

describe("fotosDelTenantSchema — sólo privadas propias, guarda objetos", () => {
  it("string u objeto privado propio → objetos, con su firma intacta", () => {
    const firma = "a".repeat(64);
    const r = fotosDelTenantSchema(T).safeParse([priv(T, "a.webp"), { url: priv(), sellada: true, firma }]);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual([{ url: priv(T, "a.webp") }, { url: priv(), sellada: true, firma }]);
  });
  it("privada de OTRO tenant → rechazo", () => {
    expect(fotosDelTenantSchema(T).safeParse([{ url: priv(OTRO) }]).success).toBe(false);
  });
  it("https (legado propio, de otro, o externa) → rechazo", () => {
    expect(fotosDelTenantSchema(T).safeParse([legado()]).success).toBe(false);
    expect(fotosDelTenantSchema(T).safeParse([legado(OTRO)]).success).toBe(false);
    expect(fotosDelTenantSchema(T).safeParse([{ url: "https://evil.example.com/a.webp" }]).success).toBe(false);
  });
  it("exigirFotosPropias (guard de la DB class) sólo acepta privadas propias", () => {
    expect(() => exigirFotosPropias(T, [{ url: priv() }])).not.toThrow();
    expect(() => exigirFotosPropias(T, [legado()])).toThrow();
    expect(() => exigirFotosPropias(T, [{ url: priv(OTRO) }])).toThrow();
  });
});

describe("normalizarFoto conserva la firma (el cliente la devuelve tal cual)", () => {
  it("una firma hex de 64 pasa; basura se descarta", () => {
    const firma = "0123456789abcdef".repeat(4);
    expect(normalizarFotos([{ url: priv(), firma }])[0]!.firma).toBe(firma);
    expect(normalizarFotos([{ url: priv(), firma: "no-es-hex" }])[0]!.firma).toBeUndefined();
  });
});

describe("firma de la foto (HMAC del servidor)", () => {
  let secreto: string | undefined;
  let previo2: string | undefined;
  beforeEach(() => {
    secreto = process.env.AUTH_SECRET;
    previo2 = process.env.AUTH_SECRET_PREVIOUS;
    process.env.AUTH_SECRET = "secreto-de-prueba-de-32-caracteres!!";
    delete process.env.AUTH_SECRET_PREVIOUS;
  });
  afterEach(() => {
    process.env.AUTH_SECRET = secreto;
    if (previo2 === undefined) delete process.env.AUTH_SECRET_PREVIOUS;
    else process.env.AUTH_SECRET_PREVIOUS = previo2;
  });

  const subida = (): FotoCarga =>
    firmarFoto({
      url: priv(),
      tomadaEn: "2026-09-26T10:00:00.000Z",
      subidaEn: "2026-09-26T10:01:00.000Z",
      por: "ana",
      lat: -8.38,
      lng: -74.55,
      precisionM: 12,
      sellada: true,
    });

  it("la foto firmada valida, y sigue validando tras el viaje JSON + normalizarFotos del cliente", () => {
    const f = subida();
    expect(f.firma).toMatch(/^[0-9a-f]{64}$/);
    const ida = normalizarFotos(JSON.parse(JSON.stringify([f])))[0]!;
    expect(firmaValida(ida)).toBe(true);
  });

  it.each([
    ["lat", { lat: -8.4 }],
    ["lng", { lng: -74.5 }],
    ["tomadaEn", { tomadaEn: "2026-09-20T10:00:00.000Z" }],
    ["subidaEn atrasada", { subidaEn: "2026-09-25T12:00:00.000Z" }],
    ["por", { por: "otro" }],
    ["sellada", { sellada: false }],
    ["precisionM", { precisionM: 1 }],
    ["url (otra foto)", { url: priv(T, "otra.webp") }],
  ])("cambiar %s invalida la firma", (_campo, cambio) => {
    expect(firmaValida({ ...subida(), ...cambio })).toBe(false);
  });

  it("sin firma o firmada con otro secreto → inválida; el secreto anterior vale durante una rotación", () => {
    const { firma: _f, ...sin } = subida();
    expect(firmaValida(sin)).toBe(false);
    const f = subida();
    process.env.AUTH_SECRET = "otro-secreto-rotado-de-32-caracteres!";
    expect(firmaValida(f)).toBe(false);
    process.env.AUTH_SECRET_PREVIOUS = "secreto-de-prueba-de-32-caracteres!!";
    expect(firmaValida(f)).toBe(true);
  });

  describe("propósito dentro de la firma (revisión 2026-09-26)", () => {
    const base = {
      url: priv(),
      tomadaEn: "2026-09-26T10:00:00.000Z",
      subidaEn: "2026-09-26T10:01:00.000Z",
      por: "ana",
      lat: null,
      lng: null,
      precisionM: null,
      sellada: false,
    };
    it("una foto de la CARGA no vale como comprobante de un pago", () => {
      const carga = firmarFoto(base);
      expect(firmaValida(carga)).toBe(true);
      expect(firmaValida(carga, "comprobante")).toBe(false);
      expect(() => resolverFotosEntrantes(T, [carga], [], new Map(), "comprobante")).toThrow(FotoNoValidaError);
    });
    it("un comprobante no vale como foto de la carga, y sí como comprobante", () => {
      const comp = firmarFoto(base, "comprobante");
      expect(firmaValida(comp, "comprobante")).toBe(true);
      expect(firmaValida(comp)).toBe(false);
      expect(resolverFotosEntrantes(T, [comp], [], new Map(), "comprobante")).toEqual([comp]);
      expect(() => resolverFotosEntrantes(T, [comp], [], new Map())).toThrow(FotoNoValidaError);
    });
    it("las fotos de carga YA firmadas (formato v1) siguen valiendo para la carga", () => {
      /* Firma calculada a mano con el mensaje v1 de antes del cambio. */
      const clave = createHmac("sha256", process.env.AUTH_SECRET!).update("buleje:forestal:fotos-carga:firma:v1").digest();
      const msg = JSON.stringify(["v1", base.url, base.tomadaEn, base.subidaEn, base.por, null, null, null, false]);
      const vieja = { ...base, firma: createHmac("sha256", clave).update(msg).digest("hex") };
      expect(firmaValida(vieja)).toBe(true);
      expect(firmaValida(vieja, "comprobante")).toBe(false);
    });
  });

  describe("resolverFotosEntrantes — qué se guarda en la guía", () => {
    it("una ya guardada se conserva como está en la base, aunque el cliente la cambie", () => {
      const previa: FotoCarga = { url: priv(), por: "ana", lat: -8.38 }; // legado sin firma
      const r = resolverFotosEntrantes(T, [{ url: priv(), por: "pirata", lat: 0 }], [previa], new Map());
      expect(r).toEqual([previa]);
    });
    it("una nueva intacta entra tal como la firmó el servidor", () => {
      const f = subida();
      expect(resolverFotosEntrantes(T, [f], [], new Map())).toEqual([f]);
    });
    it("una nueva manipulada, sin firma, https u de otro tenant → FotoNoValidaError", () => {
      expect(() => resolverFotosEntrantes(T, [{ ...subida(), lat: 0 }], [], new Map())).toThrow(FotoNoValidaError);
      expect(() => resolverFotosEntrantes(T, [{ url: priv() }], [], new Map())).toThrow(/firma|coincide/);
      expect(() => resolverFotosEntrantes(T, [{ url: legado() }], [], new Map())).toThrow(FotoNoValidaError);
      expect(() => resolverFotosEntrantes(T, [{ url: priv(OTRO) }], [], new Map())).toThrow(FotoNoValidaError);
    });
    it("una privada que ya es evidencia de OTRA guía → rechazo que nombra la guía", () => {
      const f = subida();
      expect(() => resolverFotosEntrantes(T, [f], [], new Map([[f.url, "001-0000099"]]))).toThrow(/001-0000099/);
    });
  });
});

describe("pendiente «guías recibidas sin foto»", () => {
  const base: DatosPendientes = {
    ingresosPendientes: 0, fueraDePlazo: 0, guiasSinIngresar: 0, despachosSinGtf: 0,
    despachosSinAnexo: 0, corridasSinOrigen: 0, saldosNegativos: 0,
  };
  it("aparece con su conteo, lleva a Ingresos y nombra las primeras guías", () => {
    const p = pendientesDelLibro({ ...base, guiasSinFoto: 5, guiasSinFotoDetalle: [{ gtf: "A" }, { gtf: "B" }, { gtf: "C" }, { gtf: "D" }] });
    const sf = p.find((x) => x.clave === "guias-sin-foto");
    expect(sf).toMatchObject({ cantidad: 5, vista: "ingresos", urgencia: "pendiente" });
    expect(sf!.detalle).toContain("GTF A, B, C y 2 más");
  });
  it("con 0 no se muestra", () => {
    expect(pendientesDelLibro({ ...base, guiasSinFoto: 0 }).some((x) => x.clave === "guias-sin-foto")).toBe(false);
  });
  it("tieneFotos mira las dos formas", () => {
    expect(tieneFotos([legado()])).toBe(true);
    expect(tieneFotos([{ url: priv() }])).toBe(true);
    expect(tieneFotos([])).toBe(false);
    expect(tieneFotos(null)).toBe(false);
  });
});
