/**
 * Los hooks del patio contra la cola de verdad (IndexedDB en memoria) y un
 * servidor simulado — el camino que recorre la tablet (revisión 26-09):
 *
 *   · useActaDelConteo: el acta que quedó «en la tablet» pasa a «guardada»
 *     cuando la cola la sube (al volver a abrir y mientras está abierta), y
 *     dice el motivo si la cola la rechazó.
 *   · useMedirPatio: una recarga que salió ANTES de guardar no pisa la troza
 *     recién medida; la corrección de una troza con la medida anterior todavía
 *     en la cola va DETRÁS (no directo); y lo que la cola subió y el servidor
 *     rechazó aparece en la tanda como «No se guardó», sin PT.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { anotar, listar, sincronizar } from "@/lib/forestal/patio-cola";
import type { ConteoPatio } from "@/lib/forestal/conteo-patio";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { useActaDelConteo } from "@/components/admin/forestal/hooks/use-acta-del-conteo";
import { useMedirPatio } from "@/components/admin/forestal/hooks/use-medir-patio";
import { indexedDBEnMemoria } from "./helpers/indexeddb-en-memoria";

const URL_CONTEOS = "/api/admin/forestal/patio/conteos";
const X = "2026-09-26T14:00:00.000Z";
const T = "2026-09-26T14:30:00.000Z";
const CONTEO: ConteoPatio = {
  v: 1,
  fecha: "2026-09-26",
  iniciadoEn: X,
  quien: "Juan",
  trozas: [],
  fotoEn: X,
  truncado: false,
  lecturas: [{ trozaId: "a", codigo: "58", en: X }],
  terminadoEn: T,
};
const FIRMA = `${X}|${T}|1`;

type Ruta = (url: string, init?: RequestInit) => Response | Promise<Response>;
let ruta: Ruta;
const fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(ruta(url, init)));
const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.stubGlobal("indexedDB", indexedDBEnMemoria());
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
  ruta = () => json(200, {});
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useActaDelConteo — «en la tablet» no es para siempre", () => {
  const recordada = (estado: string) =>
    window.localStorage.setItem("conteo-patio:actas", JSON.stringify({ [X]: { firma: FIRMA, estado } }));

  it("al volver a abrir, si la cola ya la subió, dice «guardada» (no «Sin señal…») y no la reenvía", async () => {
    recordada("en-equipo");
    const { result } = renderHook(() => useActaDelConteo(CONTEO));
    await waitFor(() => expect(result.current.estado).toBe("guardada"));
    expect(JSON.parse(window.localStorage.getItem("conteo-patio:actas")!)[X].estado).toBe("guardada");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mientras sigue en la cola queda en la tablet; cuando la cola la sube, pasa a «guardada»", async () => {
    await anotar("conteo", { conteo: CONTEO }, URL_CONTEOS);
    recordada("en-equipo");
    const { result } = renderHook(() => useActaDelConteo(CONTEO));
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.estado).toBe("en-equipo");

    ruta = () => json(200, { acta: {}, creada: false, obsoleta: false });
    await act(async () => {
      await sincronizar();
    });
    await waitFor(() => expect(result.current.estado).toBe("guardada"));
  });

  it("si la cola la rechazó lo dice con el motivo, y «Reintentar» la manda y limpia la cola", async () => {
    await anotar("conteo", { conteo: CONTEO }, URL_CONTEOS);
    ruta = () => json(422, { message: "El conteo no tiene lecturas válidas." });
    await sincronizar();
    recordada("en-equipo");

    const { result } = renderHook(() => useActaDelConteo(CONTEO));
    await waitFor(() => expect(result.current.estado).toBe("error"));
    expect(result.current.mensaje).toBe("El conteo no tiene lecturas válidas.");

    ruta = () => json(201, { acta: {}, creada: true, obsoleta: false });
    act(() => result.current.reintentar());
    await waitFor(() => expect(result.current.estado).toBe("guardada"));
    expect(await listar()).toEqual([]);
  });
});

describe("useMedirPatio", () => {
  const sinMedir: TrozaConsumible = {
    id: "t1",
    woodEntryId: "we",
    codificacion: "13/A",
    codigoPlanta: "58",
    especieComun: "Tornillo",
    volumenM3: 1.2,
    gtfNumber: "001-0000201",
    oxD1Pulg: null,
    oxD2Pulg: null,
    oxLargoPies: null,
    oxPt: null,
  };
  const medida = { ...sinMedir, oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12, oxPt: 195.92 };
  const cambio = { id: "t1", oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12 };
  const esPatio = (url: string) => url.includes("/trozas/patio");

  it("una recarga que salió ANTES de guardar vuelve con la troza vieja y NO la pisa", async () => {
    let soltarSegunda: (r: Response) => void = () => undefined;
    let cargas = 0;
    ruta = (url) => {
      if (esPatio(url)) {
        cargas += 1;
        if (cargas === 1) return json(200, { trozas: [sinMedir] });
        return new Promise<Response>((r) => {
          soltarSegunda = r;
        });
      }
      return json(200, { trozas: [medida], rechazadas: [] });
    };
    const { result } = renderHook(() => useMedirPatio());
    await waitFor(() => expect(result.current.estado).toBe("listo"));

    act(() => {
      void result.current.recargar();
    });
    await act(async () => {
      await result.current.guardar(sinMedir, cambio, 195.92);
    });
    expect(result.current.trozas[0]!.oxPt).toBe(195.92);

    await act(async () => {
      soltarSegunda(json(200, { trozas: [sinMedir] }));
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(result.current.trozas[0]!.oxPt).toBe(195.92);
    expect(result.current.tanda[0]).toMatchObject({ id: "t1", estado: "guardada", pt: 195.92 });
  });

  it("anotada sin señal MIENTRAS viajaba una recarga: sigue «en la tablet», no «guardada» contra su copia", async () => {
    let soltarSegunda: (r: Response) => void = () => undefined;
    let cargas = 0;
    ruta = (url) => {
      if (!esPatio(url)) throw new TypeError("Failed to fetch");
      cargas += 1;
      if (cargas === 1) return json(200, { trozas: [sinMedir] });
      return new Promise<Response>((r) => {
        soltarSegunda = r;
      });
    };
    const { result } = renderHook(() => useMedirPatio());
    await waitFor(() => expect(result.current.estado).toBe("listo"));
    act(() => {
      void result.current.recargar();
    });
    await act(async () => {
      await result.current.guardar(sinMedir, cambio, 195.92);
    });
    await act(async () => {
      soltarSegunda(json(200, { trozas: [sinMedir] }));
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(result.current.tanda[0]).toMatchObject({ estado: "en-equipo" });
    // La lista local conserva lo anotado (la tarjeta lo muestra al reabrirla).
    expect(result.current.trozas[0]!.oxD1Pulg).toBe(18);
  });

  it("con la medida anterior todavía en la cola, la corrección va DETRÁS (no directo)", async () => {
    ruta = (url) => (esPatio(url) ? json(200, { trozas: [sinMedir] }) : json(200, { trozas: [medida], rechazadas: [] }));
    const { result } = renderHook(() => useMedirPatio());
    await waitFor(() => expect(result.current.estado).toBe("listo"));

    /* v1: el PATCH no llega (wifi sin salida) → a la cola. */
    ruta = (url) => {
      if (esPatio(url)) return json(200, { trozas: [sinMedir] });
      throw new TypeError("Failed to fetch");
    };
    await act(async () => {
      await result.current.guardar(sinMedir, cambio, 195.92);
    });
    expect(result.current.tanda[0]!.estado).toBe("en-equipo");

    /* v2: ya hay señal, pero la v1 sigue en la cola → detrás. */
    fetchMock.mockClear();
    ruta = () => json(200, { trozas: [medida], rechazadas: [] });
    let r: Awaited<ReturnType<typeof result.current.guardar>> | undefined;
    await act(async () => {
      r = await result.current.guardar(sinMedir, { ...cambio, oxD1Pulg: 19 }, 207.67);
    });
    expect(r).toMatchObject({ estado: "en-equipo" });
    expect(r && "aviso" in r ? r.aviso : null).toMatch(/detrás de la medida anterior/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await listar()).map((a) => (a.payload.trozas as { oxD1Pulg: number }[])[0]!.oxD1Pulg)).toEqual([18, 19]);
  });

  it("lo que la cola subió y el servidor rechazó aparece «No se guardó», sin PT, listo para reenviar", async () => {
    ruta = (url) => (esPatio(url) ? json(200, { trozas: [sinMedir] }) : json(200, {}));
    const { result } = renderHook(() => useMedirPatio());
    await waitFor(() => expect(result.current.estado).toBe("listo"));

    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    await act(async () => {
      await result.current.guardar(sinMedir, cambio, 195.92);
    });
    expect(result.current.tanda[0]).toMatchObject({ estado: "en-equipo", pt: 195.92 });

    vi.restoreAllMocks();
    ruta = (url) =>
      esPatio(url)
        ? json(200, { trozas: [sinMedir] })
        : json(200, { trozas: [sinMedir], rechazadas: [{ id: "t1", motivo: "Figura como no llegada al patio." }] });
    await act(async () => {
      await sincronizar();
      await result.current.recargar();
    });
    expect(result.current.tanda[0]).toMatchObject({
      estado: "rechazada",
      pt: null,
      aviso: "Figura como no llegada al patio.",
      cambio,
    });
  });
});
