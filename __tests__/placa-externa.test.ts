/**
 * lib/integrations/placa-peru (29-09-2026) — SUNARP vía json.pe.
 *
 * La respuesta de ejemplo es la del OpenAPI publicado en docs.json.pe
 * (`/api-consulta/endpoint/placa`, leído el 29-09-2026). Si el proveedor cambia
 * la forma, el parser devuelve `null` y la consulta termina en «error», nunca
 * en una excepción ni en un «no existe» falso.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  /** La caché (placa → respuesta) y el uso del negocio, en memoria. */
  cache: new Map<string, unknown>(),
  set: vi.fn(),
  reservas: [] as string[],
  liberadas: 0,
  topeAlcanzado: null as null | "dia" | "mes" | "global",
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/integrations/placa-peru-store", () => ({
  leerCachePlaca: async (placa: string) => H.cache.get(placa) ?? null,
  guardarCachePlaca: async (placa: string, v: unknown) => {
    H.set(placa, v);
    H.cache.set(placa, v);
  },
  topeConsultas: () => ({ dia: 10, mes: 60, mesGlobal: 20 }),
  reservarConsulta: async (tenantId: string) => {
    if (H.topeAlcanzado) {
      const tope = { dia: 10, mes: 60, global: 20 }[H.topeAlcanzado];
      return { ok: false, alcanzado: H.topeAlcanzado, tope };
    }
    H.reservas.push(tenantId);
    return {
      ok: true,
      usados: { dia: H.reservas.length, mes: H.reservas.length },
      liberar: async () => {
        H.liberadas++;
      },
    };
  },
}));

import { consultarPlacaExterna, parsearRespuestaJsonPe } from "@/lib/integrations/placa-peru";

const EJEMPLO = {
  success: true,
  message: "exito",
  data: {
    placa: "F3H792",
    marca: "FIAT",
    modelo: "FIORINO",
    serie: "9BD25521A98854312",
    color: "BLANCO BANCHISA",
    motor: "8632404",
    vin: "9BD25521A98854312",
  },
};

describe("parsearRespuestaJsonPe", () => {
  it("lee la respuesta documentada", () => {
    expect(parsearRespuestaJsonPe(EJEMPLO, "F3H792")).toEqual({
      tipo: "datos",
      datos: {
        placa: "F3H792",
        marca: "FIAT",
        modelo: "FIORINO",
        color: "BLANCO BANCHISA",
        serie: "9BD25521A98854312",
        motor: "8632404",
        vin: "9BD25521A98854312",
      },
    });
  });

  it("success:false = no la tiene (no es un error)", () => {
    expect(parsearRespuestaJsonPe({ success: false, message: "No se encontraron resultados" }, "W2D853")).toEqual({
      tipo: "sin_datos",
      mensaje: "No se encontraron resultados",
    });
  });

  it("números y guiones sueltos se leen sin tirar; «-» es nada", () => {
    const r = parsearRespuestaJsonPe({ success: true, data: { marca: "VOLVO", modelo: "-", motor: 12345, color: null } }, "W2D853");
    expect(r).toEqual({
      tipo: "datos",
      datos: { placa: "W2D853", marca: "VOLVO", modelo: null, color: null, serie: null, motor: "12345", vin: null },
    });
  });

  it("éxito sin marca ni modelo no identifica a nadie", () => {
    expect(parsearRespuestaJsonPe({ success: true, data: { placa: "W2D853" } }, "W2D853")).toEqual({ tipo: "sin_datos", mensaje: null });
  });

  it.each([null, "html", 42, { ok: true }, { success: "si" }, { success: true }, { success: true, data: [1, 2] }])(
    "forma desconocida (%j) → null, sin tirar",
    (raro) => {
      expect(parsearRespuestaJsonPe(raro, "W2D853")).toBeNull();
    },
  );
});

