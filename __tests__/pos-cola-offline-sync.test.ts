/**
 * Cola del POS sin conexión al sincronizar (revisión 17-10 del commit 1b146ad9b).
 *
 * Antes cualquier respuesta no-2xx dejaba la venta «No pasó» para siempre: con
 * el tope de 10 ventas cada 15 min por IP, una cola de 12 subía 10 y dejaba 2
 * colgadas (429); con un 504 la venta pudo guardarse y el aviso decía «vuelve a
 * anotarla» → cobro doble. Acá se prueba con un `fetch` falso (nunca contra
 * localhost: el tope es por IP y traba las ventas de los demás 15 min).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import {
  desenlaceDeRespuesta, esDelNegocio, esperaDeRetryAfter, fusionarTrasSincronizar, sincronizarCola, volverAPoner,
  type VentaEnCola,
} from "@/components/admin/pos/cola-offline";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));
// Los dos caminos de login que no escriben la cookie: sin slug.
vi.mock("@/lib/tenant-cache", () => ({ getActiveTenantSlug: () => null }));

const QUEUE_KEY = "pos-offline-queue";

function venta(clave: string, extra: Partial<VentaEnCola> = {}): VentaEnCola {
  return { items: [{ productId: 1, quantity: 1 }], payment: "efectivo", idempotencyKey: clave, _offlineId: 1, _synced: false, _tenantId: "t-1", ...extra };
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

const NEGOCIO = { tenantId: "t-1", slug: null };

describe("desenlace por respuesta", () => {
  it("sólo lo que el servidor miró y rechazó pasa a «No pasó»; lo demás sigue pendiente", () => {
    expect(desenlaceDeRespuesta(201)).toBe("guardada");
    expect(desenlaceDeRespuesta(200)).toBe("guardada");
    for (const s of [400, 409, 422, 404]) expect(desenlaceDeRespuesta(s)).toBe("no-paso");
    expect(desenlaceDeRespuesta(403, "Descuento excede 15% — requiere autorización del admin")).toBe("no-paso");
    // A todas les pasaría igual: se corta la vuelta.
    for (const s of [401, 423, 429]) expect(desenlaceDeRespuesta(s)).toBe("cortar");
    expect(desenlaceDeRespuesta(403, "CSRF token invalido o ausente. Recarga la pagina e intenta de nuevo.")).toBe("cortar");
    for (const s of [408, 500, 502, 503, 504]) expect(desenlaceDeRespuesta(s)).toBe("reintentar");
  });

  it("Retry-After en segundos o fecha, entre 1 s y 15 min; sin cabecera, 60 s", () => {
    expect(esperaDeRetryAfter("120")).toBe(120_000);
    expect(esperaDeRetryAfter(null)).toBe(60_000);
    expect(esperaDeRetryAfter("0")).toBe(1_000);
    expect(esperaDeRetryAfter("99999")).toBe(15 * 60_000);
    const ahora = Date.parse("2026-10-17T10:00:00Z");
    expect(esperaDeRetryAfter("Sat, 17 Oct 2026 10:02:00 GMT", ahora)).toBe(120_000);
    expect(esperaDeRetryAfter("mañana", ahora)).toBe(60_000);
  });
});

describe("sincronizarCola con fetch falso", () => {
  it("cola de 12 con tope de 10: la 11.ª recibe 429, se corta y las 2 quedan pendientes con su clave", async () => {
    const cola = Array.from({ length: 12 }, (_, i) => venta(`k${i + 1}`));
    let n = 0;
    const enviar = vi.fn(async () => (++n <= 10 ? json(201, { id: `s${n}` }) : json(429, { error: "Too many requests" }, { "Retry-After": "300" })));
    const r = await sincronizarCola(cola, NEGOCIO, enviar);

    expect(enviar).toHaveBeenCalledTimes(11); // la 12.ª no gasta otro intento
    expect(r.guardadas).toBe(10);
    expect(r.esperarMs).toBe(300_000);
    const quedan = fusionarTrasSincronizar(cola, r.resultados);
    expect(quedan.map((v) => [v.idempotencyKey, v._hasError ?? false])).toEqual([["k11", false], ["k12", false]]);
    expect(quedan[0]._aviso).toMatch(/esperar/);
  });

  it("504: pudo guardarse; sigue pendiente con la MISMA clave y la siguiente se manda igual", async () => {
    const cola = [venta("k1"), venta("k2")];
    const enviar = vi
      .fn<(c: Record<string, unknown>) => Promise<Response>>()
      .mockResolvedValueOnce(new Response("<html>Gateway Timeout</html>", { status: 504 }))
      .mockResolvedValueOnce(json(201, { id: "s2" }));
    const r = await sincronizarCola(cola, NEGOCIO, enviar);

    const quedan = fusionarTrasSincronizar(cola, r.resultados);
    expect(quedan).toHaveLength(1);
    expect(quedan[0]).toMatchObject({ idempotencyKey: "k1" });
    expect(quedan[0]._hasError).toBeUndefined();
    expect(quedan[0]._aviso).toMatch(/misma clave/);
    // Lo que viaja al servidor lleva la clave y ninguna marca de la cola.
    expect(enviar.mock.calls[0][0]).toEqual({ items: [{ productId: 1, quantity: 1 }], payment: "efectivo", idempotencyKey: "k1" });
  });

  it("400 de validación → «No pasó» con el motivo del servidor; sin conexión → pendiente y corta", async () => {
    const cola = [venta("k1"), venta("k2"), venta("k3")];
    const enviar = vi
      .fn<(c: Record<string, unknown>) => Promise<Response>>()
      .mockResolvedValueOnce(json(400, { error: "Stock insuficiente para Arroz" }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const r = await sincronizarCola(cola, NEGOCIO, enviar);

    expect(enviar).toHaveBeenCalledTimes(2);
    const quedan = fusionarTrasSincronizar(cola, r.resultados);
    expect(quedan.map((v) => [v.idempotencyKey, v._hasError ?? false, v._errorMessage ?? null])).toEqual([
      ["k1", true, "Stock insuficiente para Arroz"],
      ["k2", false, null],
      ["k3", false, null],
    ]);
  });

  it("401: sesión vencida → corta sin marcar nada «No pasó»", async () => {
    const cola = [venta("k1"), venta("k2")];
    const enviar = vi.fn(async () => json(401, { error: "Unauthorized" }));
    const r = await sincronizarCola(cola, NEGOCIO, enviar);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(fusionarTrasSincronizar(cola, r.resultados).every((v) => !v._hasError)).toBe(true);
  });

  it("la venta de otro negocio (por la SESIÓN, sin cookie) no se manda", async () => {
    const cola = [venta("k1", { _tenantId: "t-otro" }), venta("k2")];
    const enviar = vi.fn(async () => json(201, {}));
    await sincronizarCola(cola, NEGOCIO, enviar);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0]).toEqual([expect.objectContaining({ idempotencyKey: "k2" })]);
    // Antes, sin cookie, toda venta parecía «de este negocio».
    expect(esDelNegocio(venta("x", { _tenantId: "t-otro" }), { tenantId: "t-1", slug: null })).toBe(false);
  });
});

describe("fusionar sobre la cola de ahora", () => {
  it("lo descartado mientras se mandaba no reaparece; lo encolado o vuelto a poner, se respeta", () => {
    const noPaso = venta("k1", { _hasError: true, _errorMessage: "Stock insuficiente" });
    const pendiente = venta("k2");
    const resultados = new Map<string, VentaEnCola | null>([["k2", null]]);
    // Mientras se mandaba k2: se descartó k1 y entró k3.
    const actual = [venta("k3")];
    expect(fusionarTrasSincronizar(actual, resultados).map((v) => v.idempotencyKey)).toEqual(["k3"]);
    // Mientras se mandaba k2: se tocó «Reintentar» en k1 → sigue pendiente, no vuelve a «No pasó».
    const vuelta = volverAPoner([noPaso, pendiente], "k1");
    expect(fusionarTrasSincronizar(vuelta, resultados)).toEqual([expect.objectContaining({ idempotencyKey: "k1" })]);
    expect(fusionarTrasSincronizar(vuelta, resultados)[0]._hasError).toBeUndefined();
  });
});

describe("usePOSOffline (hook real, fetch falso)", () => {
  let postSales: (body: Record<string, unknown>) => Promise<Response>;
  const enviadas: string[] = [];

  beforeEach(() => {
    localStorage.clear();
    enviadas.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/me") return json(200, { authenticated: true, tenantId: "t-1", role: "cajero" });
      if (url === "/api/sales") {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        enviadas.push(String(body.idempotencyKey));
        return postSales(body);
      }
      throw new Error(`fetch inesperado ${url}`);
    }));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const cola = () => JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as VentaEnCola[];

  it("429 con Retry-After: queda pendiente con la misma clave y se manda SOLA al pasar la espera", async () => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify([venta("k1"), venta("k2"), venta("k3", { _tenantId: "t-otro" })]));
    let n = 0;
    postSales = async () => (++n === 2 ? json(429, { error: "Too many requests" }, { "Retry-After": "1" }) : json(201, { id: `s${n}` }));
    const { usePOSOffline } = await import("@/components/admin/pos/usePOSOffline");
    const hook = renderHook(() => usePOSOffline());

    await waitFor(() => expect(enviadas).toEqual(["k1", "k2"]));
    await waitFor(() => expect(hook.result.current.reintentaEn).not.toBeNull());
    expect(cola().map((v) => [v.idempotencyKey, v._hasError ?? false])).toEqual([["k2", false], ["k3", false]]);
    expect(hook.result.current.errorCount).toBe(0);
    expect(hook.result.current.pendingCount).toBe(1); // k3 es de otro negocio

    // Pasada la espera, el mismo k2 vuelve a salir (misma clave) y entra.
    await waitFor(() => expect(enviadas).toEqual(["k1", "k2", "k2"]), { timeout: 4_000 });
    await waitFor(() => expect(cola().map((v) => v.idempotencyKey)).toEqual(["k3"]));
    // Marcó la sesión para la próxima venta sin conexión.
    expect(localStorage.getItem("pos-offline-sesion")).toBe("t-1");
  });

  it("504 → pendiente; al sincronizar de nuevo el servidor la devuelve deduplicada y sale de la cola", async () => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify([venta("k1")]));
    postSales = async () => new Response("Gateway Timeout", { status: 504 });
    const { usePOSOffline } = await import("@/components/admin/pos/usePOSOffline");
    const hook = renderHook(() => usePOSOffline());

    await waitFor(() => expect(enviadas).toEqual(["k1"]));
    await waitFor(() => expect(hook.result.current.isSyncing).toBe(false));
    expect(cola()).toEqual([expect.objectContaining({ idempotencyKey: "k1" })]);
    expect(cola()[0]._hasError).toBeUndefined();

    postSales = async () => json(200, { id: "s1", _deduplicated: true });
    await act(async () => { await hook.result.current.syncQueue(); });
    expect(enviadas).toEqual(["k1", "k1"]);
    expect(cola()).toEqual([]);
  });

  it("«Reintentar» una «No pasó» la manda con la MISMA clave", async () => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify([venta("k1", { _hasError: true, _errorMessage: "Stock insuficiente" })]));
    postSales = async () => json(201, { id: "s1" });
    const { usePOSOffline } = await import("@/components/admin/pos/usePOSOffline");
    const hook = renderHook(() => usePOSOffline());
    await waitFor(() => expect(hook.result.current.errorCount).toBe(1));
    expect(enviadas).toEqual([]); // «No pasó» no se manda sola

    await act(async () => { hook.result.current.reintentar("k1"); });
    await waitFor(() => expect(cola()).toEqual([]));
    expect(enviadas).toEqual(["k1"]);
  });

  it("descartar mientras se sincroniza: la venta no reaparece al terminar", async () => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify([venta("k1", { _hasError: true, _errorMessage: "Stock insuficiente" }), venta("k2")]));
    let soltar: (r: Response) => void = () => undefined;
    postSales = () => new Promise<Response>((ok) => { soltar = ok; });
    const { usePOSOffline } = await import("@/components/admin/pos/usePOSOffline");
    const hook = renderHook(() => usePOSOffline());

    await waitFor(() => expect(enviadas).toEqual(["k2"]));
    act(() => { hook.result.current.descartar("k1"); });
    await act(async () => { soltar(json(201, { id: "s2" })); });
    await waitFor(() => expect(hook.result.current.isSyncing).toBe(false));
    expect(cola()).toEqual([]);
  });
});
