/**
 * useLotesAserrio con «Solo este permiso» (ADR-431, cambio C3 de la crítica).
 *
 * El patio se pide ya acotado al contrato (`?contratoId=`) sólo si el llamador
 * lo pasa: los otros cuatro consumidores llaman sin argumentos y siguen pidiendo
 * la URL de siempre. Y como `contratoId` entra en las deps de `recargar`,
 * prender y apagar el filtro rápido dispara dos pedidos: el del patio ENTERO
 * (grande, lento) no puede pisar al acotado si llega último.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { urlDelPatio, useLotesAserrio } from "@/components/admin/forestal/hooks/use-lotes-aserrio";

type Respuesta = { url: string; resolver: (body: unknown, status?: number) => void };

const troza = (id: string) => ({ id, woodEntryId: `we-${id}`, codificacion: id, especieComun: "Tornillo", volumenM3: 1 });

let pendientes: Respuesta[] = [];

beforeEach(() => {
  invalidarCtp();
  pendientes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      new Promise((resolve) => {
        pendientes.push({
          url,
          resolver: (body, status = 200) => resolve(new Response(JSON.stringify(body), { status })),
        });
      }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  invalidarCtp();
});

/** Resuelve el pedido pendiente cuya URL cumple `cond`. */
async function responder(cond: (u: string) => boolean, body: unknown) {
  const i = pendientes.findIndex((p) => cond(p.url));
  if (i < 0) throw new Error(`No hay pedido pendiente que cumpla la condición: ${pendientes.map((p) => p.url).join(", ")}`);
  const [p] = pendientes.splice(i, 1);
  await act(async () => {
    p.resolver(body);
  });
}

const esPatio = (u: string) => u.startsWith("/api/admin/forestal/trozas/patio");
const esLotes = (u: string) => u.startsWith("/api/admin/forestal/lotes-aserrio");

describe("urlDelPatio", () => {
  it("sin contrato es la URL de siempre; con contrato lleva ?contratoId", () => {
    expect(urlDelPatio(null)).toBe("/api/admin/forestal/trozas/patio");
    expect(urlDelPatio(undefined)).toBe("/api/admin/forestal/trozas/patio");
    expect(urlDelPatio("c1")).toBe("/api/admin/forestal/trozas/patio?contratoId=c1");
  });
});

describe("useLotesAserrio({ contratoId })", () => {
  it("sin argumentos pide el patio sin parámetro (los otros 4 consumidores no cambian)", async () => {
    renderHook(() => useLotesAserrio());
    await waitFor(() => expect(pendientes.some((p) => esPatio(p.url))).toBe(true));
    expect(pendientes.filter((p) => esPatio(p.url)).map((p) => p.url)).toEqual(["/api/admin/forestal/trozas/patio"]);
  });

  it("con contratoId pide el patio acotado; al pasar a null vuelve a pedirlo sin el parámetro", async () => {
    const { rerender } = renderHook(({ c }: { c: string | null }) => useLotesAserrio({ contratoId: c }), {
      initialProps: { c: "c1" as string | null },
    });
    await waitFor(() => expect(pendientes.some((p) => esPatio(p.url))).toBe(true));
    expect(pendientes.find((p) => esPatio(p.url))?.url).toBe("/api/admin/forestal/trozas/patio?contratoId=c1");

    rerender({ c: null });
    await waitFor(() =>
      expect(pendientes.some((p) => p.url === "/api/admin/forestal/trozas/patio")).toBe(true),
    );
  });

  it("prender y apagar rápido: la respuesta VIEJA del patio entero no pisa al acotado", async () => {
    const { result, rerender } = renderHook(({ c }: { c: string | null }) => useLotesAserrio({ contratoId: c }), {
      initialProps: { c: null as string | null },
    });
    await waitFor(() => expect(pendientes.some((p) => esPatio(p.url))).toBe(true));

    // Se prende «Solo este permiso» antes de que vuelva el patio entero.
    rerender({ c: "c1" });
    await waitFor(() => expect(pendientes.some((p) => p.url.endsWith("contratoId=c1"))).toBe(true));

    // Llega primero el acotado (chico, rápido)...
    await responder((u) => u.endsWith("contratoId=c1"), { trozas: [troza("del-permiso")], total: 1, devueltas: 1 });
    await responder(esLotes, { lotes: [] });
    await waitFor(() => expect(result.current.trozas.map((t) => t.id)).toEqual(["del-permiso"]));

    // ...y DESPUÉS el viejo del patio entero: no puede pisarlo.
    await responder((u) => u === "/api/admin/forestal/trozas/patio", {
      trozas: [troza("a"), troza("b"), troza("c")],
      total: 3,
      devueltas: 3,
    });
    if (pendientes.some((p) => esLotes(p.url))) await responder(esLotes, { lotes: [] });

    expect(result.current.trozas.map((t) => t.id)).toEqual(["del-permiso"]);
    expect(result.current.cargando).toBe(false);
  });

  it("un error de una carga vieja tampoco pisa el estado vigente", async () => {
    const { result, rerender } = renderHook(({ c }: { c: string | null }) => useLotesAserrio({ contratoId: c }), {
      initialProps: { c: null as string | null },
    });
    await waitFor(() => expect(pendientes.some((p) => esPatio(p.url))).toBe(true));
    rerender({ c: "c1" });
    await waitFor(() => expect(pendientes.some((p) => p.url.endsWith("contratoId=c1"))).toBe(true));

    await responder((u) => u.endsWith("contratoId=c1"), { trozas: [troza("x")], total: 1, devueltas: 1 });
    await responder(esLotes, { lotes: [] });
    await waitFor(() => expect(result.current.trozas).toHaveLength(1));

    // El viejo falla: el error es de una lectura que ya no manda.
    const i = pendientes.findIndex((p) => p.url === "/api/admin/forestal/trozas/patio");
    const [viejo] = pendientes.splice(i, 1);
    await act(async () => {
      viejo.resolver({ error: "x" }, 500);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.trozas).toHaveLength(1);
  });
});
