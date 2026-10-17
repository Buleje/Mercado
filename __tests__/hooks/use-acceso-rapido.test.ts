import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { toast } from "sonner";
import { useAccesoRapido } from "@/components/admin/documentos/explorador/use-acceso-rapido";

const A = { tipo: "carpeta" as const, id: "a", nombre: "A" };
const B = { tipo: "carpeta" as const, id: "b", nombre: "B" };

let servidor: unknown;
let putFalla: boolean;
const puts: unknown[] = [];

beforeEach(() => {
  localStorage.clear();
  puts.length = 0;
  putFalla = false;
  servidor = null;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        if (putFalla) return { ok: false, status: 500, json: async () => ({}) };
        puts.push(JSON.parse(String(init.body)).fijados);
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      return { ok: true, status: 200, json: async () => ({ fijados: servidor }) };
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("useAccesoRapido", () => {
  it("lo del servidor manda sobre la caché", async () => {
    localStorage.setItem("drive-acceso-rapido:t", JSON.stringify([A]));
    servidor = [B];
    const { result } = renderHook(() => useAccesoRapido("t"));
    expect(result.current.fijados).toEqual([A]); // caché al instante
    await waitFor(() => expect(result.current.fijados).toEqual([B]));
  });

  it("migra lo de localStorage si el servidor no tiene nada", async () => {
    localStorage.setItem("drive-acceso-rapido:t", JSON.stringify([A]));
    renderHook(() => useAccesoRapido("t"));
    await waitFor(() => expect(puts).toEqual([[A]]));
  });

  it("fijar guarda en el servidor; si falla se revierte y avisa", async () => {
    servidor = [];
    const { result } = renderHook(() => useAccesoRapido("t"));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    act(() => result.current.fijar(A));
    expect(result.current.fijados).toEqual([A]);
    await waitFor(() => expect(puts).toEqual([[A]]));

    putFalla = true;
    act(() => result.current.fijar(B));
    await waitFor(() => expect(result.current.fijados).toEqual([A]));
    expect(toast.error).toHaveBeenCalled();
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