describe("consultarPlacaExterna", () => {
  const fetchMock = vi.fn();
  const AHORA = Date.parse("2026-09-29T15:00:00Z");

  beforeEach(() => {
    H.cache.clear();
    H.set.mockReset();
    H.reservas = [];
    H.liberadas = 0;
    H.topeAlcanzado = null;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("PLACA_API_TOKEN", "token-de-prueba");
    vi.stubEnv("PLACA_API_PROVIDER", "");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sin clave no sale a la red", async () => {
    vi.stubEnv("PLACA_API_TOKEN", "");
    expect(await consultarPlacaExterna("t-blas", "W2D853", AHORA)).toEqual({ estado: "sin_clave" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("consulta con Bearer + body { placa } y guarda 30 días", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(EJEMPLO), { status: 200 }));
    const r = await consultarPlacaExterna("t-blas", "F3H792", AHORA);
    expect(r).toMatchObject({ estado: "encontrada", desdeCache: false, datos: { marca: "FIAT", modelo: "FIORINO" } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.json.pe/api/placa");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-de-prueba");
    expect(JSON.parse(String(init.body))).toEqual({ placa: "F3H792" });
    await vi.waitFor(() => expect(H.set).toHaveBeenCalledWith("F3H792", expect.objectContaining({ encontrada: true })));
  });

  it("la segunda vez sale de la caché, sin gastar créditos", async () => {
    H.cache.set("F3H792", { consultadoEn: "2026-09-10T00:00:00.000Z", encontrada: true, datos: { ...EJEMPLO.data } });
    const r = await consultarPlacaExterna("t-blas", "F3H792", AHORA);
    expect(r).toMatchObject({ estado: "encontrada", desdeCache: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("la caché vence: encontrada a los 30 días, «no la tiene» a los 7", async () => {
    H.cache.set("F3H792", { consultadoEn: "2026-08-29T00:00:00.000Z", encontrada: true, datos: { ...EJEMPLO.data } });
    H.cache.set("W2D853", { consultadoEn: "2026-09-21T00:00:00.000Z", encontrada: false, datos: null });
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(EJEMPLO), { status: 200 }));
    await consultarPlacaExterna("t-blas", "F3H792", AHORA);
    await consultarPlacaExterna("t-blas", "W2D853", AHORA);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("json.pe contesta 404 con success:false → no_encontrada (y se recuerda)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: false, message: "no encontrado" }), { status: 404 }));
    expect(await consultarPlacaExterna("t-blas", "W2D853", AHORA)).toMatchObject({ estado: "no_encontrada" });
    await vi.waitFor(() => expect(H.set).toHaveBeenCalledWith("W2D853", expect.objectContaining({ encontrada: false })));
  });

  it("5xx con success:false es una caída, no «no existe»: error y sin caché", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: false, message: "error interno" }), { status: 503 }));
    expect(await consultarPlacaExterna("t-blas", "W2D853", AHORA)).toMatchObject({ estado: "error", credenciales: false });
    expect(H.set).not.toHaveBeenCalled();
  });

  it("clave rechazada → «La clave de SUNARP fue rechazada», sin caché", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    expect(await consultarPlacaExterna("t-blas", "W2D853", AHORA)).toEqual({
      estado: "error",
      credenciales: true,
      motivo: "La clave de SUNARP fue rechazada: revisa PLACA_API_TOKEN.",
    });
    expect(H.set).not.toHaveBeenCalled();
  });

  it.each([402, 429])("%i → «La cuenta de consultas se quedó sin créditos»", async (status) => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status }));
    expect(await consultarPlacaExterna("t-blas", "W2D853", AHORA)).toMatchObject({
      estado: "error",
      motivo: "La cuenta de consultas se quedó sin créditos.",
    });
  });

  it("forma desconocida con 200 → error, no «no existe»", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ resultado: "ok" }), { status: 200 }));
    expect(await consultarPlacaExterna("t-blas", "W2D853", AHORA)).toMatchObject({ estado: "error", credenciales: false });
    expect(H.set).not.toHaveBeenCalled();
  });

  it("la red cae → error, sin tirar", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await consultarPlacaExterna("t-blas", "W2D853", AHORA)).toMatchObject({ estado: "error" });
  });

  it("cada consulta paga se cuenta al negocio que busca; la caché no", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(EJEMPLO), { status: 200 }));
    await consultarPlacaExterna("t-blas", "F3H792", AHORA);
    await vi.waitFor(() => expect(H.set).toHaveBeenCalled());
    await consultarPlacaExterna("t-blas", "F3H792", AHORA);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(H.reservas).toEqual(["t-blas"]);
  });

  it("tope alcanzado → estado «tope» con la línea, sin salir a la red", async () => {
    H.topeAlcanzado = "dia";
    const r = await consultarPlacaExterna("t-blas", "W2D853", AHORA);
    expect(r).toMatchObject({ estado: "tope", alcanzado: "dia", tope: 10 });
    expect(r.estado === "tope" && r.motivo).toMatch(/10 consultas a SUNARP de hoy.*guías y el Directorio/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con el tope alcanzado, lo que ya está en caché sigue saliendo", async () => {
    H.topeAlcanzado = "mes";
    H.cache.set("F3H792", { consultadoEn: "2026-09-20T00:00:00.000Z", encontrada: true, datos: { ...EJEMPLO.data } });
    expect(await consultarPlacaExterna("t-blas", "F3H792", AHORA)).toMatchObject({ estado: "encontrada", desdeCache: true });
  });

  /*
   * Antes el 401 NO se devolvía (este test afirmaba lo contrario). Se cambió
   * (2.º revisor, 29-09): el proveedor no cobra una clave rechazada ni una
   * cuenta sin créditos, y contarlas gastaba el tope del negocio — tras 10
   * búsquedas con la clave vencida la pantalla decía «ya se usaron las 10 de
   * hoy» y escondía que el problema era la clave.
   */
  it("lo que el proveedor no cobra (5xx, red caída, 401, 402, 429) se devuelve al tope", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 502 }));
    await consultarPlacaExterna("t-blas", "W2D853", AHORA);
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await consultarPlacaExterna("t-blas", "W2D853", AHORA);
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    await consultarPlacaExterna("t-blas", "W2D853", AHORA);
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 402 }));
    await consultarPlacaExterna("t-blas", "W2D853", AHORA);
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 429 }));
    await consultarPlacaExterna("t-blas", "W2D853", AHORA);
    expect(H.reservas).toHaveLength(5);
    expect(H.liberadas).toBe(5);
  });

  it("lo que el proveedor SÍ contestó (datos o «no la tiene») queda gastado", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(EJEMPLO), { status: 200 }));
    await consultarPlacaExterna("t-blas", "F3H792", AHORA);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: false, message: "no" }), { status: 404 }));
    await consultarPlacaExterna("t-blas", "W2D853", AHORA);
    expect(H.reservas).toHaveLength(2);
    expect(H.liberadas).toBe(0);
  });

  it("tope de la cuenta entera (global) → lo dice aparte del del negocio", async () => {
    H.topeAlcanzado = "global";
    const r = await consultarPlacaExterna("t-blas", "W2D853", AHORA);
    expect(r).toMatchObject({ estado: "tope", alcanzado: "global", tope: 20 });
    expect(r.estado === "tope" && r.motivo).toMatch(/20 consultas a SUNARP del mes de la cuenta/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("soloCache (el negocio ya sabe la marca): no reserva ni sale a la red → «omitida»", async () => {
    expect(await consultarPlacaExterna("t-blas", "W2D853", AHORA, { soloCache: true })).toEqual({
      estado: "omitida",
      motivo: "Tus guías ya traen la marca de esta placa: no se gastó una consulta a SUNARP.",
    });
    expect(H.reservas).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("soloCache con la placa en caché: se muestra lo que dijo SUNARP antes", async () => {
    H.cache.set("F3H792", { consultadoEn: "2026-09-20T00:00:00.000Z", encontrada: true, datos: { ...EJEMPLO.data } });
    expect(await consultarPlacaExterna("t-blas", "F3H792", AHORA, { soloCache: true })).toMatchObject({ estado: "encontrada", desdeCache: true });
  });

  it("un proveedor que no existe no sale a la red", async () => {
    vi.stubEnv("PLACA_API_PROVIDER", "otro");
    expect(await consultarPlacaExterna("t-blas", "W2D853", AHORA)).toMatchObject({ estado: "error", credenciales: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
