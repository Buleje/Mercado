// @vitest-environment jsdom
/**
 * Revisión 23-10 (el bug de Brandon): el alta se cortó DESPUÉS de llegar al
 * servidor (sin respuesta o un 5xx). Pudo quedar guardado sin que la ventana
 * lo sepa: `sinRespuesta` hace que al cerrar la lista se recargue en silencio.
 * Un 4xx dice que NO guardó: ahí no hace falta.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

const H = vi.hoisted(() => ({ crearAdelanto: vi.fn() }));
vi.mock("@/components/admin/adelantos/hooks/enviar-alta", async (original) => ({
  ...(await original<typeof import("@/components/admin/adelantos/hooks/enviar-alta")>()),
  crearAdelanto: H.crearAdelanto,
}));

import { pendientesVacios } from "@/hooks/use-campos-personalizados";
import { useGuardarAlta } from "@/components/admin/adelantos/hooks/use-guardar-alta";

const ALTA = { tipo: "adelanto" as const, body: { montoAdelantado: 500, moneda: "PEN" }, esperaRecibido: false, moverCaja: true };

function montar() {
  const onRegistrado = vi.fn();
  const r = renderHook(() => useGuardarAlta({ camposPendientes: pendientesVacios("adelanto"), onCreated: vi.fn(), onRegistrado }));
  return { ...r, onRegistrado };
}

afterEach(() => {
  cleanup();
  H.crearAdelanto.mockReset();
});

describe("useGuardarAlta: envío sin respuesta clara", () => {
  it.each([
    ["corte de red (sin status)", { ok: false, error: "No se pudo guardar. Revisa la conexión." }],
    ["error del servidor (5xx)", { ok: false, error: "No se pudo guardar (502).", status: 502 }],
  ])("%s → sinRespuesta, sin darlo por registrado", async (_caso, respuesta) => {
    H.crearAdelanto.mockResolvedValue(respuesta);
    const h = montar();
    await act(() => h.result.current.ejecutar(ALTA));
    expect(h.result.current.sinRespuesta).toBe(true);
    expect(h.result.current.registrado).toBe(false);
    expect(h.onRegistrado).not.toHaveBeenCalled();
  });

  it("un 4xx dice que no guardó: no hace falta recargar", async () => {
    H.crearAdelanto.mockResolvedValue({ ok: false, error: "Monto inválido", status: 400 });
    const h = montar();
    await act(() => h.result.current.ejecutar(ALTA));
    expect(h.result.current.sinRespuesta).toBe(false);
  });
});
