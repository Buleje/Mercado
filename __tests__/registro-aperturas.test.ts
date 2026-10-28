import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => ({ ...h, "x-csrf-token": "t" }) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import {
  DEMORA_MS,
  ESPERA_MAXIMA_MS,
  TOPE_POR_ENVIO,
  URL_USO_PANEL,
  __reiniciarRegistroParaTests,
  enviarPendientes,
  registrarApertura,
} from "@/lib/admin/registro-aperturas";
import { logger } from "@/lib/logger";

const fetchMock = vi.fn();
const enviadas = () => fetchMock.mock.calls.map(([, init]) => (JSON.parse(String(init.body)) as { claves: string[] }).claves);

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/admin?tab=config");
  fetchMock.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  __reiniciarRegistroParaTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("registrarApertura: debounce", () => {
  it("no manda nada en el momento: junta y sale en UN envío cuando dejas de moverte", () => {
    registrarApertura("ventas-caja");
    vi.advanceTimersByTime(DEMORA_MS - 1);
    registrarApertura("camaras");
    registrarApertura("ctp-libro-operaciones");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DEMORA_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(enviadas()).toEqual([["ventas-caja", "camaras", "ctp-libro-operaciones"]]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(URL_USO_PANEL);
    expect(init).toMatchObject({ method: "POST", credentials: "include", keepalive: false });
    expect(init.headers["x-csrf-token"]).toBe("t");
  });

  it(`navegando sin parar igual sale a los ${ESPERA_MAXIMA_MS / 1000} s`, () => {
    let t = 0;
    for (const clave of ["a", "b", "c", "d", "e"]) {
      registrarApertura(clave);
      vi.advanceTimersByTime(2_500);
      t += 2_500;
    }
    expect(t).toBeGreaterThanOrEqual(ESPERA_MAXIMA_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(enviadas()[0]).toEqual(["a", "b", "c", "d"]);
  });

  it(`con ${TOPE_POR_ENVIO} pendientes sale sin esperar`, () => {
    for (let i = 0; i < TOPE_POR_ENVIO; i++) registrarApertura(`tab-${i}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(enviadas()[0]).toHaveLength(TOPE_POR_ENVIO);
  });

  it("al esconder la pestaña sale ya, con keepalive", () => {
    registrarApertura("camaras");
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
  });
});

describe("registrarApertura: una vez por sesión", () => {
  it("la misma pestaña dos veces = una apertura; recargar (memoria nueva) no la repite", () => {
    registrarApertura("camaras");
    registrarApertura("camaras");
    vi.advanceTimersByTime(DEMORA_MS);
    expect(enviadas()).toEqual([["camaras"]]);

    /* Recargar la página: la memoria del módulo arranca de cero, el sessionStorage sigue. */
    __reiniciarRegistroParaTests();
    registrarApertura("camaras");
    registrarApertura("ventas-caja");
    vi.advanceTimersByTime(DEMORA_MS);
    expect(enviadas()).toEqual([["camaras"], ["ventas-caja"]]);
  });

  it("sesión nueva del navegador (sessionStorage vacío) vuelve a contar", () => {
    registrarApertura("camaras");
    vi.advanceTimersByTime(DEMORA_MS);
    sessionStorage.clear();
    __reiniciarRegistroParaTests();
    registrarApertura("camaras");
    vi.advanceTimersByTime(DEMORA_MS);
    expect(enviadas()).toEqual([["camaras"], ["camaras"]]);
  });

  it("las vistas (`tab:vista`) cuentan aparte de su pestaña", () => {
    registrarApertura("finanzas");
    registrarApertura("finanzas:gastos");
    vi.advanceTimersByTime(DEMORA_MS);
    expect(enviadas()).toEqual([["finanzas", "finanzas:gastos"]]);
  });
});

describe("registrarApertura: nunca molesta", () => {
  it("claves raras o fuera del panel no se mandan", () => {
    registrarApertura("");
    registrarApertura("../etc");
    registrarApertura("Ventas Caja");
    window.history.replaceState(null, "", "/superadmin");
    registrarApertura("camaras");
    vi.advanceTimersByTime(DEMORA_MS * 2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("en /t/<negocio>/admin sí cuenta", () => {
    window.history.replaceState(null, "", "/t/blas/admin?tab=camaras");
    registrarApertura("camaras");
    vi.advanceTimersByTime(DEMORA_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("si el servidor falla sólo se loguea (no rechaza, no reintenta)", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 429 }));
    registrarApertura("camaras");
    await expect(enviarPendientes()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith("[uso-panel] no se pudo registrar la apertura", expect.objectContaining({ claves: 1 }));
    registrarApertura("camaras");
    vi.advanceTimersByTime(DEMORA_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("enviarPendientes manda lo que esperaba y no deja el temporizador vivo", async () => {
    registrarApertura("ventas-caja");
    await enviarPendientes();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(DEMORA_MS * 2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(enviarPendientes()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
