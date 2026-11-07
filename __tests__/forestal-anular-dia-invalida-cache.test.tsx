/**
 * Revisión 23-09 (hallazgo 1): después de anular el día, el Libro de atrás relee
 * con `ctpGet`, que reusa 8 s lo recién traído. Sin invalidar, la tabla y los
 * KPIs seguían mostrando las corridas como «registrado». Es la refutación del
 * revisor con la expectativa dada vuelta: ahora el Libro VUELVE a pedir.
 */
import { expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("@/components/admin/shared/ConfirmDialog", () => ({
  useConfirm: () => ({
    prompt: async () => "motivo de prueba",
    notice: async () => {},
    confirm: async () => true,
  }),
}));
import { useAnularDiaDeProduccion } from "@/components/admin/forestal/hooks/use-anular-dia";
import { ctpGet } from "@/lib/forestal/ctp-fetch";

const URL_LIBRO = "/api/admin/forestal/ctp?section=produccion&periodo=2026-09";

it("tras anular, la lista del Libro se vuelve a pedir y ve la corrida anulada", async () => {
  let entradasLeidas = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith("/api/admin/forestal/ctp?section=")) {
      entradasLeidas++;
      return new Response(
        JSON.stringify({
          entries: [{ id: "c1", status: entradasLeidas === 1 ? "registrado" : "anulado" }],
        }),
      );
    }
    if (u.includes("anular-dia") && (!init || !init.method || init.method === "GET")) {
      return new Response(
        JSON.stringify({
          dia: "2026-09-17",
          periodoCerrado: null,
          corridas: [{ id: "c1", lineNo: 30, especie: "Tornillo", bloqueos: [] }],
          total: { corridas: 1, pt: 424, m3: 1, piezas: 10 },
          duenos: [],
        }),
      );
    }
    if (u.includes("anular-dia") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          dia: "2026-09-17",
          anuladas: [{ id: "c1", lineNo: 30, especie: "Tornillo" }],
          total: { corridas: 1, pt: 424, m3: 1, piezas: 10 },
        }),
      );
    }
    throw new Error("url inesperada " + u);
  });
  vi.stubGlobal("fetch", fetchMock);

  // El Libro de atrás ya cargó (montaje).
  const antes = await ctpGet<{ entries: { status: string }[] }>(URL_LIBRO);
  expect(antes.entries[0]!.status).toBe("registrado");

  let despues: { entries: { status: string }[] } | null = null;
  const { result } = renderHook(() =>
    useAnularDiaDeProduccion({
      onAnulado: () => {
        void ctpGet<{ entries: { status: string }[] }>(URL_LIBRO).then((j) => {
          despues = j;
        });
      },
    }),
  );
  await act(async () => {
    await result.current.anularDia("2026-09-17");
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  expect(
    fetchMock.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === "POST"),
  ).toBe(true);
  expect(entradasLeidas).toBe(2);
  expect(despues!.entries[0]!.status).toBe("anulado");
  vi.unstubAllGlobals();
});
