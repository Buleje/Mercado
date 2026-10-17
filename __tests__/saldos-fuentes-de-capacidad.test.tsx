/**
 * useFuentesDeCapacidad — «Solo este permiso» en Saldos (ADR-431, C3/C5).
 *
 * Al prender el interruptor salen dos tandas de pedidos: la del patio entero
 * (grande y lenta) y la acotada (chica y rápida). Si la lenta llega última no
 * puede pisar a la acotada: la pantalla mostraría toda la planta con el
 * interruptor diciendo «Solo este permiso». Y los lotes, que la ruta no acota,
 * se recortan acá por el código del permiso.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFuentesDeCapacidad } from "@/components/admin/forestal/hooks/use-fuentes-de-capacidad";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";

const PERIODO = {
  label: "Jul–Set 2026",
  from: "2026-07-01",
  to: "2026-09-30",
} as unknown as CtpPeriod;

const troza = (id: string, permiso: string) => ({
  id,
  codigoPlanta: id,
  permiso,
  volumenM3: 1,
  guiaRecepcionada: true,
});

const lote = (id: string, permisos: string[]) => ({
  id,
  code: id,
  speciesCommon: "TORNILLO",
  status: "abierto",
  fechaApertura: "2026-09-20",
  piezas: permisos.length,
  volumenM3: permisos.length,
  trozas: permisos.map((p, i) => ({
    id: `${id}-${i}`,
    codificacion: null,
    codigoPlanta: null,
    volumenM3: 1,
    permiso: p,
  })),
});

type Pendiente = { url: string; resolver: (cuerpo: unknown) => void };
let pendientes: Pendiente[] = [];

function responder(url: RegExp, cuerpo: unknown) {
  const i = pendientes.findIndex((p) => url.test(p.url));
  if (i < 0) throw new Error(`no hay pedido para ${url}`);
  const [p] = pendientes.splice(i, 1);
  p.resolver(cuerpo);
}

beforeEach(() => {
  invalidarCtp();
  pendientes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string) =>
        new Promise((resolve) =>
          pendientes.push({
            url,
            resolver: (cuerpo) => resolve({ ok: true, status: 200, json: async () => cuerpo }),
          }),
        ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  invalidarCtp();
});

describe("useFuentesDeCapacidad", () => {
  it("la respuesta vieja del patio entero no pisa la acotada al permiso", async () => {
    const { result, rerender } = renderHook(
      (p: { contratoFiltro: string | null; codigoContrato: string | null }) =>
        useFuentesDeCapacidad({ period: PERIODO, ...p }),
      {
        initialProps: { contratoFiltro: null, codigoContrato: null } as {
          contratoFiltro: string | null;
          codigoContrato: string | null;
        },
      },
    );
    await waitFor(() => expect(pendientes.some((p) => p.url.includes("/trozas/patio"))).toBe(true));

    // Se prende «Solo este permiso» antes de que llegue el patio entero.
    rerender({ contratoFiltro: "c1", codigoContrato: "CON-1" });
    await waitFor(() =>
      expect(pendientes.some((p) => p.url.includes("/trozas/patio?contratoId=c1"))).toBe(true),
    );

    await act(async () => {
      responder(/trozas\/patio\?contratoId=c1/, { trozas: [troza("a", "CON-1")] });
    });
    await act(async () => {
      // La lenta, la de toda la planta, llega DESPUÉS.
      responder(/trozas\/patio$/, {
        trozas: [troza("a", "CON-1"), troza("b", "OTRO"), troza("c", "OTRO")],
      });
    });

    await waitFor(() => expect(result.current.estado.patio).toBe("ok"));
    expect(result.current.patio.map((t) => t.id)).toEqual(["a"]);
  });

  it("pendientes y corridas viajan con contratoId; los lotes se acotan por el código", async () => {
    const { result } = renderHook(() =>
      useFuentesDeCapacidad({ period: PERIODO, contratoFiltro: "c1", codigoContrato: "CON-1" }),
    );
    await waitFor(() => expect(pendientes.length).toBeGreaterThanOrEqual(4));
    const urls = pendientes.map((p) => p.url);
    expect(
      urls.some((u) => u.includes("wood-entries?status=pendiente") && u.includes("contratoId=c1")),
    ).toBe(true);
    expect(urls.some((u) => u.includes("disponibles=1") && u.includes("contratoId=c1"))).toBe(true);
    // La ruta de lotes no lee el id: se pide igual que siempre.
    expect(urls).toContain("/api/admin/forestal/lotes-aserrio");

    await act(async () => {
      responder(/lotes-aserrio/, {
        lotes: [
          lote("propio", ["CON-1"]),
          lote("ajeno", ["OTRO"]),
          lote("mezcla", ["CON-1", "OTRO"]),
        ],
      });
    });
    await waitFor(() => expect(result.current.estado.lotes).toBe("ok"));
    expect(result.current.lotes.map((l) => l.id)).toEqual(["propio"]);
    expect(result.current.lotesMezclados).toBe(1);
  });

  it("apagado, pide la URL de siempre y no recorta lotes", async () => {
    const { result } = renderHook(() =>
      useFuentesDeCapacidad({ period: PERIODO, contratoFiltro: null, codigoContrato: null }),
    );
    await waitFor(() => expect(pendientes.length).toBeGreaterThanOrEqual(4));
    expect(pendientes.map((p) => p.url)).toContain("/api/admin/forestal/trozas/patio");
    expect(pendientes.every((p) => !p.url.includes("contratoId"))).toBe(true);

    await act(async () => {
      responder(/lotes-aserrio/, { lotes: [lote("propio", ["CON-1"]), lote("ajeno", ["OTRO"])] });
    });
    await waitFor(() => expect(result.current.lotes).toHaveLength(2));
  });
});
