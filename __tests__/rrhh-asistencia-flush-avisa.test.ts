import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { avisarFallos, useRrhhAsistencia } from "@/hooks/use-rrhh-asistencia";
import type { HojaAsistenciaDTO } from "@/lib/rrhh/tipos";

/**
 * ALTO 5 (revisión 2026-09-14): un envío de asistencia que falla podía quedar
 * invisible — `flush()` no avisaba nada aparte de `erroresPorCelda`, y esa
 * celda deja de estar en pantalla en cuanto se cambia de día/mes o se
 * desmonta el componente. Estos tests prueban el mecanismo (no el navegador):
 * `guardarAhora()`/`flush()` devuelven los fallos para que quien navega los
 * avise con `avisarFallos()`, y el flush del cleanup de desmontar (nadie lo
 * espera) se avisa SOLO.
 *
 * Control negativo: sin el arreglo, `guardarAhora()` devolvía `Promise<void>`
 * y `avisarFallos` no existía — este archivo ni compilaría.
 */

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function hojaDe(desde: string, hasta: string): HojaAsistenciaDTO {
  return {
    nivel: "completo",
    hoy: "2026-09-11",
    desde,
    hasta,
    ventana: { desde: null, hasta: "2026-09-11" },
    colaboradores: [
      { id: "c1", nombre: "Ana", apodo: null, puesto: null, estado: "ACTIVO", fechaIngreso: null, fechaCese: null },
    ],
    marcas: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("use-rrhh-asistencia — un flush que falla nunca queda invisible (ALTO 5)", () => {
  it("guardarAhora() devuelve el fallo (fecha + motivo) para que quien navega lo avise con avisarFallos()", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => hojaDe("2026-09-11", "2026-09-11") }) // GET inicial
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: "fuera_de_ventana",
          errores: [{ colaboradorId: "c1", fecha: "2026-09-11", motivo: "fuera_de_ventana", message: "Sólo puedes corregir desde el martes 09/09" }],
        }),
      }); // PUT del flush
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useRrhhAsistencia("2026-09-11", "2026-09-11"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.marcar({ colaboradorId: "c1", fecha: "2026-09-11", estado: "PRESENTE" });
    });

    // `guardarAhora()` es lo que llaman `cambiarDia`/`cambiarMes` ANTES de
    // irse — acá lo llamamos directo para probar el mecanismo sin montar
    // HojaDelDia/HojaDelMes enteros (el status 403 no es 422, así que cae en
    // la rama "else" del flush, no en la de `errores[]`).
    let resultado: Awaited<ReturnType<typeof result.current.guardarAhora>> | undefined;
    await act(async () => {
      resultado = await result.current.guardarAhora();
    });

    expect(resultado?.ok).toBe(false);
    expect(resultado?.fallos).toEqual([{ fecha: "2026-09-11", motivo: "No se pudo guardar" }]);
    // El hook NO se avisa solo mientras sigue montado — es responsabilidad
    // de quien navega, que sabe que se está yendo de esa fecha.
    expect(toast.error).not.toHaveBeenCalled();

    act(() => {
      avisarFallos(resultado!.fallos);
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
    const mensaje = vi.mocked(toast.error).mock.calls[0][0] as string;
    expect(mensaje).toContain("No se guardó 1 marca del");
    expect(mensaje).toContain("No se pudo guardar");
  });

  it("si el flush de desmontar (fire-and-forget) falla, el hook se avisa SOLO — nadie más lo espera", async () => {
    let resolverPut!: (v: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    const putPromise = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((res) => {
      resolverPut = res;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => hojaDe("2026-09-11", "2026-09-11") }) // GET inicial
      .mockReturnValueOnce(putPromise); // PUT del flush — se resuelve DESPUÉS del unmount
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useRrhhAsistencia("2026-09-11", "2026-09-11"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      // Queda en el buffer con el debounce de 800ms corriendo — nadie llama
      // guardarAhora(): el usuario cambió de pestaña del panel antes de que
      // el debounce dispare solo.
      result.current.marcar({ colaboradorId: "c1", fecha: "2026-09-11", estado: "PRESENTE" });
    });

    unmount(); // dispara el cleanup: bufferRef.current.size > 0 → void flush()

    await act(async () => {
      resolverPut({ ok: false, status: 500, json: async () => ({ error: "error_desconocido" }) });
      // deja correr los microtasks del flush ya en vuelo
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toast.error).toHaveBeenCalledTimes(1);
    const mensaje = vi.mocked(toast.error).mock.calls[0][0] as string;
    expect(mensaje).toContain("No se guardó 1 marca del");
    expect(mensaje).toContain("No se pudo guardar");
  });
});
