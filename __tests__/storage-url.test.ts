/**
 * `esUrlDeFotoPropia`/`fotosDelTenantSchema` (auditoría de seguridad 2026-09-25,
 * «Fotos de la guía»): sólo se acepta una foto que sea del storage de ESTE
 * tenant. `z.string().url()` de Zod 4 aceptaba `javascript:`/`data:`/`file:` y
 * cualquier `https://` externa — este es el candado que lo reemplaza.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { esUrlDeFotoPropia, exigirFotosPropias, fotosDelTenantSchema, prefijoDeFotosDelTenant } from "@/lib/storage-url";

const TENANT = "cmt_este_tenant";
const OTRO_TENANT = "cmt_otro_tenant";
const BASE = "https://sofkgguriggocouiuamx.supabase.co";
const urlPropia = (tenantId = TENANT) => `${BASE}/storage/v1/object/public/media/${tenantId}/forestal/1790000000000-foto.webp`;

let previo: string | undefined;
beforeEach(() => {
  previo = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = BASE;
});
afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = previo;
});

describe("esUrlDeFotoPropia", () => {
  it("acepta la URL real que emite /api/upload para este tenant", () => {
    expect(esUrlDeFotoPropia(urlPropia(), TENANT)).toBe(true);
  });

  it("rechaza javascript: — Zod .url() lo dejaba pasar", () => {
    expect(esUrlDeFotoPropia("javascript:alert(1)", TENANT)).toBe(false);
  });

  it("rechaza data: y file:", () => {
    expect(esUrlDeFotoPropia("data:text/html,<script>alert(1)</script>", TENANT)).toBe(false);
    expect(esUrlDeFotoPropia("file:///etc/passwd", TENANT)).toBe(false);
  });

  it("rechaza una https:// externa (aunque sea una URL válida)", () => {
    expect(esUrlDeFotoPropia("https://evil.example.com/foto.jpg", TENANT)).toBe(false);
  });

  it("rechaza el storage de OTRO tenant — mismo bucket, prefijo distinto", () => {
    expect(esUrlDeFotoPropia(urlPropia(OTRO_TENANT), TENANT)).toBe(false);
  });

  it("rechaza http:// (no https) aunque el resto del path coincida", () => {
    expect(esUrlDeFotoPropia(urlPropia().replace("https://", "http://"), TENANT)).toBe(false);
  });

  it("sin NEXT_PUBLIC_SUPABASE_URL configurada, no acepta nada (fail closed)", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    expect(esUrlDeFotoPropia(urlPropia(), TENANT)).toBe(false);
  });
});

describe("prefijoDeFotosDelTenant", () => {
  it("arma el prefijo exacto de /api/upload", () => {
    expect(prefijoDeFotosDelTenant(TENANT)).toBe(`${BASE}/storage/v1/object/public/media/${TENANT}/`);
  });
});

describe("fotosDelTenantSchema", () => {
  it("acepta un array con sólo fotos propias", () => {
    const r = fotosDelTenantSchema(TENANT).safeParse([urlPropia(), urlPropia()]);
    expect(r.success).toBe(true);
  });

  it("rechaza si UNA sola foto del array no es propia", () => {
    const r = fotosDelTenantSchema(TENANT).safeParse([urlPropia(), "javascript:alert(1)"]);
    expect(r.success).toBe(false);
  });

  it("respeta el tope (10 por defecto)", () => {
    const r = fotosDelTenantSchema(TENANT).safeParse(Array.from({ length: 11 }, () => urlPropia()));
    expect(r.success).toBe(false);
  });
});

describe("exigirFotosPropias", () => {
  it("no tira con fotos propias o lista vacía/null", () => {
    expect(() => exigirFotosPropias(TENANT, [urlPropia()])).not.toThrow();
    expect(() => exigirFotosPropias(TENANT, [])).not.toThrow();
    expect(() => exigirFotosPropias(TENANT, null)).not.toThrow();
  });

  it("tira si alguna foto no es de este tenant", () => {
    expect(() => exigirFotosPropias(TENANT, [urlPropia(OTRO_TENANT)])).toThrow();
  });
});
