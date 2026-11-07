// @vitest-environment node
import { createHash } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COOKIE_ENLACE,
  VIDA_COOKIE_ENLACE_SEG,
  cabeceraCookieEnlace,
  claveCoincide,
  cookieEnlaceValida,
  firmarCookieEnlace,
  rutaCookieEnlace,
} from "@/lib/documentos/clave-enlace";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const T1 = "a".repeat(48);
const T2 = "b".repeat(48);
const AHORA = Date.UTC(2026, 9, 23, 20, 0, 0);

beforeEach(() => vi.stubEnv("AUTH_SECRET", "secreto-de-prueba-de-32-caracteres!!"));
afterEach(() => vi.unstubAllEnvs());

describe("claveCoincide (mismo sha256 hex que guarda DocumentsDB)", () => {
  it("acierta la clave guardada y rechaza otra", () => {
    expect(claveCoincide(sha("qa-1234"), "qa-1234")).toBe(true);
    expect(claveCoincide(sha("qa-1234"), "qa-12345")).toBe(false);
    expect(claveCoincide(sha("qa-1234"), "")).toBe(false);
  });
  it("sin clave guardada el enlace no la pide", () => {
    expect(claveCoincide(null, "lo-que-sea")).toBe(true);
  });
  it("un hash guardado roto no abre nada (no revienta)", () => {
    expect(claveCoincide("no-es-hex", "qa-1234")).toBe(false);
    expect(claveCoincide(sha("qa-1234").slice(0, 20), "qa-1234")).toBe(false);
  });
});

describe("cookie de acceso de un enlace", () => {
  const guardado = sha("qa-1234");

  it("la firmada abre ESE enlace hasta que vence", () => {
    const v = firmarCookieEnlace("carpeta", T1, guardado, AHORA);
    expect(v).toMatch(/^\d+\.[A-Za-z0-9_-]{43}$/);
    expect(cookieEnlaceValida(v, "carpeta", T1, guardado, AHORA)).toBe(true);
    expect(cookieEnlaceValida(v, "carpeta", T1, guardado, AHORA + (VIDA_COOKIE_ENLACE_SEG - 1) * 1000)).toBe(true);
    expect(cookieEnlaceValida(v, "carpeta", T1, guardado, AHORA + VIDA_COOKIE_ENLACE_SEG * 1000)).toBe(false);
  });

  it("no sirve para otro enlace ni para un documento con el mismo token", () => {
    const v = firmarCookieEnlace("carpeta", T1, guardado, AHORA);
    expect(cookieEnlaceValida(v, "carpeta", T2, guardado, AHORA)).toBe(false);
    expect(cookieEnlaceValida(v, "documento", T1, guardado, AHORA)).toBe(false);
  });

  it("si la clave del enlace cambia, la cookie deja de servir", () => {
    const v = firmarCookieEnlace("carpeta", T1, guardado, AHORA);
    expect(cookieEnlaceValida(v, "carpeta", T1, sha("otra-clave"), AHORA)).toBe(false);
  });

  it("firma tocada, vencimiento alargado o basura: no", () => {
    const v = firmarCookieEnlace("documento", T1, guardado, AHORA) ?? "";
    const [vence, firma] = v.split(".");
    const otraLetra = firma[0] === "A" ? "B" : "A";
    expect(cookieEnlaceValida(`${vence}.${otraLetra}${firma.slice(1)}`, "documento", T1, guardado, AHORA)).toBe(false);
    expect(cookieEnlaceValida(`${Number(vence) + 86_400}.${firma}`, "documento", T1, guardado, AHORA)).toBe(false);
    expect(cookieEnlaceValida("", "documento", T1, guardado, AHORA)).toBe(false);
    expect(cookieEnlaceValida(undefined, "documento", T1, guardado, AHORA)).toBe(false);
    expect(cookieEnlaceValida("123.abc", "documento", T1, guardado, AHORA)).toBe(false);
  });

  it("firmada con otro secreto no abre (rotar AUTH_SECRET corta las cookies)", () => {
    const v = firmarCookieEnlace("carpeta", T1, guardado, AHORA);
    vi.stubEnv("AUTH_SECRET", "otro-secreto-distinto-de-32-caracteres");
    expect(cookieEnlaceValida(v, "carpeta", T1, guardado, AHORA)).toBe(false);
  });

  it("sin AUTH_SECRET falla cerrado: ni firma ni valida", () => {
    const v = firmarCookieEnlace("carpeta", T1, guardado, AHORA);
    vi.stubEnv("AUTH_SECRET", "");
    expect(firmarCookieEnlace("carpeta", T1, guardado, AHORA)).toBeNull();
    expect(cookieEnlaceValida(v, "carpeta", T1, guardado, AHORA)).toBe(false);
  });
});

describe("cabecera Set-Cookie", () => {
  it("HttpOnly + SameSite=Strict, atada a la API de ese enlace, media hora", () => {
    const c = cabeceraCookieEnlace("carpeta", T1, "1.x");
    expect(c).toBe(`${COOKIE_ENLACE}=1.x; Path=/api/public/folders/${T1}; Max-Age=1800; HttpOnly; SameSite=Strict`);
    expect(rutaCookieEnlace("documento", T2)).toBe(`/api/public/documents/${T2}`);
  });
  it("Secure en producción", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(cabeceraCookieEnlace("documento", T1, "1.x")).toMatch(/; Secure$/);
  });
});
