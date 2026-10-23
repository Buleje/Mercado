// @vitest-environment node
/**
 * La bajada de media de Meta con tope y sin regalar el token (revisión de
 * seguridad de «papeles por WhatsApp», 2026-10-22):
 *  - sin `content-length`, el tope se mira MIENTRAS se lee, no al final;
 *  - cada redirección se revalida (https + host de Meta) antes de mandarle el
 *    token; afuera de Meta, se corta.
 * La red está simulada: con un token falso la Graph API real responde 401.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { bajarMediaConTope } = await import("@/lib/whatsapp/bot-dueno");

const LOOKASIDE = "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1";
type Llamada = { url: string; auth: boolean; redirect?: RequestRedirect };
let llamadas: Llamada[] = [];

/** Cuerpo que entrega `partes` trozos de `tam` bytes y cuenta cuántos se leyeron. */
function cuerpoEnTrozos(partes: number, tam: number) {
  const leidos = { n: 0 };
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      if (leidos.n >= partes) return c.close();
      leidos.n++;
      c.enqueue(new Uint8Array(tam).fill(0xff));
    },
  });
  return { stream, leidos };
}

function red(respuestas: Record<string, () => Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      llamadas.push({ url, auth: new Headers(init?.headers).has("authorization"), redirect: init?.redirect });
      const r = respuestas[url];
      if (!r) throw new Error(`fetch inesperado a ${url}`);
      return r();
    }),
  );
}

const info = (extra: Record<string, unknown> = {}) => () =>
  Response.json({ url: LOOKASIDE, mime_type: "image/jpeg", ...extra });

beforeEach(() => {
  llamadas = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bajarMediaConTope", () => {
  it("sin content-length corta apenas pasa el tope (no lee todo)", async () => {
    const { stream, leidos } = cuerpoEnTrozos(1000, 1024); // 1 MB si se leyera entero
    red({
      "https://graph.facebook.com/v19.0/123": info(),
      [LOOKASIDE]: () => new Response(stream, { status: 200, headers: { "content-type": "image/jpeg" } }),
    });
    const r = await bajarMediaConTope("123", "tok", 10 * 1024);
    expect(r).toEqual({ ok: false, motivo: "grande" });
    expect(leidos.n).toBeLessThan(20);
  });

  it("bajo el tope entrega los bytes", async () => {
    const { stream } = cuerpoEnTrozos(3, 100);
    red({
      "https://graph.facebook.com/v19.0/123": info(),
      [LOOKASIDE]: () => new Response(stream, { status: 200 }),
    });
    const r = await bajarMediaConTope("123", "tok", 10 * 1024);
    expect(r.ok && r.bytes.length).toBe(300);
  });

  it("la Graph API se pide sin seguir redirecciones", async () => {
    red({
      "https://graph.facebook.com/v19.0/123": info(),
      [LOOKASIDE]: () => new Response("x", { status: 200 }),
    });
    await bajarMediaConTope("123", "tok", 1024);
    expect(llamadas[0]).toMatchObject({ redirect: "error" });
    expect(llamadas[1]).toMatchObject({ url: LOOKASIDE, redirect: "manual", auth: true });
  });

  it("redirección dentro de Meta: se sigue, con el token", async () => {
    const cdn = "https://scontent.xx.fbcdn.net/v/archivo.jpg";
    red({
      "https://graph.facebook.com/v19.0/123": info(),
      [LOOKASIDE]: () => new Response(null, { status: 302, headers: { location: cdn } }),
      [cdn]: () => new Response("foto", { status: 200 }),
    });
    const r = await bajarMediaConTope("123", "tok", 1024);
    expect(r.ok && r.bytes.toString()).toBe("foto");
    expect(llamadas.at(-1)).toMatchObject({ url: cdn, auth: true });
  });

  it("redirección afuera de Meta: se corta y el token no sale", async () => {
    red({
      "https://graph.facebook.com/v19.0/123": info(),
      [LOOKASIDE]: () => new Response(null, { status: 302, headers: { location: "https://atacante.example/robar" } }),
    });
    expect(await bajarMediaConTope("123", "tok", 1024)).toEqual({ ok: false, motivo: "fallo" });
    expect(llamadas.some((l) => l.url.includes("atacante"))).toBe(false);
  });

  it("la URL que da Meta tiene que ser https y de Meta", async () => {
    red({ "https://graph.facebook.com/v19.0/123": info({ url: "http://lookaside.fbsbx.com/x" }) });
    expect(await bajarMediaConTope("123", "tok", 1024)).toEqual({ ok: false, motivo: "fallo" });
    expect(llamadas).toHaveLength(1);
  });

  it("file_size de más: ni se baja", async () => {
    red({ "https://graph.facebook.com/v19.0/123": info({ file_size: 5000 }) });
    expect(await bajarMediaConTope("123", "tok", 1024)).toEqual({ ok: false, motivo: "grande" });
    expect(llamadas).toHaveLength(1);
  });
});
