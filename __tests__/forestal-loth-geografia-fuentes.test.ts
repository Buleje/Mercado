/**
 * Las salidas a internet de la geografía, con servicios LENTOS simulados
 * (29-09-2026). Vercel corta la ruta a los 30 s: OpenStreetMap tiene que
 * rendirse dentro de su presupuesto aunque los tres espejos estén colgados, y
 * la altitud tiene que devolver lo que llegó (con huecos) en vez de esperar a
 * la tanda que no contesta.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { consultarElevaciones, pedirGrilla, pedirOverpass } from "@/lib/forestal/loth-geografia-fuentes";
import type { Bbox } from "@/lib/forestal/loth-geografia";

const bbox: Bbox = { sur: -9.8, oeste: -74.81, norte: -9.79, este: -74.8 };
const overpassOk = JSON.stringify({
  elements: [{ type: "way", tags: { waterway: "river" }, geometry: [{ lat: -9.795, lon: -74.815 }, { lat: -9.795, lon: -74.795 }] }],
});

/** Una respuesta que llega a los `ms`, o nunca (null): en los dos casos respeta el abort como fetch. */
function lento(signal: AbortSignal | undefined | null, ms: number | null, cuerpo: () => Response): Promise<Response> {
  return new Promise((resolve, reject) => {
    const t = ms == null ? null : setTimeout(() => resolve(cuerpo()), ms);
    signal?.addEventListener("abort", () => {
      if (t) clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pedirOverpass con presupuesto", () => {
  it("el principal colgado: a los `relevoMs` entra el siguiente espejo y gana el que contesta", async () => {
    const llamados: { url: string; t: number }[] = [];
    const t0 = Date.now();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        llamados.push({ url, t: Date.now() - t0 });
        if (url === "https://a/api") return lento(init?.signal, null, () => new Response("{}"));
        return lento(init?.signal, 30, () => new Response(overpassOk, { status: 200 }));
      }),
    );
    const r = await pedirOverpass(bbox, { presupuestoMs: 1_000, relevoMs: 100, espejos: ["https://a/api", "https://b/api", "https://c/api"] });
    expect(r?.espejo).toBe("https://b/api");
    expect(r?.rios).toHaveLength(1);
    expect(Date.now() - t0).toBeLessThan(600);
    expect(llamados.map((l) => l.url)).toEqual(["https://a/api", "https://b/api"]);
    expect(llamados[1].t).toBeGreaterThanOrEqual(80);
  });

  it("si el principal FALLA (504), el siguiente entra en el acto, sin esperar el relevo", async () => {
    const t0 = Date.now();
    let tB = -1;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "https://a/api") return new Response("<html>too busy</html>", { status: 504 });
        tB = Date.now() - t0;
        return lento(init?.signal, 10, () => new Response(overpassOk, { status: 200 }));
      }),
    );
    const r = await pedirOverpass(bbox, { presupuestoMs: 1_000, relevoMs: 500, espejos: ["https://a/api", "https://b/api"] });
    expect(r?.espejo).toBe("https://b/api");
    expect(tB).toBeLessThan(100);
  });

  it("los tres colgados: se rinde AL PRESUPUESTO con null (nunca espera más)", async () => {
    const t0 = Date.now();
    const f = vi.fn((_url: string, init?: RequestInit) => lento(init?.signal, null, () => new Response("{}")));
    vi.stubGlobal("fetch", f);
    const r = await pedirOverpass(bbox, { presupuestoMs: 400, relevoMs: 100, espejos: ["https://a/api", "https://b/api", "https://c/api"] });
    const ms = Date.now() - t0;
    expect(r).toBeNull();
    expect(ms).toBeGreaterThanOrEqual(380);
    expect(ms).toBeLessThan(700);
    expect(f).toHaveBeenCalledTimes(3);
  });
});

describe("altitud con presupuesto", () => {
  it("una tanda colgada deja sus puntos en null y el resto llega a tiempo", async () => {
    const puntos = Array.from({ length: 250 }, (_, i): [number, number] => [-9.8 + i * 1e-5, -74.8]);
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        const k = n++;
        const cant = new URL(url).searchParams.get("latitude")?.split(",").length ?? 0;
        // La segunda tanda (puntos 100-199) no contesta nunca.
        return lento(init?.signal, k === 1 ? null : 20, () => new Response(JSON.stringify({ elevation: Array(cant).fill(300 + k) }), { status: 200 }));
      }),
    );
    const t0 = Date.now();
    const v = await consultarElevaciones(puntos, { presupuestoMs: 300 });
    expect(Date.now() - t0).toBeLessThan(700);
    expect(v).not.toBeNull();
    expect(v?.slice(0, 100).every((x) => x != null)).toBe(true);
    expect(v?.slice(100, 200).every((x) => x == null)).toBe(true);
    expect(v?.slice(200).every((x) => x != null)).toBe(true);
  });

  it("todas colgadas: null al presupuesto", async () => {
    vi.stubGlobal("fetch", vi.fn((_u: string, init?: RequestInit) => lento(init?.signal, null, () => new Response("{}"))));
    const t0 = Date.now();
    expect(await consultarElevaciones([[-9.8, -74.8], [-9.81, -74.8]], { presupuestoMs: 200 })).toBeNull();
    expect(Date.now() - t0).toBeLessThan(600);
  });

  it("la grilla dice cuántos puntos faltaron", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        const k = n++;
        const cant = new URL(url).searchParams.get("latitude")?.split(",").length ?? 0;
        return lento(init?.signal, k === 0 ? null : 10, () => new Response(JSON.stringify({ elevation: Array(cant).fill(250) }), { status: 200 }));
      }),
    );
    // ~1,1 km de lado → 13 × 13 = 169 puntos, dos tandas; la primera (100) no llega.
    const r = await pedirGrilla(bbox, { presupuestoMs: 250 });
    expect(r.total).toBeGreaterThan(100);
    expect(r.faltan).toBe(100);
    expect(r.grilla).not.toBeNull();
  });
});
