/**
 * `lib/admin/guardado-servidor` (noche 17-10): una sola lectura por persona y
 * carga de página, `null` (nunca guardó) distinto de `undefined` (servidor
 * caído: se sigue con lo del navegador), y la subida que espera a que dejes
 * de moverte junta varios cambios en un PUT y no sube lo que el servidor ya
 * tiene.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string>) => h }));

type Mod = typeof import("@/lib/admin/guardado-servidor");
let mod: Mod;
let fetchMock: ReturnType<typeof vi.fn>;

const respuesta = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
const puts = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PUT");

beforeEach(async () => {
  vi.resetModules();
  fetchMock = vi.fn(() => respuesta({ guardado: { "vistas:crm": [{ id: "a" }] } }));
  vi.stubGlobal("fetch", fetchMock);
  mod = await import("@/lib/admin/guardado-servidor");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("leerDelServidor", () => {
  it("una sola lectura para todos los que piden; null si nunca guardó esa clave", async () => {
    const [vistas, recientes] = await Promise.all([
      mod.leerDelServidor("t1:ana", "vistas:crm"),
      mod.leerDelServidor("t1:ana", "recientes"),
    ]);
    expect(vistas).toEqual([{ id: "a" }]);
    expect(recientes).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("servidor caído: undefined (se sigue con lo local) y el próximo montaje reintenta", async () => {
    fetchMock.mockImplementationOnce(() => respuesta({ error: "x" }, 500));
    expect(await mod.leerDelServidor("t1:ana", "recientes")).toBeUndefined();
    expect(await mod.leerDelServidor("t1:ana", "vistas:crm")).toEqual([{ id: "a" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("subirAlServidor", () => {
  it("con demora junta los cambios: un solo PUT con lo último", async () => {
    vi.useFakeTimers();
    mod.subirAlServidor("t1:ana", "recientes", [1]);
    mod.subirAlServidor("t1:ana", "recientes", [1, 2], 4000);
    mod.subirAlServidor("t1:ana", "recientes", [1, 2, 3], 4000);
    await vi.advanceTimersByTimeAsync(4000);
    expect(puts()).toHaveLength(1);
    expect(JSON.parse(String((puts()[0][1] as RequestInit).body))).toEqual({ clave: "recientes", valor: [1, 2, 3] });
  });

  it("no sube lo que el servidor ya tiene, y lo subido manda sobre una lectura que llega tarde", async () => {
    vi.useFakeTimers();
    await mod.leerDelServidor("t1:ana", "vistas:crm");
    mod.subirAlServidor("t1:ana", "vistas:crm", [{ id: "a" }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(puts()).toHaveLength(0);

    mod.subirAlServidor("t1:beto", "vistas:crm", [{ id: "nueva" }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(await mod.leerDelServidor("t1:beto", "vistas:crm")).toEqual([{ id: "nueva" }]);
  });

  it("al esconder la pestaña sale ya lo que esperaba su turno", async () => {
    vi.useFakeTimers();
    mod.subirAlServidor("t1:ana", "recientes", [9], 4000);
    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(0);
    expect(puts()).toHaveLength(1);
    expect((puts()[0][1] as RequestInit).keepalive).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(puts()).toHaveLength(1);
  });
});
