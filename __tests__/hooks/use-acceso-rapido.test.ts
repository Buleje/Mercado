// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { toast } from "sonner";
import { useAccesoRapido } from "@/components/admin/documentos/explorador/use-acceso-rapido";
import { cachedJson, instalarInvalidacionPorEscritura, invalidateCachedJson } from "@/lib/client-cache-fetch";
import { fijadosGuardados, guardarFijados, olvidarFijados } from "@/lib/documentos/cache-fijados-cliente";

const A = { tipo: "carpeta" as const, id: "a", nombre: "A" };
const B = { tipo: "carpeta" as const, id: "b", nombre: "B" };
const LEGADO = "drive-acceso-rapido:t";

let servidor: unknown;
let putFalla: boolean;
let yo: Record<string, unknown> = {};
let pedir = vi.fn(responder);
const puts: unknown[] = [];

function responder(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status }));
  if (url === "/api/auth/me") return json(yo);
  if (init?.method === "PUT") {
    if (putFalla) return json({}, 500);
    puts.push(JSON.parse(String(init.body)).fijados);
    return json({ ok: true });
  }
  if (init?.method === "POST") return json({ ok: true });
  return json({ fijados: servidor });
}

async function entrarComo(username: string, role: string) {
  yo = { authenticated: true, tenantId: "t1", username, role };
  invalidateCachedJson("/api/auth/me");
  await cachedJson("/api/auth/me");
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  invalidateCachedJson();
  olvidarFijados();
  puts.length = 0;
  putFalla = false;
  servidor = null;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  pedir = vi.fn(responder);
  vi.stubGlobal("fetch", pedir);
  // El envoltorio que avisa de entrar/salir (en tests no se instala solo).
  vi.stubEnv("NODE_ENV", "development");
  Reflect.deleteProperty(window, Symbol.for("bsm.cachedJson.invalidaAlEscribir"));
  instalarInvalidacionPorEscritura();
  await entrarComo("ana", "cajero");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("useAccesoRapido", () => {
  it("lo del servidor manda sobre la caché de la pestaña", async () => {
    guardarFijados([A]);
    servidor = [B];
    const { result } = renderHook(() => useAccesoRapido("t"));
    expect(result.current.fijados).toEqual([A]); // caché al instante
    await waitFor(() => expect(result.current.fijados).toEqual([B]));
  });

  it("si el servidor no tiene nada, sube lo de ESTA persona", async () => {
    guardarFijados([A]);
    renderHook(() => useAccesoRapido("t"));
    await waitFor(() => expect(puts).toEqual([[A]]));
  });

  it("lo que dejó otro en este navegador no se pinta ni se sube (PC de caja)", async () => {
    // Lo de antes del 16-10, sin dueño, en localStorage.
    localStorage.setItem(LEGADO, JSON.stringify([A]));
    // Y la caché de la pestaña de la dueña que salió sin cerrarla.
    await entrarComo("duena", "admin");
    guardarFijados([B]);
    await entrarComo("beto", "cajero");

    const { result } = renderHook(() => useAccesoRapido("t"));
    expect(result.current.fijados).toEqual([]);
    await waitFor(() => expect(pedir).toHaveBeenCalledWith("/api/admin/preferences/fijados-drive", expect.anything()));
    await act(async () => {
      await new Promise((ok) => setTimeout(ok, 10));
    });
    expect(result.current.fijados).toEqual([]);
    expect(puts).toEqual([]);
    expect(sessionStorage.getItem("archivo:v1:fijados")).toBeNull();
    expect(localStorage.getItem(LEGADO)).not.toBeNull(); // queda para que la adopte la dueña
  });

  it("la dueña adopta lo que quedó sin dueño y lo saca de localStorage", async () => {
    localStorage.setItem(LEGADO, JSON.stringify([A]));
    await entrarComo("duena", "admin");
    const { result } = renderHook(() => useAccesoRapido("t"));
    await waitFor(() => expect(puts).toEqual([[A]]));
    expect(result.current.fijados).toEqual([A]);
    await waitFor(() => expect(localStorage.getItem(LEGADO)).toBeNull());
  });

  it("fijar no escribe nombres en localStorage; salir borra la caché", async () => {
    servidor = [];
    const { result } = renderHook(() => useAccesoRapido("t"));
    await waitFor(() => expect(pedir).toHaveBeenCalledWith("/api/admin/preferences/fijados-drive", expect.anything()));
    act(() => result.current.fijar(A));
    await waitFor(() => expect(puts).toEqual([[A]]));
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.getItem("archivo:v1:fijados")).toContain("t1|ana|cajero");

    await window.fetch("/api/auth/logout", { method: "POST" });
    expect(sessionStorage.getItem("archivo:v1:fijados")).toBeNull();
    await entrarComo("ana", "cajero");
    expect(fijadosGuardados()).toBeNull();
  });

  it("fijar guarda en el servidor; si falla se revierte y avisa", async () => {
    servidor = [];
    const { result } = renderHook(() => useAccesoRapido("t"));
    await waitFor(() => expect(pedir).toHaveBeenCalledWith("/api/admin/preferences/fijados-drive", expect.anything()));
    act(() => result.current.fijar(A));
    expect(result.current.fijados).toEqual([A]);
    await waitFor(() => expect(puts).toEqual([[A]]));

    putFalla = true;
    act(() => result.current.fijar(B));
    await waitFor(() => expect(result.current.fijados).toEqual([A]));
    expect(toast.error).toHaveBeenCalled();
  });

  it("una migración caída no frena el próximo fijar", async () => {
    guardarFijados([A]);
    putFalla = true;
    const { result } = renderHook(() => useAccesoRapido("t"));
    await waitFor(() => expect(console.warn).toHaveBeenCalledWith("[acceso-rapido] migrar falló", expect.anything()));
    putFalla = false;
    act(() => result.current.fijar(B));
    await waitFor(() => expect(puts).toEqual([[A, B]]));
    expect(result.current.fijados).toEqual([A, B]);
  });

  it("descarta carpetas que ya no existen sin escribir al servidor", async () => {
    servidor = [A, B];
    const { result } = renderHook(() => useAccesoRapido("t"));
    await waitFor(() => expect(result.current.fijados).toEqual([A, B]));
    act(() => result.current.podarCarpetas((id) => id === "b"));
    expect(result.current.fijados).toEqual([B]);
    expect(puts).toEqual([]);
  });
});
