/**
 * useSemaforoPermiso (`hooks/use-semaforo-permiso.ts`) — lo que queda por
 * producir del permiso ACTIVO, para el chip de la banda.
 *
 * Cada pedido queda pendiente hasta que el test lo resuelve (mismo patrón que
 * `__tests__/carga-vieja-contratos-ctp.test.tsx`): el orden de llegada lo
 * decide el test, no la red.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSemaforoPermiso } from "@/hooks/use-semaforo-permiso";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";

const BASE = "/api/admin/forestal/contratos";
const urlDe = (id: string) => `${BASE}/${encodeURIComponent(id)}?volumen=totales`;
const totales = (saldoPt: number, aserrablePt = 10_000) => ({ totales: { aserrablePt, saldoPt } });

type Pendiente = { url: string; resolver: (cuerpo: unknown) => void };
let pendientes: Pendiente[] = [];

beforeEach(() => {
  pendientes = [];
  invalidarCtp();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string) =>
        new Promise((resolve) => {
          pendientes.push({
            url,
            resolver: (cuerpo) => resolve({ ok: true, status: 200, json: async () => cuerpo }),
          });
        }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  invalidarCtp();
});

const de = (url: string) => pendientes.filter((p) => p.url === url);

async function resolver(p: Pendiente | undefined, cuerpo: unknown) {
  if (!p) throw new Error("el pedido todavía no salió");
  await act(async () => {
    p.resolver(cuerpo);
  });
}

describe("useSemaforoPermiso — carga vieja", () => {
  it("una carga vieja del permiso ANTERIOR no pisa el semáforo del permiso actual", async () => {
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useSemaforoPermiso(id), {
      initialProps: { id: "ctr_a" as string | null },
    });
    await waitFor(() => expect(de(urlDe("ctr_a"))).toHaveLength(1));

    // El operador cambia de permiso en el chip ANTES de que vuelva "ctr_a".
    rerender({ id: "ctr_b" });
    await waitFor(() => expect(de(urlDe("ctr_b"))).toHaveLength(1));

    // Vuelve primero la del permiso NUEVO: 20 % → ajustado.
    await resolver(de(urlDe("ctr_b"))[0], totales(2_000));
    expect(result.current.semaforo?.nivel).toBe("ajustado");

    // Recién ahora vuelve "ctr_a", tarde: NO puede pintar el semáforo de "ctr_b".
    await resolver(de(urlDe("ctr_a"))[0], totales(9_000));
    expect(result.current.semaforo?.nivel).toBe("ajustado");
  });

  it("al cambiar de permiso, el semáforo del ANTERIOR se limpia de inmediato (no queda «excedido» de A bajo el código de B)", async () => {
    // Revisor 2026-09-25: reprodujo que, cambiando de un permiso EXCEDIDO a
    // otro mientras el segundo todavía carga, el chip seguía mostrando el
    // "excedido" del primero bajo el código del nuevo permiso.
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useSemaforoPermiso(id), {
      initialProps: { id: "ctr_a" as string | null },
    });
    await waitFor(() => expect(de(urlDe("ctr_a"))).toHaveLength(1));
    await resolver(de(urlDe("ctr_a"))[0], totales(-800)); // permiso A: excedido
    expect(result.current.semaforo?.nivel).toBe("excedido");

    // Cambia a B; el pedido de B todavía NO volvió.
    rerender({ id: "ctr_b" });
    await waitFor(() => expect(de(urlDe("ctr_b"))).toHaveLength(1));

    // Mientras B carga, no puede seguir mostrando el "excedido" de A.
    expect(result.current.semaforo).toBeNull();

    await resolver(de(urlDe("ctr_b"))[0], totales(6_000)); // B: holgado
    expect(result.current.semaforo?.nivel).toBe("holgado");
  });

  it("CONTROL: sin cambio de permiso de por medio, la respuesta se aplica normal", async () => {
    const { result } = renderHook(() => useSemaforoPermiso("ctr_solo"));
    await waitFor(() => expect(de(urlDe("ctr_solo"))).toHaveLength(1));
    await resolver(de(urlDe("ctr_solo"))[0], totales(6_000));
    expect(result.current.semaforo?.nivel).toBe("holgado");
    expect(result.current.semaforo?.quedaPct).toBe(60);
  });
});

describe("useSemaforoPermiso — sin permiso, sin ruido, foco", () => {
  it("sin permiso activo (null) no pide nada y deja el semáforo vacío", () => {
    const { result } = renderHook(() => useSemaforoPermiso(null));
    expect(result.current.semaforo).toBeNull();
    expect(result.current.cargando).toBe(false);
    expect(pendientes).toHaveLength(0);
  });

  it("un pedido que falla deja sin barra, sin romper el hook (es apoyo, no un error del operador)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 500, json: async () => ({}) })),
    );
    const { result } = renderHook(() => useSemaforoPermiso("ctr_error"));
    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.semaforo).toBeNull();
  });

  it("vuelve a pedir al recuperar el foco de la pestaña", async () => {
    const { result } = renderHook(() => useSemaforoPermiso("ctr_focus"));
    await waitFor(() => expect(de(urlDe("ctr_focus"))).toHaveLength(1));
    await resolver(de(urlDe("ctr_focus"))[0], totales(6_000));
    expect(result.current.semaforo?.nivel).toBe("holgado");

    // `ctpGet` sirve lo mismo 8 s sin volver a pedir (ADR-347): se invalida a
    // mano para simular que ya pasó ese tiempo, como cualquier otra pantalla
    // del libro tras una escritura.
    invalidarCtp();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(de(urlDe("ctr_focus"))).toHaveLength(2));
    await resolver(de(urlDe("ctr_focus"))[1], totales(500));
    expect(result.current.semaforo?.nivel).toBe("porAcabarse");
  });
});
